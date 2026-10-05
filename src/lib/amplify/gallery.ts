/**
 * AppSync gallery read helpers for the public, read-only image gallery.
 *
 * All gallery data access flows through this module (Req 7.1), always with
 * `authMode: 'apiKey'` (Req 7.2) and read-only operations only (Req 7.3, 7.4).
 *
 * This file (task 8.1) establishes the shared helper types and the
 * `GalleryFilter` → AppSync `buildFilter` translation. The list/cursor/detail/
 * adjacency helpers that consume these types are added in tasks 8.2–8.4.
 */

import type { CamFeed } from '@/lib/constants';
import type { BearPresence } from '@/lib/gallery/query-state';
import type { Schema } from '../../../amplify/data/resource';

/**
 * The generated `Image` model type. Consumed from the Amplify schema — never
 * duplicated (conventions; Req 7 intent).
 */
export type ImageModel = Schema['Image']['type'];

/**
 * The generated `Object` model type (an AI-detected bounding box within an
 * Image). Consumed from the Amplify schema — never duplicated.
 */
export type ObjectModel = Schema['Object']['type'];

/**
 * One Image paired with its related Objects, as rendered on the
 * Image_Detail_Page (Req 4.1, 4.3). The `objects` array holds every detected
 * Object for the image; Bear-only overlay selection happens downstream in the
 * component layer.
 */
export type ImageWithObjects = ImageModel & {
  objects: ObjectModel[];
};

/**
 * A single resolved page of gallery images (Req 1.1, 1.5, 1.6, 1.9).
 */
export type ImagePage = {
  /** Up to `PAGE_SIZE` images, in `date desc / id desc` order. */
  images: ImageModel[];
  /** True iff a further non-empty page exists after this one (Req 1.5, 1.6). */
  hasNextPage: boolean;
  /** Cursor to the page after this one, or null when there is none. */
  nextToken: string | null;
  /** True iff the requested page index was beyond the available data (Req 1.9). */
  requestedPageEmpty: boolean;
};

/**
 * The AppSync-shaped filter produced from a normalized `QueryState`.
 *
 * Distinct from the in-memory `GalleryFilter` in `src/lib/gallery/filter.ts`:
 * that one mirrors the raw `QueryState` (a `year: number`) for client-side
 * predicate matching, while this one carries precomputed UTC ISO `yearRange`
 * bounds tailored to the DynamoDB `between` predicate. The two layers have
 * genuinely different shapes and deliberately do not share a type.
 */
export type GalleryFilter = {
  /** Active feed filter, or null for all feeds (Req 2.6). */
  camFeed: CamFeed | null;
  /** Precomputed inclusive UTC year bounds, or null for all years (Req 2.5). */
  yearRange: { fromIso: string; toIso: string } | null;
  /** Bear-presence filter: `'any' | 'with' | 'without'` (Req 2.7–2.9). */
  bears: BearPresence;
  /** Trimmed search term; `''` means no search (Req 3.2). */
  q: string;
};

/**
 * A single AppSync filter predicate leaf — a field name mapped to a comparison
 * operator and its operand. Kept loose on the operand type because operators
 * differ (`eq`/`ge`/`contains` take a scalar; `between` takes a 2-tuple).
 */
type FilterLeaf = Record<
  string,
  { eq: string } | { eq: number } | { ge: number } | { contains: string } | { between: [string, string] }
>;

/**
 * The AppSync `filter` argument shape: either a single leaf predicate or an
 * `and` of several leaves. An empty filter (no active dimensions) is `{}`,
 * which AppSync treats as "match all".
 */
export type AppSyncFilter = Record<string, never> | FilterLeaf | { and: FilterLeaf[] };

/**
 * Build the AppSync `filter` predicate from a `GalleryFilter`, combining every
 * active dimension with logical AND (Req 2.10, 3.3):
 *
 * - `camFeed` (non-null) → `camFeed eq <code>` (Req 2.6)
 * - `yearRange` (non-null) → `date between [fromIso, toIso]` (Req 2.5)
 * - `bears === 'with'` → `bearCount ge 1` (Req 2.7)
 * - `bears === 'without'` → `bearCount eq 0` (Req 2.8)
 * - `bears === 'any'` → omitted (Req 2.9)
 * - `q` (non-empty) → `bearList contains <term>` (Req 3.2 coarse pre-filter)
 *
 * The `bearList contains` leaf is only a coarse server-side pre-filter — it is
 * case-sensitive and can match across comma boundaries. The exact, comma-aware,
 * case-insensitive match is applied downstream via `bearListMatches` as a
 * residual filter on the returned page (see the `bearList` search caveat in the
 * design). This builder never relies on `contains` for correctness.
 *
 * When no dimension is active the result is `{}` ("match all"). A single active
 * dimension is returned as a bare leaf; two or more are wrapped in `{ and: [...] }`.
 */
export function buildFilter(f: GalleryFilter): AppSyncFilter {
  const leaves: FilterLeaf[] = [];

  if (f.camFeed !== null) {
    leaves.push({ camFeed: { eq: f.camFeed } });
  }

  if (f.yearRange !== null) {
    leaves.push({ date: { between: [f.yearRange.fromIso, f.yearRange.toIso] } });
  }

  if (f.bears === 'with') {
    leaves.push({ bearCount: { ge: 1 } });
  } else if (f.bears === 'without') {
    leaves.push({ bearCount: { eq: 0 } });
  }

  const term = f.q.trim();
  if (term !== '') {
    leaves.push({ bearList: { contains: term } });
  }

  if (leaves.length === 0) return {};
  if (leaves.length === 1) return leaves[0];
  return { and: leaves };
}
