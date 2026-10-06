import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Example-based unit tests for the AppSync gallery cursor-walk and adjacency
 * helpers, exercised against a mocked data client's `list`/`get` so the
 * pages/`nextToken` returned are fully controlled (design: "Example-based unit
 * tests" — `resolvePageCursor` cursor-walk logic and `getAdjacentImageIds`
 * edge detection).
 *
 * Covers:
 *   - Requirement 6.6 / 1.9: `resolvePageCursor` page-1 null token, chain
 *     exhaustion short-circuit with the correct `lastPage` and
 *     `reachedRequested = false`, and a reachable page returning its token.
 *   - Requirement 5.4 / 5.5: `getAdjacentImageIds` newest → `newerId` null,
 *     oldest → `olderId` null, plus middle (both set) and unknown id (both
 *     null).
 *
 * The real `./client` module imports `amplify_outputs.json` and constructs a
 * live Amplify client at module load. It is mocked here so the helpers run
 * against an in-memory `list`/`get` whose pages and cursors the test controls,
 * matching how `auth.test.ts` mocks `aws-amplify/auth`.
 */

const listMock = vi.fn();
const getMock = vi.fn();

// The gallery read helpers import `serverClient`; expose the mock under both
// `serverClient` and `client` so the mock is valid regardless of which is used.
// The object is built inside the factory because `vi.mock` is hoisted above any
// module-level declarations.
vi.mock('./client', () => {
  const mockClient = {
    models: {
      Image: {
        list: (...args: unknown[]) => listMock(...args),
        get: (...args: unknown[]) => getMock(...args),
      },
    },
  };
  return { serverClient: mockClient, client: mockClient };
});

import {
  getAdjacentImageIds,
  resolvePageCursor,
  type GalleryFilter,
} from './gallery';

/** A GalleryFilter with no active dimension — exercises the "match all" path. */
const NO_FILTER: GalleryFilter = {
  camFeed: null,
  yearRange: null,
  bears: 'any',
  q: '',
};

/**
 * Queue a sequence of `list` responses, returned one per call in order. Each
 * entry controls the `data` and `nextToken` the helper sees for that call.
 */
function queueListResponses(
  responses: Array<{ data?: unknown[]; nextToken?: string | null; errors?: unknown[] }>,
): void {
  for (const r of responses) {
    listMock.mockResolvedValueOnce({
      data: r.data ?? [],
      nextToken: r.nextToken ?? null,
      errors: r.errors,
    });
  }
}

/** Minimal Image row — only the fields the helpers read (`id`, `date`). */
function img(id: string, date: string): { id: string; date: string } {
  return { id, date };
}

beforeEach(() => {
  listMock.mockReset();
  getMock.mockReset();
});

describe('resolvePageCursor', () => {
  it('returns a null token for page 1 without walking the chain (Req 6.6)', async () => {
    const result = await resolvePageCursor(NO_FILTER, 1);

    expect(result).toEqual({ token: null, lastPage: 1, reachedRequested: true });
    // Page 1 is always addressable with a null cursor; no list call is needed.
    expect(listMock).not.toHaveBeenCalled();
  });

  it('treats a non-positive page as page 1 with a null token (Req 6.6)', async () => {
    const result = await resolvePageCursor(NO_FILTER, 0);

    expect(result).toEqual({ token: null, lastPage: 1, reachedRequested: true });
    expect(listMock).not.toHaveBeenCalled();
  });

  it('walks the nextToken chain forward and returns the requested reachable page token (Req 6.6)', async () => {
    // page 1 → token null, hands out cursor "t2"
    // page 2 → cursor "t2", hands out cursor "t3"
    // page 3 is the requested page; its cursor is "t3".
    queueListResponses([
      { data: [img('a', '2024-01-03T00:00:00.000Z')], nextToken: 't2' },
      { data: [img('b', '2024-01-02T00:00:00.000Z')], nextToken: 't3' },
    ]);

    const result = await resolvePageCursor(NO_FILTER, 3);

    expect(result).toEqual({ token: 't3', lastPage: 3, reachedRequested: true });
    // Two walks to advance from page 1 to page 3.
    expect(listMock).toHaveBeenCalledTimes(2);
    // The first walk uses the page-1 null cursor...
    expect(listMock.mock.calls[0][0]).toMatchObject({ nextToken: undefined });
    // ...and the second walk uses the cursor handed out by page 1.
    expect(listMock.mock.calls[1][0]).toMatchObject({ nextToken: 't2' });
  });

  it('short-circuits when the chain exhausts before the requested page (Req 1.9, 6.6)', async () => {
    // page 1 → hands out "t2"; page 2 → no further cursor. The chain exhausts
    // at page 2, so a request for page 5 cannot be reached.
    queueListResponses([
      { data: [img('a', '2024-01-03T00:00:00.000Z')], nextToken: 't2' },
      { data: [img('b', '2024-01-02T00:00:00.000Z')], nextToken: null },
    ]);

    const result = await resolvePageCursor(NO_FILTER, 5);

    // lastPage is the highest reachable page (2); the requested page was beyond
    // the data, so reachedRequested is false and token is the last reachable
    // page's cursor ("t2", the cursor for page 2).
    expect(result).toEqual({ token: 't2', lastPage: 2, reachedRequested: false });
    // The walk stops as soon as the chain exhausts — bounded work, not the
    // whole (nonexistent) way to page 5.
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it('short-circuits at page 1 when there is only one page (Req 1.9, 6.6)', async () => {
    // page 1 has no further cursor; a request for page 2 cannot be reached.
    queueListResponses([{ data: [img('a', '2024-01-03T00:00:00.000Z')], nextToken: null }]);

    const result = await resolvePageCursor(NO_FILTER, 2);

    expect(result).toEqual({ token: null, lastPage: 1, reachedRequested: false });
    expect(listMock).toHaveBeenCalledTimes(1);
  });
});

describe('getAdjacentImageIds', () => {
  /**
   * Three images across a single list page, already distinct in `date`. After
   * the helper's `(date desc, id desc)` sort the order is newest→oldest:
   *   newest  'c' (2024-01-03)
   *   middle  'b' (2024-01-02)
   *   oldest  'a' (2024-01-01)
   */
  function queueThreeImageSinglePage(): void {
    queueListResponses([
      {
        data: [
          img('a', '2024-01-01T00:00:00.000Z'),
          img('c', '2024-01-03T00:00:00.000Z'),
          img('b', '2024-01-02T00:00:00.000Z'),
        ],
        nextToken: null,
      },
    ]);
  }

  it('returns null newerId when the current image is the newest (Req 5.4)', async () => {
    queueThreeImageSinglePage();

    const result = await getAdjacentImageIds(NO_FILTER, 'c');

    // Newest edge: no newer neighbor; older neighbor is the next one down.
    expect(result).toEqual({ newerId: null, olderId: 'b', loadError: false });
  });

  it('returns null olderId when the current image is the oldest (Req 5.5)', async () => {
    queueThreeImageSinglePage();

    const result = await getAdjacentImageIds(NO_FILTER, 'a');

    // Oldest edge: no older neighbor; newer neighbor is the next one up.
    expect(result).toEqual({ newerId: 'b', olderId: null, loadError: false });
  });

  it('returns both neighbors for a middle image', async () => {
    queueThreeImageSinglePage();

    const result = await getAdjacentImageIds(NO_FILTER, 'b');

    expect(result).toEqual({ newerId: 'c', olderId: 'a', loadError: false });
  });

  it('returns both null for an id not present under the filter', async () => {
    queueThreeImageSinglePage();

    const result = await getAdjacentImageIds(NO_FILTER, 'does-not-exist');

    // Not an error — the id is genuinely absent under the filter.
    expect(result).toEqual({ newerId: null, olderId: null, loadError: false });
  });

  it('collects every page of the list before resolving neighbors', async () => {
    // Two pages: the current image's neighbors span the page boundary, so the
    // helper must page the full chain (nextToken "p2" then null) before sorting.
    queueListResponses([
      { data: [img('c', '2024-01-03T00:00:00.000Z')], nextToken: 'p2' },
      {
        data: [
          img('b', '2024-01-02T00:00:00.000Z'),
          img('a', '2024-01-01T00:00:00.000Z'),
        ],
        nextToken: null,
      },
    ]);

    const result = await getAdjacentImageIds(NO_FILTER, 'c');

    expect(result).toEqual({ newerId: null, olderId: 'b', loadError: false });
    expect(listMock).toHaveBeenCalledTimes(2);
    expect(listMock.mock.calls[1][0]).toMatchObject({ nextToken: 'p2' });
  });

  it('resolves both null with loadError true when a list page returns errors (Req 5.7)', async () => {
    queueListResponses([{ data: undefined, nextToken: null, errors: [{ message: 'boom' }] }]);

    const result = await getAdjacentImageIds(NO_FILTER, 'c');

    // A read error is distinguishable from a genuine no-neighbors result via
    // loadError === true — this is what makes the Req 5.7 ImageNav error state
    // reachable.
    expect(result).toEqual({ newerId: null, olderId: null, loadError: true });
  });
});
