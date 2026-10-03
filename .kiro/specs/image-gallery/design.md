# Design Document: image-gallery

## Overview

The `image-gallery` feature is the public, read-only browsing experience for BearCam Companion v2. It renders a paginated grid of webcam snapshots at `/`, lets anonymous visitors filter by year / camera feed / bear presence and search by bear name or number, and opens an individual image at `/images/[id]` with AI-detected bounding boxes overlaid and labeled with their crowd-sourced consensus identification. Visitors can page through adjacent images from the detail view, and the gallery preserves active filters, search, pagination, and scroll position when returning from a detail page.

The feature builds entirely on the scaffolding delivered by the `project-setup` spec — it defines **no backend resources**. All data access is read-only through the AppSync public API key, routed through typed helpers in `src/lib/amplify/`. Pages are Server Components by default; `'use client'` is scoped to the interactive controls (filter/search inputs, pagination controls, bounding-box overlay layer, scroll restoration).

### Design Tensions Resolved Up Front

Two requirements collide with the Amplify Data (AppSync/DynamoDB) query model, and the whole design turns on how they are reconciled:

1. **Page-number Query_State vs. token-only pagination.** Requirements 6.1 and 6.6 model pagination as a 1-based page number clamped against a "total available page count." The Amplify Data client [has no API to get a total page count and cannot query by page number — only by `nextToken` cursor](https://docs.amplify.aws/react/build-a-backend/data/query-data/). The design bridges these by walking the `nextToken` cursor chain forward from the newest record to the requested page, materializing the page index into a cursor on the server. The URL still carries a human-friendly `page` number (Requirement 6.1); the server translates it into cursor walks.

2. **Ordering by `date desc, id desc` and `camFeed`/`bearCount` filters vs. DynamoDB scan semantics.** Deterministic ordering with a sort key requires a secondary index; filters applied to a `list()` scan do not guarantee ordering. The design adds secondary indexes (see Data Models) so ordering is index-backed and `sortDirection: 'DESC'` is honored, with equality filters (`camFeed`) expressed as index hash keys where it pays off and residual filters (`bearCount`, `bearList` search) applied as `filter` predicates.

> **Scope note.** Items 1 and 2 above require small additions to `amplify/data/resource.ts` (secondary indexes). `project-setup` owns that file. This spec specifies the exact index additions it needs in [Data Models](#data-models) and flags them as a dependency; if the indexes are not added, the design documents the pure-scan fallback and its ordering caveat.

---

## Architecture

### Request / Data Flow

```
┌───────────────────────────────────────────────────────────────────────┐
│ Browser                                                                 │
│  Gallery_Page /?year=&feed=&bears=&q=&page=                             │
│  Image_Detail_Page /images/[id]?<same Query_State carried forward>      │
└───────────────┬─────────────────────────────────────┬──────────────────┘
                │ initial SSR render                   │ client interactions
                │ (Server Component)                   │ (filter/search/paginate)
┌───────────────▼──────────────────────────┐   ┌───────▼──────────────────┐
│ Server Components                         │   │ Client Components         │
│  - app/(public)/page.tsx  (Gallery)       │   │  - GalleryControls        │
│  - app/(public)/images/[id]/page.tsx      │   │  - FilterControls         │
│    (Detail)                               │   │  - SearchControl          │
│  fetch via server Amplify helpers         │   │  - PaginationControls     │
└───────────────┬──────────────────────────┘   │  - BoundingBoxLayer        │
                │                                │  - ScrollRestorer         │
                │ runWithAmplifyServerContext    │  push URL via useRouter   │
┌───────────────▼──────────────────────────────┴──────────────────────────┐
│ src/lib/amplify/  (typed helpers — apiKey auth, read-only)                │
│  gallery.ts: listImagesPage(), resolvePageCursor(), getImageWithObjects(),│
│              getAdjacentImageIds()                                         │
│  query-state.ts: parseQueryState(), buildFilter(), toSearchParams()        │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ GraphQL (AppSync) — API key
┌───────────────▼───────────────────────────────────────────────────────────┐
│ AWS AppSync → DynamoDB (Image, Object)                                      │
│  list queries (limit + nextToken + sortDirection + filter), get by id       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Rendering Strategy

| Concern | Component kind | Rationale |
|---|---|---|
| Page root (`/`, `/images/[id]`) | **Server Component** | Initial data fetch runs server-side (Req 7.5, 8.3); fast mobile first paint (Req 8.6). |
| Image grid markup | Server Component | Pure markup from server-fetched data. |
| Filter / search / pagination controls | **Client Component** (`'use client'`) | Need `useRouter`, `useSearchParams`, input state. The `'use client'` boundary is scoped to these controls only, never the page root (Req 8.3). |
| Bounding-box overlay layer | **Client Component** | Must measure the rendered image box to position overlays responsively (Req 4.2). |
| Scroll restoration | **Client Component** | Reads/writes `sessionStorage` and sets `window.scrollTo` on return (Req 6.7). |

Server Components read via `runWithAmplifyServerContext`; the few places that re-fetch on the client (e.g. prev/next prefetch, retry) use the browser `client`. Both come from `src/lib/amplify` (Req 7.1).

### Routing

```
src/app/
├── (public)/
│   ├── page.tsx                 # Gallery_Page — Server Component
│   ├── loading.tsx              # Grid loading indicator (Req 1.8)
│   ├── error.tsx                # Grid error state + retry (Req 1.11, 7.6) — 'use client'
│   └── images/
│       └── [id]/
│           ├── page.tsx         # Image_Detail_Page — Server Component
│           ├── loading.tsx      # Detail loading indicator
│           ├── not-found.tsx    # 404 for unknown id (Req 4.6)
│           └── error.tsx        # Detail error state (Req 4.8, 5.7) — 'use client'
```

Route-group `(public)` requires no auth. `loading.tsx`/`error.tsx`/`not-found.tsx` are the App Router's built-in Suspense/error/not-found conventions and satisfy the loading / error / not-found acceptance criteria without hand-rolled state machines.

---

## Components and Interfaces

### Query_State module — `src/lib/gallery/query-state.ts`

The single source of truth for encoding/decoding/validating the Query_State. Pure functions, no Next.js imports, independently unit- and property-testable.

```typescript
import type { CamFeed } from '@/lib/constants';

export const PAGE_SIZE = 24;              // Req 1.2
export const MAX_SEARCH_LENGTH = 100;     // Req 3.1, 3.8
export const BEAR_PRESENCE_VALUES = ['any', 'with', 'without'] as const;

export type BearPresence = (typeof BEAR_PRESENCE_VALUES)[number];

/** Normalized, always-valid gallery state. The rest of the app only ever sees this shape. */
export type QueryState = {
  year: number | null;        // null = all years
  feed: CamFeed | null;       // null = all feeds
  bears: BearPresence;        // defaults to 'any'
  q: string;                  // trimmed search term, '' = no search
  page: number;               // 1-based, >= 1 (not yet clamped to total)
};

export const DEFAULT_QUERY_STATE: QueryState = {
  year: null, feed: null, bears: 'any', q: '', page: 1,
};

/**
 * Parse raw URL search params into a normalized QueryState. NEVER throws and
 * NEVER produces an invalid field: unrecognized / malformed values fall back to
 * their default, so a bad URL degrades to the default unfiltered state rather
 * than blocking browsing (Req 6.5). An over-length search term is dropped to ''
 * (Req 6.5). page < 1 or non-integer becomes 1 (final clamp to the last page
 * happens later, once the page count is known — Req 6.6).
 */
export function parseQueryState(raw: Record<string, string | string[] | undefined>): QueryState;

/** Serialize a QueryState back to a URLSearchParams, omitting default-valued keys
 *  so the default state produces a clean, empty query string. */
export function toSearchParams(state: QueryState): URLSearchParams;

/** Clamp a 1-based page to [1, max(totalPages, 1)] (Req 6.6). */
export function clampPage(page: number, totalPages: number): number;

/** Validate/normalize a raw search term: trim, treat empty/whitespace as cleared
 *  (Req 3.7), reject (return { ok:false }) when it exceeds MAX_SEARCH_LENGTH
 *  (Req 3.8). */
export function normalizeSearchTerm(
  raw: string,
): { ok: true; term: string } | { ok: false; reason: 'too-long' };
```

### Search / filter logic — `src/lib/gallery/filter.ts`

Pure predicates and token matching, independent of AppSync so they are property-testable and reusable for any residual client-side matching.

```typescript
/**
 * Returns true iff at least one comma-delimited token of `bearList` contains
 * `term` as a case-insensitive substring. Matching never spans the comma
 * separator (Req 3.2). Empty/undefined bearList never matches a non-empty term.
 */
export function bearListMatches(bearList: string | null | undefined, term: string): boolean;

/** True iff an ISO datetime falls within [Jan 1 00:00:00.000, Dec 31 23:59:59.999]
 *  of `year`, evaluated in UTC (Req 2.5). */
export function isInUtcYear(isoDate: string | null | undefined, year: number): boolean;

/** Bear-presence predicate over a (possibly null) bearCount (Req 2.7–2.9). */
export function matchesBearPresence(bearCount: number | null | undefined, bears: BearPresence): boolean;
```

### AppSync gallery helpers — `src/lib/amplify/gallery.ts`

All data access goes through here (Req 7.1), always with `authMode: 'apiKey'` (Req 7.2), read-only (Req 7.3, 7.4).

```typescript
import type { Schema } from '../../../amplify/data/resource';

export type ImageModel = Schema['Image']['type'];
export type ObjectModel = Schema['Object']['type'];

export type ImagePage = {
  images: ImageModel[];        // up to PAGE_SIZE, in date desc / id desc order
  hasNextPage: boolean;        // true iff a further page exists (Req 1.5/1.6)
  nextToken: string | null;    // cursor to the page after this one
  requestedPageEmpty: boolean; // true iff page index was beyond the data (Req 1.9)
};

/**
 * Translate a 1-based page number into the AppSync cursor for that page by
 * walking the nextToken chain forward from the first page under the active
 * filter/order. Returns the cursor for the requested page plus the highest page
 * index actually reachable (used to clamp — Req 6.6). Short-circuits when the
 * chain is exhausted before the requested page (Req 1.9).
 */
export function resolvePageCursor(
  filter: GalleryFilter,
  page: number,
): Promise<{ token: string | null; lastPage: number; reachedRequested: boolean }>;

/** Fetch exactly one page of images under the active filter/order (Req 1.1, 2.*, 3.2). */
export function listImagesPage(filter: GalleryFilter, token: string | null): Promise<ImagePage>;

/** Fetch one Image and its Objects by id (Req 4.1); null when no record exists (Req 4.6). */
export function getImageWithObjects(id: string): Promise<ImageWithObjects | null>;

/**
 * Resolve the ids of the images immediately newer and older than `currentId`
 * under the active ordering and filter (Req 5.2, 5.3). A null on either side
 * means the current image is the newest/oldest edge (Req 5.4, 5.5).
 */
export function getAdjacentImageIds(
  filter: GalleryFilter,
  currentId: string,
): Promise<{ newerId: string | null; olderId: string | null }>;
```

`GalleryFilter` is the AppSync-shaped filter object produced from a `QueryState`:

```typescript
export type GalleryFilter = {
  camFeed: CamFeed | null;
  yearRange: { fromIso: string; toIso: string } | null; // UTC year bounds (Req 2.5)
  bears: BearPresence;
  q: string;
};

/** Build the AppSync `filter` predicate + sort inputs from a GalleryFilter.
 *  camFeed → eq; yearRange → date between; bears → bearCount ge 1 / eq 0 / omitted;
 *  q → bearList contains(term). Combined with AND (Req 2.10, 3.3). */
export function buildFilter(f: GalleryFilter): object;
```

> **`bearList` search caveat.** AppSync `contains` on the denormalized `bearList` string is a case-sensitive substring over the *entire* string and would wrongly match across comma boundaries and ignore case. The helper therefore uses `contains` with a **lowercased** mirror field as a coarse pre-filter when available, then applies `bearListMatches()` (the exact, comma-aware, case-insensitive predicate) as a residual filter on the returned page before it is rendered. If no lowercased mirror field exists, the design falls back to fetching candidate pages and applying `bearListMatches()` entirely in the helper. Either way `bearListMatches()` is the authority for correctness (Req 3.2), and the frontend never relies on raw `contains` semantics.

### React components

Per conventions: named exports, no default exports except Next.js page/layout/loading/error files; `<Image>` for all images; `<Link>` for internal nav; Tailwind utilities only; `cn()` for conditional classes; Lucide icons.

| Component | File | Kind | Props | Responsibility |
|---|---|---|---|---|
| `GalleryPage` | `app/(public)/page.tsx` | Server (default export) | `{ searchParams }` | Parse Query_State, resolve cursor, fetch page, render grid + controls. |
| `ImageGrid` | `components/images/image-grid.tsx` | Server | `{ images: ImageModel[] }` | Responsive grid (Req 8.1); maps to `ImageCard`. |
| `ImageCard` | `components/images/image-card.tsx` | Server | `{ image: ImageModel; href: string }` | Thumbnail `<Image>` + `date`/`camFeed`/`bearCount` (Req 1.3, 1.4). |
| `GalleryControls` | `components/images/gallery-controls.tsx` | Client | `{ state: QueryState; years: number[] }` | Owns URL writes; composes filter/search/clear. |
| `FilterControls` | `components/images/filter-controls.tsx` | Client | `{ state; years; onChange }` | Year / feed / bear-presence selects (Req 2.1–2.4, 2.13). |
| `SearchControl` | `components/images/search-control.tsx` | Client | `{ value; onSubmit }` | Text input, length guard + message (Req 3.1, 3.8). |
| `PaginationControls` | `components/images/pagination-controls.tsx` | Client | `{ page; hasNextPage; hasPrevPage }` | Prev/next with disabled edges (Req 1.5–1.7). |
| `GalleryEmptyState` | `components/images/gallery-empty-state.tsx` | Server | `{ variant }` | Distinct no-match / no-images / page-beyond messages (Req 1.9, 1.10, 7.7). |
| `ImageDetail` | `app/(public)/images/[id]/page.tsx` | Server (default export) | `{ params; searchParams }` | Fetch image+objects, render full image + overlays + metadata + nav. |
| `BoundingBoxLayer` | `components/bears/bounding-box-layer.tsx` | Client | `{ objects: ObjectModel[] }` | Measure rendered image, draw overlays (Req 4.2, 4.3). |
| `BoundingBox` | `components/bears/bounding-box.tsx` | Client | `{ rect; object }` | One rectangle + `ConsensusLabel`. |
| `ConsensusLabel` | `components/bears/consensus-label.tsx` | Server-safe | `{ consensusName; totalVotes }` | Name + votes, or placeholder when null (Req 4.4, 4.5). |
| `ImageNav` | `components/images/image-nav.tsx` | Client | `{ newerId; olderId; query }` | Prev/next `<Link>`s carrying Query_State; disabled at edges (Req 5.1, 5.4–5.6). |
| `ScrollRestorer` | `components/images/scroll-restorer.tsx` | Client | `{ stateKey }` | Save/restore grid scroll keyed by Query_State (Req 6.7). |

---

## Data Models

This feature consumes the existing `Image` and `Object` models (and transitively `Identification` via the Lambda-maintained consensus fields) defined in `amplify/data/resource.ts` by `project-setup`. It introduces no new models and writes nothing (Req 7.3, 7.4).

Generated types are consumed, never duplicated (conventions, Req 7 intent):

```typescript
import type { Schema } from '../../../amplify/data/resource';
type ImageModel  = Schema['Image']['type'];
type ObjectModel = Schema['Object']['type'];
```

### Fields consumed

| Model | Fields read | Used for |
|---|---|---|
| `Image` | `id`, `url`, `date`, `s3Key`, `bearCount`, `bearList`, `camFeed` | Grid card, ordering, filters, search, detail metadata |
| `Object` | `id`, `label`, `width`, `height`, `left`, `top`, `consensusName`, `totalVotes` | Bounding-box overlays and consensus labels (Bear objects only) |

### Secondary index dependency (owned by `project-setup`)

To honor the `date desc, id desc` ordering (Req 1.1) and index-backed feed filtering (Req 2.6) rather than relying on an unordered DynamoDB scan, the `Image` model needs a secondary index with `date` as a sort key. The concrete addition required in `amplify/data/resource.ts`:

```typescript
// within Image: a.model({ ... })
.secondaryIndexes((index) => [
  index('camFeed').sortKeys(['date']).queryField('imagesByFeedAndDate'),
])
// plus a constant partition for all-feed ordering, e.g. a `gsiPartition` string
// field set to a fixed value, indexed with sortKeys(['date']) for global date order.
```

- `camFeed` filter active → query `imagesByFeedAndDate` with `sortDirection: 'DESC'` (feed is the hash key, date the sort key).
- No feed filter → query the global-partition index with `sortDirection: 'DESC'` for stable `date desc` order across all feeds.
- The `id desc` tiebreak (Req 1.1) is applied as a deterministic secondary sort on items sharing an identical `date` within the returned page, since DynamoDB sorts only by the single sort key.

> If `project-setup` cannot add the indexes before this feature ships, the fallback is `client.models.Image.list({ limit, nextToken, filter })` with an explicit in-helper stable sort by `(date desc, id desc)` applied per page. This preserves correctness of ordering *within fetched data* but makes cross-page ordering dependent on fetch order; the index-backed path is strongly preferred and is the design's primary path.

### Query_State ↔ URL mapping

| QueryState field | URL key | Example | Default (omitted) |
|---|---|---|---|
| `year` | `year` | `?year=2024` | all years |
| `feed` | `feed` | `?feed=BF` | all feeds |
| `bears` | `bears` | `?bears=with` | `any` |
| `q` | `q` | `?q=480` | `''` |
| `page` | `page` | `?page=3` | `1` |

Default-valued fields are omitted from the serialized query string, so the unfiltered first page is a clean `/`.

### Pagination state model

Because AppSync exposes no total count and no page-number addressing, the server resolves a page number into a cursor chain:

```
page 1 → token null
page 2 → nextToken returned by page 1
page N → walk nextToken forward (N-1) times
```

- `hasNextPage` is derived from whether the page-N fetch returns a non-null `nextToken` **and** that follow-on page is non-empty.
- `lastPage` (for clamping, Req 6.6) is the highest page index reached before the chain returns empty; the walk stops early once empty (bounded work, Req 1.9).
- "Previous page" is simply `page - 1` and is always addressable by re-walking from the start (cheap at the page counts expected; a short-lived per-request cursor memo avoids re-walking within one render).

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

This feature is UI-heavy, but it rests on a layer of **pure functions** with strong universal properties: Query_State encode/decode/validation, the comma-aware case-insensitive `bearList` search, UTC year bounds, bear-presence predicates, page clamping, and bounding-box coordinate math. These are exactly where property-based testing pays off. Rendering, responsive layout, scroll restoration, AppSync wiring, and not-found/error routing are verified by example-based unit tests, snapshot/component tests, and integration tests instead (see [Testing Strategy](#testing-strategy)).

The recommended PBT library is **[fast-check](https://github.com/dubzzz/fast-check)** with **Vitest**, matching the harness already established in `project-setup` (`{ numRuns: 100 }`, `// Feature: …, Property N: …` tag comments).

---

### Property 1: Query_State serialize/parse round-trip

*For any* valid `QueryState` value, `parseQueryState(Object.fromEntries(toSearchParams(state)))` SHALL return a `QueryState` deeply equal to the original.

**Validates: Requirements 6.1, 6.3, 6.4**

---

### Property 2: Parsing never yields an invalid Query_State

*For any* arbitrary record of raw string search-param values (including malformed, unrecognized, or over-length values), `parseQueryState` SHALL return a `QueryState` whose `feed` is one of the five defined codes or null, whose `bears` is one of `any`/`with`/`without`, whose `q` has length between 0 and 100 after trimming, whose `year` is null or a positive integer, and whose `page` is an integer `>= 1` — and SHALL NOT throw.

**Validates: Requirements 6.5, 3.7, 3.8**

---

### Property 3: Page clamping stays in range

*For any* integer `page` and any `totalPages >= 0`, `clampPage(page, totalPages)` SHALL return a value `r` such that `1 <= r <= max(totalPages, 1)`, with `r = 1` whenever `page <= 1` and `r = max(totalPages, 1)` whenever `page >= max(totalPages, 1)`.

**Validates: Requirements 6.6**

---

### Property 4: bearList search is comma-token-scoped and case-insensitive

*For any* list of bear-name tokens and any non-empty search term, `bearListMatches(tokens.join(','), term)` SHALL return true if and only if at least one individual token contains `term` as a case-insensitive substring; in particular a term that only matches by spanning across a comma separator SHALL NOT produce a match.

**Validates: Requirements 3.2**

---

### Property 5: Empty/whitespace search matches like a cleared search

*For any* `bearList` string, `bearListMatches(bearList, term)` with a `term` that is empty or all-whitespace SHALL be treated as a cleared search by the caller (the normalized term is `''`), so filtering is governed solely by the remaining active filters.

**Validates: Requirements 3.6, 3.7**

---

### Property 6: UTC year bounds are inclusive and exclusive of neighbors

*For any* calendar `year` and any instant, `isInUtcYear(iso, year)` SHALL return true if and only if the instant is on or after `year-01-01T00:00:00.000Z` and on or before `year-12-31T23:59:59.999Z`; instants in `year-1` or `year+1` SHALL return false.

**Validates: Requirements 2.5**

---

### Property 7: Bear-presence predicate partitions by bearCount

*For any* integer `bearCount >= 0`: `matchesBearPresence(bearCount, 'any')` SHALL be true; `matchesBearPresence(bearCount, 'with')` SHALL be true iff `bearCount >= 1`; and `matchesBearPresence(bearCount, 'without')` SHALL be true iff `bearCount === 0`. The `with` and `without` predicates SHALL be mutually exclusive and together cover every `bearCount`.

**Validates: Requirements 2.7, 2.8, 2.9**

---

### Property 8: Combined filters are a logical AND

*For any* set of images and any `GalleryFilter`, an image SHALL be included in the filtered result if and only if it satisfies the year predicate AND the feed predicate AND the bear-presence predicate AND the search predicate (each inactive filter treated as always-true).

**Validates: Requirements 2.10, 3.3**

---

### Property 9: Changing a filter or a non-empty search resets to page 1

*For any* starting `QueryState` and any change to the `year`, `feed`, `bears`, or to a new non-empty trimmed `q`, the `QueryState` produced by the control-change reducer SHALL have `page === 1`.

**Validates: Requirements 2.12, 3.4**

---

### Property 10: Clear resets to the default unfiltered first page

*For any* `QueryState`, applying the clear operation SHALL produce exactly `DEFAULT_QUERY_STATE` (year null, feed null, bears `any`, q `''`, page 1).

**Validates: Requirements 2.13**

---

### Property 11: Bounding-box overlay geometry scales with rendered size

*For any* object with fractional coordinates `left, top, width, height ∈ [0,1]` and any rendered image box of width `W >= 0` and height `H >= 0`, the computed overlay rectangle SHALL equal `{ left: left*W, top: top*H, width: width*W, height: height*H }`, and SHALL stay within the rendered box (right edge `<= W`, bottom edge `<= H`) whenever `left + width <= 1` and `top + height <= 1`.

**Validates: Requirements 4.2**

---

### Property 12: Only Bear objects are overlaid; consensus label reflects votes

*For any* set of objects, the overlays rendered on the detail page SHALL correspond exactly to the subset whose `label === "Bear"`; each overlay's consensus label SHALL show `consensusName` and `totalVotes` when `consensusName` is non-null, and SHALL show the no-identification placeholder with a vote count of 0 when `consensusName` is null.

**Validates: Requirements 4.3, 4.4, 4.5**

---

## Error Handling

| Condition | Where | Behavior | Requirement |
|---|---|---|---|
| Image list query throws | `(public)/error.tsx` | Error-state message + retry affordance; active Query_State preserved in the URL so retry re-applies it; no partial/stale content | 1.11, 7.6 |
| List returns zero records (no data at all) | `GalleryEmptyState variant="no-images"` | "No images are available" — distinct from error | 7.7 |
| List returns zero records (filters/search exclude all) | `GalleryEmptyState variant="no-match"` | "No images match the active filters/search"; filter + search selections retained | 1.10, 2.11, 3.5 |
| Requested page beyond available data | `GalleryEmptyState variant="page-beyond"` | "No images on this page" message; controls allow stepping back | 1.9 |
| Detail requested with unknown id | `images/[id]/not-found.tsx` via `notFound()` | Next.js 404; zero overlays rendered | 4.6 |
| Detail fetch fails for a valid id | `images/[id]/error.tsx` | "Image could not be loaded" error state; zero overlays | 4.8 |
| Adjacent image fetch fails / unavailable | `ImageNav` | Current detail page unchanged; inline "adjacent image could not be loaded" indication; no navigation | 5.7 |
| Search term over 100 chars submitted | `SearchControl` | Reject input, keep prior Query_State unchanged, show max-length indication | 3.8 |
| Malformed/unknown Query_State in URL | `parseQueryState` | Degrade to `DEFAULT_QUERY_STATE`; browsing not blocked | 6.5 |
| Page number out of range in URL | `clampPage` after count resolution | Clamp to 1 or last page; render at clamped position | 6.6 |

All AppSync errors surface as these states; the helpers in `src/lib/amplify/gallery.ts` return typed results (`null` / discriminated unions) rather than letting raw `GraphQLError`s escape to components, so each component maps a known shape to a known state.

---

## Testing Strategy

### Property-based tests (fast-check + Vitest)

Each design property above maps to exactly one property-based test, configured with `{ numRuns: 100 }` and tagged `// Feature: image-gallery, Property N: <property text>`. These target the pure modules:

- `src/lib/gallery/query-state.ts` — Properties 1, 2, 3, 9, 10
- `src/lib/gallery/filter.ts` — Properties 4, 5, 6, 7, 8
- `src/lib/bears/geometry.ts` (bounding-box math) — Property 11
- `src/lib/bears/overlay-selection.ts` (Bear filtering + label resolution) — Property 12

Generators of note: `fc.record` for `QueryState`; `fc.array(fc.string())` joined with commas for `bearList`; `fc.integer({ min: 0 })` for `bearCount`; `fc.date`/UTC-bounded instants for year tests; `fc.float({ min: 0, max: 1 })` for fractional coordinates and `fc.float({ min: 0 })` for rendered dimensions.

### Example-based unit tests

- `parseQueryState` concrete cases: empty params → default; `?page=0` → 1; `?feed=XX` → null; `q` of exactly 100 vs 101 chars.
- `resolvePageCursor` cursor-walk logic against a mocked list function (page 1 null token, chain exhaustion short-circuit, `lastPage` computation).
- `getAdjacentImageIds` edge detection (newest → `newerId` null; oldest → `olderId` null).
- `ConsensusLabel` null vs non-null `consensusName` rendering.

### Component / snapshot tests

- `ImageGrid` responsive classes assert the 1/2/3/4 column breakpoints (Req 8.1).
- `ImageCard` renders `<Image>` + `<Link>` and shows date/camFeed/bearCount (Req 1.3, 1.4).
- `PaginationControls` disabled states at first/last page (Req 1.6, 1.7).
- `ImageNav` disabled states at newest/oldest edges (Req 5.4, 5.5).
- Empty-state variants render distinct messages (Req 1.9, 1.10, 7.7).

### Integration tests (1–3 representative cases each — not PBT)

These verify wiring to AppSync and the public API key, which do not vary meaningfully with input and are costly to run repeatedly:

- A `listImagesPage` call uses `authMode: 'apiKey'` and issues only read operations (Req 7.1, 7.2, 7.3).
- A `getImageWithObjects` for a known seeded id returns the image and its objects; an unknown id returns `null` (Req 4.1, 4.6).
- End-to-end: load `/?feed=BF&bears=with`, open a detail page, return, and confirm the grid is restored to the same Query_State (Req 6.2, 6.3).

### Manual / excluded from automated assertion

- Scroll-position restoration (Req 6.7) is verified by example interaction tests driving `sessionStorage` + `window.scrollTo`; exact pixel restoration is "approximate" per the requirement and is not property-tested.
- Mobile first-paint-within-3-seconds (Req 8.6) is a performance budget verified via Lighthouse/profiling in CI, not a unit property.
- 320px no-overflow layout (Req 8.2) is verified by a viewport snapshot/visual check.

### Why PBT is scoped to the pure layer

The feature's I/O (AppSync reads), rendering, and layout are not amenable to universal "for all inputs" properties — they are either external-service behavior (integration tests) or visual/responsive concerns (snapshot/visual tests). The transformation logic underneath them — parsing, validation, search matching, date bounds, clamping, and coordinate math — is pure and input-sensitive, so it carries the property-based tests above.
