// @vitest-environment jsdom

/**
 * Component tests for the bounding-box overlay layer, image navigation, and the
 * consensus label (task 12.5):
 *   - `BoundingBoxLayer` — renders exactly one overlay per Bear-labeled object
 *                          and zero overlays when there are no Bear objects
 *                          (Req 4.3).
 *   - `ImageNav`         — the next control is disabled at the newest edge
 *                          (`newerId === null`, Req 5.4) and the previous
 *                          control is disabled at the oldest edge
 *                          (`olderId === null`, Req 5.5); a present adjacent id
 *                          renders a navigable `<Link>` carrying the Query_State
 *                          forward.
 *   - `ConsensusLabel`   — a non-null `consensusName` renders the name + vote
 *                          count; a null `consensusName` renders the
 *                          no-identification placeholder with 0 votes (Req 4.5).
 *
 * `next/link` is mocked to a native `<a>` so `getByRole('link')` and `href`
 * assertions work without the Next router. `BoundingBox` is mocked to a tiny
 * marker element so the overlay-count assertions isolate `BoundingBoxLayer`'s
 * Bear-selection + measurement logic from the child's rendering.
 *
 * `BoundingBoxLayer` measures its container via a `ref` + `ResizeObserver`,
 * reading `clientWidth`/`clientHeight` — both of which are 0 and `undefined`
 * respectively in jsdom. We install a stub `ResizeObserver` and force non-zero
 * element dimensions via `Object.defineProperty` on `HTMLElement.prototype`, so
 * the layer measures a real rendered box and draws its overlays.
 */

import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsensusLabel } from './consensus-label';
import { ImageNav } from '@/components/images/image-nav';
import type { ObjectModel } from '@/lib/amplify/gallery';

// --- next/link mock --------------------------------------------------------
// Render to a native <a> so queries and href assertions work without the Next
// runtime. Props irrelevant to the test (className, aria-*, etc.) are forwarded
// where cheap and otherwise dropped.

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} data-next-link="true" {...rest}>
      {children}
    </a>
  ),
}));

// --- BoundingBox mock ------------------------------------------------------
// Replace the painted rectangle with a tiny marker so overlay counting is
// stable and focused on BoundingBoxLayer's selection logic. The marker records
// the object id so we can assert *which* objects were overlaid.

vi.mock('@/components/bears/bounding-box', () => ({
  __esModule: true,
  BoundingBox: ({ object }: { object: ObjectModel; rect: unknown }) => (
    <div data-testid="overlay" data-object-id={object.id} />
  ),
}));

// BoundingBoxLayer is imported after the BoundingBox mock is registered.
import { BoundingBoxLayer } from './bounding-box-layer';

/** Build an `ObjectModel` with just the fields the overlay layer reads. */
function makeObject(overrides: Partial<ObjectModel> = {}): ObjectModel {
  return {
    id: 'obj-1',
    label: 'Bear',
    confidence: 90,
    left: 0.1,
    top: 0.1,
    width: 0.2,
    height: 0.2,
    imageId: 'img-1',
    consensusName: null,
    consensusConfidence: null,
    totalVotes: 0,
    ...overrides,
  } as ObjectModel;
}

// --- jsdom measurement shims ----------------------------------------------
// BoundingBoxLayer only draws overlays once it has measured a non-zero box.
// jsdom reports clientWidth/clientHeight as 0 and has no ResizeObserver, so we
// stub both. Dimensions are installed on the prototype (restored afterwards).

const MEASURED_WIDTH = 800;
const MEASURED_HEIGHT = 600;

let widthSpy: ReturnType<typeof vi.spyOn> | undefined;
let heightSpy: ReturnType<typeof vi.spyOn> | undefined;

beforeEach(() => {
  // A minimal ResizeObserver whose callback is never required to fire — the
  // layer takes an initial synchronous measurement on mount, which is enough.
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', StubResizeObserver);

  widthSpy = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockReturnValue(MEASURED_WIDTH);
  heightSpy = vi
    .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
    .mockReturnValue(MEASURED_HEIGHT);
});

afterEach(() => {
  widthSpy?.mockRestore();
  heightSpy?.mockRestore();
  vi.unstubAllGlobals();
});

describe('BoundingBoxLayer — one overlay per Bear object (Req 4.3)', () => {
  it('renders exactly one overlay for each Bear-labeled object', () => {
    const objects = [
      makeObject({ id: 'bear-a', label: 'Bear' }),
      makeObject({ id: 'bear-b', label: 'Bear' }),
      makeObject({ id: 'bear-c', label: 'Bear' }),
    ];

    render(<BoundingBoxLayer objects={objects} />);

    const overlays = screen.getAllByTestId('overlay');
    expect(overlays).toHaveLength(3);
    expect(overlays.map((o) => o.getAttribute('data-object-id'))).toEqual([
      'bear-a',
      'bear-b',
      'bear-c',
    ]);
  });

  it('overlays only the Bear objects, ignoring non-Bear detections', () => {
    const objects = [
      makeObject({ id: 'bear-1', label: 'Bear' }),
      makeObject({ id: 'bird-1', label: 'Bird' }),
      makeObject({ id: 'person-1', label: 'Person' }),
      makeObject({ id: 'bear-2', label: 'Bear' }),
    ];

    render(<BoundingBoxLayer objects={objects} />);

    const overlays = screen.getAllByTestId('overlay');
    expect(overlays).toHaveLength(2);
    expect(overlays.map((o) => o.getAttribute('data-object-id'))).toEqual([
      'bear-1',
      'bear-2',
    ]);
  });

  it('renders zero overlays when there are no Bear objects', () => {
    const objects = [
      makeObject({ id: 'bird-1', label: 'Bird' }),
      makeObject({ id: 'fish-1', label: 'Fish' }),
    ];

    render(<BoundingBoxLayer objects={objects} />);

    expect(screen.queryAllByTestId('overlay')).toHaveLength(0);
  });

  it('renders zero overlays when given an empty object list', () => {
    render(<BoundingBoxLayer objects={[]} />);
    expect(screen.queryAllByTestId('overlay')).toHaveLength(0);
  });

  it('renders zero overlays while the image box is unmeasured (zero size)', () => {
    // Simulate an unmeasured box: clientWidth/clientHeight report 0, so the
    // layer must withhold overlays until it has real dimensions.
    widthSpy?.mockReturnValue(0);
    heightSpy?.mockReturnValue(0);

    render(<BoundingBoxLayer objects={[makeObject({ id: 'bear-1', label: 'Bear' })]} />);

    expect(screen.queryAllByTestId('overlay')).toHaveLength(0);
  });
});

describe('ImageNav — disabled edges and navigable links (Req 5.4, 5.5)', () => {
  it('disables the next control at the newest edge (newerId null, Req 5.4)', () => {
    render(<ImageNav newerId={null} olderId="older-1" query="" />);

    // The next edge is a non-interactive span, not a link.
    const next = screen.getByLabelText('Next image (newer), unavailable');
    expect(next.tagName).toBe('SPAN');
    expect(next).toHaveAttribute('aria-disabled', 'true');
    expect(next).not.toHaveAttribute('href');

    // The present older id still renders a navigable link.
    const prev = screen.getByRole('link', { name: 'Previous image (older)' });
    expect(prev).toHaveAttribute('href', '/images/older-1');
  });

  it('disables the previous control at the oldest edge (olderId null, Req 5.5)', () => {
    render(<ImageNav newerId="newer-1" olderId={null} query="" />);

    const prev = screen.getByLabelText('Previous image (older), unavailable');
    expect(prev.tagName).toBe('SPAN');
    expect(prev).toHaveAttribute('aria-disabled', 'true');
    expect(prev).not.toHaveAttribute('href');

    const next = screen.getByRole('link', { name: 'Next image (newer)' });
    expect(next).toHaveAttribute('href', '/images/newer-1');
  });

  it('disables both controls when the current image is the only one', () => {
    render(<ImageNav newerId={null} olderId={null} query="" />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(
      screen.getByLabelText('Next image (newer), unavailable'),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByLabelText('Previous image (older), unavailable'),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders both controls as links carrying the Query_State forward unchanged', () => {
    render(
      <ImageNav newerId="newer-1" olderId="older-1" query="feed=BF&bears=with&page=2" />,
    );

    const next = screen.getByRole('link', { name: 'Next image (newer)' });
    const prev = screen.getByRole('link', { name: 'Previous image (older)' });
    expect(next).toHaveAttribute('href', '/images/newer-1?feed=BF&bears=with&page=2');
    expect(prev).toHaveAttribute('href', '/images/older-1?feed=BF&bears=with&page=2');
  });

  it('shows an inline load-error indication without offering extra navigation', () => {
    render(<ImageNav newerId={null} olderId="older-1" query="" loadError />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The adjacent image could not be loaded.');
    // Still only the resolved (older) edge is navigable.
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});

describe('ConsensusLabel — null vs non-null rendering (Req 4.5)', () => {
  it('renders the consensus name and vote count when identified', () => {
    const { container } = render(
      <ConsensusLabel consensusName="480 Otis" totalVotes={7} />,
    );

    expect(screen.getByText('480 Otis')).toBeInTheDocument();
    expect(screen.getByText('7 votes')).toBeInTheDocument();
    expect(container.textContent).not.toContain('No identification yet');
  });

  it('pluralizes a single vote as "1 vote"', () => {
    render(<ConsensusLabel consensusName="128 Grazer" totalVotes={1} />);

    expect(screen.getByText('128 Grazer')).toBeInTheDocument();
    expect(screen.getByText('1 vote')).toBeInTheDocument();
  });

  it('renders the no-identification placeholder with 0 votes when consensusName is null', () => {
    const { container } = render(
      <ConsensusLabel consensusName={null} totalVotes={null} />,
    );

    expect(screen.getByText('No identification yet')).toBeInTheDocument();
    expect(screen.getByText('0 votes')).toBeInTheDocument();
    // No bear name is shown in the no-identification case.
    expect(within(container).queryByText(/Otis|Grazer/)).not.toBeInTheDocument();
  });

  it('shows 0 votes for a null consensusName even when a vote count is supplied', () => {
    // consensusName null is authoritative: votes are reported as 0 regardless
    // of the incoming totalVotes (Req 4.5).
    render(<ConsensusLabel consensusName={null} totalVotes={5} />);

    expect(screen.getByText('No identification yet')).toBeInTheDocument();
    expect(screen.getByText('0 votes')).toBeInTheDocument();
    expect(screen.queryByText('5 votes')).not.toBeInTheDocument();
  });
});
