# Implementation Plan: image-gallery

## Overview

This plan builds the public, read-only image gallery incrementally, starting from
pure logic modules that are independently unit- and property-testable, then the
AppSync read helpers that wire those modules to data, then the Server/Client React
components and App Router convention files that assemble the Gallery_Page and
Image_Detail_Page.

Sequencing follows the design's layering so there is no orphaned code: each pure
module is implemented and tested before the helpers and components that depend on
it; the secondary-index dependency (owned by `project-setup`) is represented with
its documented scan + stable-sort fallback; pages and controls are wired last.

Property-based tests use fast-check + Vitest with `{ numRuns: 100 }`, tagged in the
established `// Feature: image-gallery, Property N: ...` format. All 12 correctness
properties from the design are covered.

## Tasks

- [x] 1. Scaffold gallery module structure and shared types
  - Create `src/lib/gallery/` and `src/lib/bears/` directories
  - In `src/lib/gallery/query-state.ts`, define and export the `PAGE_SIZE` (24), `MAX_SEARCH_LENGTH` (100), and `BEAR_PRESENCE_VALUES` constants, the `BearPresence` and `QueryState` types, and the `DEFAULT_QUERY_STATE` constant, importing `CamFeed` from `@/lib/constants`
  - Add function signatures (no bodies yet) for `parseQueryState`, `toSearchParams`, `clampPage`, and `normalizeSearchTerm` with explicit return types
  - _Requirements: 6.1, 1.2, 3.1_

- [x] 2. Implement the Query_State module (`src/lib/gallery/query-state.ts`)
  - [x] 2.1 Implement `parseQueryState`, `toSearchParams`, `clampPage`, and `normalizeSearchTerm`
    - `parseQueryState` never throws and never emits an invalid field: unrecognized `feed`, non-recognized `bears`, non-integer/`<1` `page`, non-positive `year`, and over-length `q` each fall back to their default; trim `q` and drop empty/whitespace to `''`
    - `toSearchParams` omits default-valued keys so `DEFAULT_QUERY_STATE` serializes to an empty query string
    - `clampPage` clamps a 1-based page to `[1, max(totalPages, 1)]`
    - `normalizeSearchTerm` trims, treats empty/whitespace as cleared, and returns `{ ok: false, reason: 'too-long' }` when the trimmed term exceeds `MAX_SEARCH_LENGTH`
    - _Requirements: 6.1, 6.5, 6.6, 3.1, 3.7, 3.8_

  - [x] 2.2 Write property test for Query_State round-trip
    - **Property 1: Query_State serialize/parse round-trip**
    - **Validates: Requirements 6.1, 6.3, 6.4**
    - Generator: `fc.record` over valid `QueryState`; assert `parseQueryState(Object.fromEntries(toSearchParams(state)))` deep-equals the original
    - `// Feature: image-gallery, Property 1: ...`

  - [x] 2.3 Write property test for parse-never-invalid
    - **Property 2: Parsing never yields an invalid Query_State**
    - **Validates: Requirements 6.5, 3.7, 3.8**
    - Generator: arbitrary record of raw string param values incl. malformed/over-length; assert `feed`, `bears`, `q` length, `year`, `page` all in-range and no throw
    - `// Feature: image-gallery, Property 2: ...`

  - [x] 2.4 Write property test for page clamping
    - **Property 3: Page clamping stays in range**
    - **Validates: Requirements 6.6**
    - Generator: `fc.integer()` page and `fc.integer({ min: 0 })` totalPages; assert `1 <= r <= max(totalPages,1)` and boundary behavior
    - `// Feature: image-gallery, Property 3: ...`

  - [x] 2.5 Write unit tests for parse/normalize edge cases
    - Empty params → default; `?page=0` → 1; `?feed=XX` → null; `q` of exactly 100 vs 101 chars
    - _Requirements: 6.5, 3.8_

- [x] 3. Implement the search/filter logic module (`src/lib/gallery/filter.ts`)
  - [x] 3.1 Implement `bearListMatches`, `isInUtcYear`, and `matchesBearPresence`
    - `bearListMatches`: split `bearList` on commas, return true iff at least one token contains `term` as a case-insensitive substring, never spanning the comma; empty/undefined `bearList` never matches a non-empty term
    - `isInUtcYear`: true iff instant is within `[year-01-01T00:00:00.000Z, year-12-31T23:59:59.999Z]`
    - `matchesBearPresence`: `any` always true; `with` iff `bearCount >= 1`; `without` iff `bearCount === 0`
    - _Requirements: 3.2, 2.5, 2.7, 2.8, 2.9_

  - [x] 3.2 Write property test for comma-scoped case-insensitive search
    - **Property 4: bearList search is comma-token-scoped and case-insensitive**
    - **Validates: Requirements 3.2**
    - Generator: `fc.array(fc.string())` joined with commas + non-empty term; assert match iff some token contains term case-insensitively and no cross-comma match
    - `// Feature: image-gallery, Property 4: ...`

  - [x] 3.3 Write property test for empty/whitespace search behaving as cleared
    - **Property 5: Empty/whitespace search matches like a cleared search**
    - **Validates: Requirements 3.6, 3.7**
    - Generator: arbitrary `bearList` + empty/all-whitespace term normalized to `''`; assert filtering is governed only by remaining filters
    - `// Feature: image-gallery, Property 5: ...`

  - [x] 3.4 Write property test for UTC year bounds
    - **Property 6: UTC year bounds are inclusive and exclusive of neighbors**
    - **Validates: Requirements 2.5**
    - Generator: calendar year + UTC-bounded instants incl. `year-1`/`year+1` edges; assert inclusive bounds and neighbor exclusion
    - `// Feature: image-gallery, Property 6: ...`

  - [x] 3.5 Write property test for bear-presence partition
    - **Property 7: Bear-presence predicate partitions by bearCount**
    - **Validates: Requirements 2.7, 2.8, 2.9**
    - Generator: `fc.integer({ min: 0 })` bearCount; assert `with`/`without` mutually exclusive and jointly exhaustive, `any` always true
    - `// Feature: image-gallery, Property 7: ...`

- [x] 4. Implement bounding-box geometry and overlay-selection modules
  - [x] 4.1 Implement `src/lib/bears/geometry.ts`
    - Export a pure `computeOverlayRect({ left, top, width, height }, W, H)` returning `{ left: left*W, top: top*H, width: width*W, height: height*H }` with explicit return type
    - _Requirements: 4.2_

  - [x] 4.2 Write property test for overlay geometry scaling
    - **Property 11: Bounding-box overlay geometry scales with rendered size**
    - **Validates: Requirements 4.2**
    - Generator: `fc.float({ min: 0, max: 1 })` fractional coords + `fc.float({ min: 0 })` W/H; assert exact scaling and containment when `left+width<=1` and `top+height<=1`
    - `// Feature: image-gallery, Property 11: ...`

  - [x] 4.3 Implement `src/lib/bears/overlay-selection.ts`
    - Export `selectBearOverlays(objects)` returning only objects whose `label === "Bear"`
    - Export `resolveConsensusLabel({ consensusName, totalVotes })` returning name + votes when `consensusName` is non-null, else the no-identification placeholder with `totalVotes` of 0
    - _Requirements: 4.3, 4.4, 4.5_

  - [x] 4.4 Write property test for Bear-only overlays and consensus label
    - **Property 12: Only Bear objects are overlaid; consensus label reflects votes**
    - **Validates: Requirements 4.3, 4.4, 4.5**
    - Generator: `fc.array` of objects with varied `label`/`consensusName`/`totalVotes`; assert overlay subset is exactly `label === "Bear"` and label resolution matches null/non-null rules
    - `// Feature: image-gallery, Property 12: ...`

- [x] 5. Implement the Query_State control-change reducer and combined-filter predicate
  - [x] 5.1 Add `applyControlChange` and `applyClear` reducers to `src/lib/gallery/query-state.ts`
    - `applyControlChange` sets `page = 1` whenever `year`, `feed`, `bears`, or a new non-empty trimmed `q` changes
    - `applyClear` returns exactly `DEFAULT_QUERY_STATE`
    - _Requirements: 2.12, 3.4, 2.13_

  - [x] 5.2 Add `matchesFilter(image, filter)` combined predicate to `src/lib/gallery/filter.ts`
    - Combine year, feed, bear-presence, and search predicates with logical AND, treating each inactive filter as always-true, reusing `isInUtcYear`, `matchesBearPresence`, and `bearListMatches`
    - _Requirements: 2.10, 3.3_

  - [x] 5.3 Write property test for reset-to-page-1 on change
    - **Property 9: Changing a filter or a non-empty search resets to page 1**
    - **Validates: Requirements 2.12, 3.4**
    - Generator: starting `QueryState` + a change to `year`/`feed`/`bears`/new non-empty `q`; assert resulting `page === 1`
    - `// Feature: image-gallery, Property 9: ...`

  - [x] 5.4 Write property test for clear resetting to default
    - **Property 10: Clear resets to the default unfiltered first page**
    - **Validates: Requirements 2.13**
    - Generator: arbitrary `QueryState`; assert `applyClear` returns exactly `DEFAULT_QUERY_STATE`
    - `// Feature: image-gallery, Property 10: ...`

  - [x] 5.5 Write property test for combined filters as logical AND
    - **Property 8: Combined filters are a logical AND**
    - **Validates: Requirements 2.10, 3.3**
    - Generator: `fc.array` of images + arbitrary `GalleryFilter`; assert inclusion iff year AND feed AND bear-presence AND search all pass
    - `// Feature: image-gallery, Property 8: ...`

- [ ] 6. Checkpoint - pure logic layer
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Add the `Image` secondary index with documented scan fallback
  - [ ] 7.1 Add the secondary index(es) to the `Image` model in `amplify/data/resource.ts`
    - Add `camFeed`-hash / `date`-sort index (`imagesByFeedAndDate`) and a constant-partition index for global `date desc` ordering, per the design's Data Models section
    - This file is owned by `project-setup`; add the index additively without altering existing auth rules or fields, and leave an inline comment noting the cross-spec ownership and the scan + per-page stable-sort `(date desc, id desc)` fallback the helpers must use if the index is unavailable
    - _Requirements: 1.1, 2.6_

- [ ] 8. Implement AppSync gallery helpers (`src/lib/amplify/gallery.ts`)
  - [ ] 8.1 Define helper types and `GalleryFilter` → AppSync `buildFilter`
    - Define `ImageModel`, `ObjectModel`, `ImageWithObjects`, `ImagePage`, and `GalleryFilter` from the generated `Schema` type (no duplicated model types)
    - Implement `buildFilter(f)`: `camFeed → eq`; `yearRange → date between`; `bears → bearCount ge 1 / eq 0 / omitted`; `q → bearList contains(term)` combined with AND
    - _Requirements: 7.1, 7.2, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 3.3_

  - [ ] 8.2 Implement `listImagesPage(filter, token)`
    - Use `authMode: 'apiKey'`, read-only `list` with `limit = PAGE_SIZE`, `nextToken`, `sortDirection: 'DESC'`, and `buildFilter`; apply the in-helper stable `(date desc, id desc)` sort and the exact `bearListMatches` residual search over the returned page; populate `hasNextPage`, `nextToken`, and `requestedPageEmpty`
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 1.9, 3.2, 7.3, 7.4_

  - [ ] 8.3 Implement `resolvePageCursor(filter, page)`
    - Walk the `nextToken` chain forward from page 1, materializing the cursor for the requested page; return `{ token, lastPage, reachedRequested }`; short-circuit when the chain exhausts before the requested page
    - _Requirements: 6.6, 1.9_

  - [ ] 8.4 Implement `getImageWithObjects(id)` and `getAdjacentImageIds(filter, currentId)`
    - `getImageWithObjects`: `apiKey` read of one Image + its Objects; return `null` when no record exists
    - `getAdjacentImageIds`: resolve newer/older ids under the active ordering + filter; `null` on either side at the newest/oldest edge
    - _Requirements: 4.1, 4.6, 5.2, 5.3, 5.4, 5.5, 7.2, 7.3_

  - [ ]* 8.5 Write unit tests for cursor walk and adjacency against a mocked list
    - `resolvePageCursor`: page 1 null token, chain exhaustion short-circuit, `lastPage` computation
    - `getAdjacentImageIds`: newest → `newerId` null; oldest → `olderId` null
    - _Requirements: 6.6, 1.9, 5.4, 5.5_

  - [ ]* 8.6 Write integration tests for read-only apiKey access
    - `listImagesPage` uses `authMode: 'apiKey'` and issues only read operations; `getImageWithObjects` returns image+objects for a known id and `null` for an unknown id
    - _Requirements: 7.1, 7.2, 7.3, 4.1, 4.6_

- [ ] 9. Checkpoint - data access layer
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement gallery display components (Server Components)
  - [ ] 10.1 Implement `ImageCard` (`src/components/images/image-card.tsx`)
    - Server Component; render thumbnail via Next.js `<Image>` with a `sizes` attribute matching the 1/2/3/4 column layout and navigate via `<Link>`; show `date`, `camFeed`, `bearCount`
    - _Requirements: 1.3, 1.4, 8.4, 8.5_

  - [ ] 10.2 Implement `ImageGrid` (`src/components/images/image-grid.tsx`)
    - Server Component; responsive grid with Tailwind: 1 col below `sm`, 2 at `sm`, 3 at `md`, 4 at `lg`; map images to `ImageCard`
    - _Requirements: 1.1, 8.1, 8.2_

  - [ ] 10.3 Implement `GalleryEmptyState` (`src/components/images/gallery-empty-state.tsx`)
    - Server Component with `variant` prop rendering distinct `no-images`, `no-match`, and `page-beyond` messages
    - _Requirements: 1.9, 1.10, 2.11, 3.5, 7.7_

  - [ ]* 10.4 Write component tests for grid, card, and empty-state variants
    - `ImageGrid` asserts 1/2/3/4 column breakpoint classes; `ImageCard` renders `<Image>` + `<Link>` with date/camFeed/bearCount; empty-state variants render distinct messages
    - _Requirements: 8.1, 1.3, 1.4, 1.9, 1.10, 7.7_

- [ ] 11. Implement gallery control components (Client Components)
  - [ ] 11.1 Implement `FilterControls` (`src/components/images/filter-controls.tsx`)
    - Client Component; year select populated from distinct descending years (empty + disabled when none), single CamFeed select over the five codes, bear-presence three-option control defaulting to `any`, plus clear control; emit changes via `onChange`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.13_

  - [ ] 11.2 Implement `SearchControl` (`src/components/images/search-control.tsx`)
    - Client Component; text input calling `normalizeSearchTerm`; on over-length show max-length indication and keep prior state; submit trimmed term via `onSubmit`
    - _Requirements: 3.1, 3.6, 3.7, 3.8_

  - [ ] 11.3 Implement `PaginationControls` (`src/components/images/pagination-controls.tsx`)
    - Client Component; prev/next controls with disabled edges driven by `hasPrevPage`/`hasNextPage`
    - _Requirements: 1.5, 1.6, 1.7_

  - [ ] 11.4 Implement `GalleryControls` (`src/components/images/gallery-controls.tsx`)
    - Client Component; compose `FilterControls`, `SearchControl`, and clear; own URL writes via `useRouter`/`useSearchParams` using `applyControlChange`/`applyClear` + `toSearchParams`, resetting to page 1 on filter/search change
    - _Requirements: 2.12, 2.13, 3.4, 6.1_

  - [ ]* 11.5 Write component tests for control disabled/empty states
    - `PaginationControls` disabled at first/last page; `FilterControls` year empty-disabled state; `SearchControl` over-length message
    - _Requirements: 1.6, 1.7, 2.2, 3.8_

- [ ] 12. Implement bounding-box and consensus components, and image navigation
  - [ ] 12.1 Implement `ConsensusLabel` (`src/components/bears/consensus-label.tsx`)
    - Server-safe; render `consensusName` + `totalVotes`, or the no-identification placeholder with 0 votes when `consensusName` is null, using `resolveConsensusLabel`
    - _Requirements: 4.4, 4.5_

  - [ ] 12.2 Implement `BoundingBox` (`src/components/bears/bounding-box.tsx`)
    - Client Component; render one rectangle from a computed `rect` plus a nested `ConsensusLabel`
    - _Requirements: 4.2, 4.4, 4.5_

  - [ ] 12.3 Implement `BoundingBoxLayer` (`src/components/bears/bounding-box-layer.tsx`)
    - Client Component; measure the rendered image box, use `selectBearOverlays` + `computeOverlayRect` to position one `BoundingBox` per Bear object; render zero overlays when none
    - _Requirements: 4.2, 4.3_

  - [ ] 12.4 Implement `ImageNav` (`src/components/images/image-nav.tsx`)
    - Client Component; prev/next `<Link>`s carrying the Query_State forward unchanged; disabled at newest/oldest edges; inline indication when an adjacent image cannot be loaded
    - _Requirements: 5.1, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 12.5 Write component tests for overlays and nav edges
    - `BoundingBoxLayer` renders one overlay per Bear object and zero when none; `ImageNav` disabled at newest/oldest edges; `ConsensusLabel` null vs non-null rendering
    - _Requirements: 4.3, 4.5, 5.4, 5.5_

- [ ] 13. Implement scroll restoration component
  - [ ] 13.1 Implement `ScrollRestorer` (`src/components/images/scroll-restorer.tsx`)
    - Client Component; save/restore grid vertical scroll keyed by the serialized Query_State using `sessionStorage` and `window.scrollTo`
    - _Requirements: 6.7_

  - [ ]* 13.2 Write interaction test for scroll save/restore
    - Drive `sessionStorage` + `window.scrollTo`; assert approximate restoration on return keyed by Query_State
    - _Requirements: 6.7_

- [ ] 14. Checkpoint - component layer
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Wire the Gallery_Page and its App Router convention files
  - [ ] 15.1 Implement `GalleryPage` (`src/app/(public)/page.tsx`)
    - Server Component (default export); parse `searchParams` via `parseQueryState`, build `GalleryFilter`, call `resolvePageCursor` + `listImagesPage`, clamp page via `clampPage`, and render `GalleryControls` + `ImageGrid`/`GalleryEmptyState` + `PaginationControls` + `ScrollRestorer`; choose the empty-state variant from the result
    - _Requirements: 1.1, 1.2, 1.9, 1.10, 2.11, 3.5, 6.3, 6.4, 6.6, 7.5, 7.7, 8.3, 8.6_

  - [ ] 15.2 Add `loading.tsx` and `error.tsx` for the gallery route group
    - `src/app/(public)/loading.tsx`: grid loading indicator; `src/app/(public)/error.tsx` (`'use client'`): error-state message + retry affordance preserving the active Query_State in the URL
    - _Requirements: 1.8, 1.11, 7.6_

- [ ] 16. Wire the Image_Detail_Page and its App Router convention files
  - [ ] 16.1 Implement `ImageDetail` (`src/app/(public)/images/[id]/page.tsx`)
    - Server Component (default export); fetch via `getImageWithObjects`, call `notFound()` on `null`; render the full `<Image>`, `BoundingBoxLayer`, `date`/`camFeed` metadata, and `ImageNav` fed by `getAdjacentImageIds`, carrying Query_State forward
    - _Requirements: 4.1, 4.3, 4.6, 4.7, 5.1, 5.6, 6.2, 7.5, 8.3, 8.4, 8.5_

  - [ ] 16.2 Add `loading.tsx`, `not-found.tsx`, and `error.tsx` for the detail route
    - `loading.tsx`: detail loading indicator; `not-found.tsx`: 404 with zero overlays; `error.tsx` (`'use client'`): "image could not be loaded" with zero overlays
    - _Requirements: 4.6, 4.8, 5.7_

- [ ] 17. Integration wiring and end-to-end state preservation
  - [ ]* 17.1 Write integration test for Query_State round-trip across navigation
    - Load `/?feed=BF&bears=with`, open a detail page, return, and confirm the grid is restored to the same Query_State (filters, search, page)
    - _Requirements: 6.2, 6.3, 6.4_

- [ ] 18. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation sub-tasks are never optional.
- Each task references the specific requirement sub-clauses (and, for property tests, the design property) it implements for traceability.
- All 12 correctness properties are covered: Properties 1-3, 9, 10 on `query-state.ts`; Properties 4-8 on `filter.ts`; Property 11 on `geometry.ts`; Property 12 on `overlay-selection.ts`.
- Property-based tests use fast-check + Vitest with `{ numRuns: 100 }` and `// Feature: image-gallery, Property N: ...` tags.
- The pure logic layer (tasks 1-5) is built and tested before any AppSync or React code, so no component depends on unimplemented logic.
- Task 7 represents the cross-spec secondary-index dependency owned by `project-setup`; the helpers in task 8 include the documented scan + per-page stable-sort fallback so the feature is correct even if the index is deferred.
- This workflow produces planning artifacts only; it does not implement the feature.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "4.3", "7.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "3.2", "3.3", "3.4", "3.5", "4.2", "4.4", "5.1", "5.2", "8.1"] },
    { "id": 3, "tasks": ["5.3", "5.4", "5.5", "8.2", "8.4", "10.1", "10.3", "12.1"] },
    { "id": 4, "tasks": ["8.3", "8.5", "8.6", "10.2", "10.4", "11.1", "11.2", "11.3", "12.2", "12.4", "13.1"] },
    { "id": 5, "tasks": ["11.4", "11.5", "12.3", "12.5", "13.2"] },
    { "id": 6, "tasks": ["15.1", "16.1"] },
    { "id": 7, "tasks": ["15.2", "16.2"] },
    { "id": 8, "tasks": ["17.1"] }
  ]
}
```
