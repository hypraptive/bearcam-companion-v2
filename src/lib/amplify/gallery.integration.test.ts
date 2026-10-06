import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryFilter } from './gallery';
import { getImageWithObjects, listImagesPage } from './gallery';

/**
 * Integration tests for the read-only, public-API-key wiring of the gallery
 * helpers (task 8.6).
 *
 * These verify how `src/lib/amplify/gallery.ts` talks to the Amplify data
 * client — that it reads with `authMode: 'apiKey'` (Req 7.2), issues only
 * read operations (list/get, never create/update/delete — Req 7.3), and maps
 * the client's result shape to the typed helper contract (Req 4.1, 4.6). The
 * Amplify data client is mocked so no deployed backend is required; the mock
 * records every method invoked and the arguments passed, which is exactly the
 * wiring under test (Req 7.1).
 *
 * This file deliberately uses a distinct name from the cursor-walk / adjacency
 * unit tests (task 8.5) so the two can be authored concurrently without
 * colliding.
 */

// --- Mock the Amplify data client -----------------------------------------
// gallery.ts reaches the backend exclusively through `client` imported from
// `./client`. Mocking that module avoids importing `amplify_outputs.json` /
// `generateClient`, which require a deployed backend. The mock exposes the full
// CRUD surface so we can assert the mutating methods are NEVER called.

const listMock = vi.fn();
const getMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();

// The gallery read helpers import `serverClient` (the server-configured data
// client). The mock exposes the same CRUD surface under both `serverClient`
// and `client` so the mock stays valid regardless of which the helpers use.
// The object is built inside the factory because `vi.mock` is hoisted above any
// module-level declarations.
vi.mock('./client', () => {
  const mockModels = {
    models: {
      Image: {
        list: (...args: unknown[]) => listMock(...args),
        get: (...args: unknown[]) => getMock(...args),
        create: (...args: unknown[]) => createMock(...args),
        update: (...args: unknown[]) => updateMock(...args),
        delete: (...args: unknown[]) => deleteMock(...args),
      },
      Object: {
        list: (...args: unknown[]) => listMock(...args),
        get: (...args: unknown[]) => getMock(...args),
        create: (...args: unknown[]) => createMock(...args),
        update: (...args: unknown[]) => updateMock(...args),
        delete: (...args: unknown[]) => deleteMock(...args),
      },
    },
  };
  return { serverClient: mockModels, client: mockModels };
});

const EMPTY_FILTER: GalleryFilter = {
  camFeed: null,
  yearRange: null,
  bears: 'any',
  q: '',
};

/** Assert no mutating client method was invoked (read-only guarantee, Req 7.3). */
function expectNoWrites(): void {
  expect(createMock).not.toHaveBeenCalled();
  expect(updateMock).not.toHaveBeenCalled();
  expect(deleteMock).not.toHaveBeenCalled();
}

beforeEach(() => {
  listMock.mockReset();
  getMock.mockReset();
  createMock.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
});

describe('listImagesPage — read-only apiKey access', () => {
  // Validates: Requirements 7.1, 7.2, 7.3
  it('passes authMode "apiKey" to the client list call', async () => {
    listMock.mockResolvedValue({ data: [], nextToken: null });

    await listImagesPage(EMPTY_FILTER, null);

    expect(listMock).toHaveBeenCalledTimes(1);
    const [listArgs] = listMock.mock.calls[0] as [{ authMode?: string }];
    expect(listArgs.authMode).toBe('apiKey');
  });

  // Validates: Requirements 7.3, 7.4
  it('issues only a read (list) operation — never create/update/delete', async () => {
    listMock.mockResolvedValue({
      data: [
        {
          id: 'img-1',
          url: 'https://example.org/1.jpg',
          date: '2024-07-01T12:00:00.000Z',
          s3Key: 'public/1.jpg',
          bearCount: 1,
          bearList: '480 Otis',
          camFeed: 'BF',
        },
      ],
      nextToken: null,
    });

    await listImagesPage(EMPTY_FILTER, null);

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(getMock).not.toHaveBeenCalled();
    expectNoWrites();
  });

  // Validates: Requirements 7.2, 7.3
  it('still uses apiKey and stays read-only when paging with a cursor', async () => {
    listMock.mockResolvedValue({ data: [], nextToken: null });

    await listImagesPage(EMPTY_FILTER, 'cursor-token-abc');

    const [listArgs] = listMock.mock.calls[0] as [{ authMode?: string; nextToken?: string }];
    expect(listArgs.authMode).toBe('apiKey');
    expect(listArgs.nextToken).toBe('cursor-token-abc');
    expectNoWrites();
  });
});

describe('getImageWithObjects — known vs unknown id', () => {
  // Validates: Requirements 4.1, 7.2, 7.3
  it('returns the image with its objects for a known seeded id', async () => {
    const seeded = {
      id: 'img-known',
      url: 'https://example.org/known.jpg',
      date: '2024-07-04T18:30:00.000Z',
      s3Key: 'public/known.jpg',
      bearCount: 2,
      bearList: '480 Otis,128 Grazer',
      camFeed: 'BF',
      objects: [
        {
          id: 'obj-1',
          label: 'Bear',
          confidence: 98.2,
          width: 0.2,
          height: 0.3,
          left: 0.1,
          top: 0.15,
          consensusName: '480 Otis',
          consensusConfidence: 0.875,
          totalVotes: 8,
        },
        {
          id: 'obj-2',
          label: 'Bear',
          confidence: 91.4,
          width: 0.15,
          height: 0.25,
          left: 0.5,
          top: 0.4,
          consensusName: '128 Grazer',
          consensusConfidence: 0.7,
          totalVotes: 5,
        },
      ],
    };
    getMock.mockResolvedValue({ data: seeded, errors: undefined });

    const result = await getImageWithObjects('img-known');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('img-known');
    expect(result?.objects).toHaveLength(2);
    expect(result?.objects.map((o) => o.id)).toEqual(['obj-1', 'obj-2']);

    // Read-only apiKey wiring: a single get with authMode apiKey, no writes.
    expect(getMock).toHaveBeenCalledTimes(1);
    const [getKey, getOpts] = getMock.mock.calls[0] as [
      { id: string },
      { authMode?: string },
    ];
    expect(getKey).toEqual({ id: 'img-known' });
    expect(getOpts.authMode).toBe('apiKey');
    expectNoWrites();
  });

  // Validates: Requirements 4.6, 7.3
  it('returns null for an unknown id when the client yields no record (data null)', async () => {
    getMock.mockResolvedValue({ data: null, errors: undefined });

    const result = await getImageWithObjects('img-unknown');

    expect(result).toBeNull();
    expect(getMock).toHaveBeenCalledTimes(1);
    expectNoWrites();
  });

  // Validates: Requirements 4.6, 7.3
  it('returns null for an unknown id when the client yields undefined data', async () => {
    getMock.mockResolvedValue({ data: undefined, errors: undefined });

    const result = await getImageWithObjects('img-missing');

    expect(result).toBeNull();
    expectNoWrites();
  });
});
