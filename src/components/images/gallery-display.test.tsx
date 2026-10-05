// @vitest-environment jsdom

/**
 * Component tests for the gallery display Server Components (task 10.4):
 *   - `ImageGrid`      — responsive 1/2/3/4-column breakpoint classes (Req 8.1)
 *   - `ImageCard`      — renders Next `<Image>` + `<Link>` and surfaces
 *                        `date` / `camFeed` / `bearCount` (Req 1.3, 1.4)
 *   - `GalleryEmptyState` — the three variants render distinct messages
 *                        (Req 1.9, 1.10, 7.7)
 *
 * These are plain render assertions. The components are Server Components, but
 * they are synchronous and side-effect free, so rendering them with
 * `@testing-library/react` under jsdom exercises exactly the markup a visitor
 * receives.
 *
 * `next/image` and `next/link` are mocked to lightweight DOM elements:
 *   - `<Image>` → a real `<img>` that forwards `src`/`alt`/`sizes`, so we can
 *     assert the Next image is rendered and carries the responsive `sizes`.
 *   - `<Link>`  → a real `<a>` that forwards `href` and children, so we can
 *     assert navigation target without pulling the Next router into the test.
 */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageCard } from './image-card';
import { ImageGrid } from './image-grid';
import {
  GalleryEmptyState,
  type GalleryEmptyStateVariant,
} from './gallery-empty-state';
import type { ImageModel } from '@/lib/amplify/gallery';

// --- next/image & next/link mocks -----------------------------------------
// Render to native elements so queries (getByRole('img'/'link')) and attribute
// assertions work without the Next runtime. Props irrelevant to the test (fill,
// unoptimized, className, etc.) are accepted and dropped.

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    sizes,
  }: {
    src: string;
    alt: string;
    sizes?: string;
    [key: string]: unknown;
  }) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img src={src} alt={alt} data-sizes={sizes} data-next-image="true" />;
  },
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} data-next-link="true">
      {children}
    </a>
  ),
}));

/** Build an `ImageModel` with just the fields the display components read. */
function makeImage(overrides: Partial<ImageModel> = {}): ImageModel {
  return {
    id: 'img-1',
    url: 'https://example.org/snapshot-1.jpg',
    date: '2024-07-04T18:30:00.000Z',
    s3Key: 'public/snapshot-1.jpg',
    bearCount: 2,
    bearList: '480 Otis,128 Grazer',
    camFeed: 'BF',
    ...overrides,
  } as ImageModel;
}

describe('ImageGrid — responsive breakpoint classes (Req 8.1)', () => {
  it('applies the 1/2/3/4 column classes at base/sm/md/lg', () => {
    const { container } = render(<ImageGrid images={[makeImage()]} />);

    const grid = container.firstElementChild as HTMLElement;
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveClass('grid');
    // 1 column below sm, 2 at sm, 3 at md, 4 at lg.
    expect(grid).toHaveClass('grid-cols-1');
    expect(grid).toHaveClass('sm:grid-cols-2');
    expect(grid).toHaveClass('md:grid-cols-3');
    expect(grid).toHaveClass('lg:grid-cols-4');
  });

  it('renders one ImageCard link per image', () => {
    const images = [
      makeImage({ id: 'a' }),
      makeImage({ id: 'b' }),
      makeImage({ id: 'c' }),
    ];

    render(<ImageGrid images={images} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/images/a',
      '/images/b',
      '/images/c',
    ]);
  });

  it('renders an empty grid (no cards) when given no images', () => {
    render(<ImageGrid images={[]} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});

describe('ImageCard — Next Image + Link and metadata (Req 1.3, 1.4)', () => {
  it('renders a Next <Link> to the detail href', () => {
    render(<ImageCard image={makeImage({ id: 'xyz' })} href="/images/xyz" />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/images/xyz');
    expect(link).toHaveAttribute('data-next-link', 'true');
  });

  it('renders the thumbnail through the Next <Image> component with responsive sizes', () => {
    render(
      <ImageCard image={makeImage({ url: 'https://example.org/a.jpg' })} href="/images/img-1" />,
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('data-next-image', 'true');
    expect(img).toHaveAttribute('src', 'https://example.org/a.jpg');
    // The sizes attribute must describe the 1/2/3/4-column layout (Req 8.4).
    const sizes = img.getAttribute('data-sizes') ?? '';
    expect(sizes).toContain('25vw'); // lg: 4 columns
    expect(sizes).toContain('33vw'); // md: 3 columns
    expect(sizes).toContain('50vw'); // sm: 2 columns
    expect(sizes).toContain('100vw'); // base: 1 column
  });

  it('shows the camFeed, a formatted date, and the bear count', () => {
    render(
      <ImageCard
        image={makeImage({ camFeed: 'RF', date: '2024-07-04T18:30:00.000Z', bearCount: 2 })}
        href="/images/img-1"
      />,
    );

    const link = screen.getByRole('link');
    // camFeed code.
    expect(within(link).getByText('RF')).toBeInTheDocument();
    // bear count, pluralized.
    expect(within(link).getByText('2 bears')).toBeInTheDocument();
    // date rendered as a year-containing string (locale-formatted).
    expect(link.textContent).toContain('2024');
  });

  it('pluralizes a single bear as "1 bear"', () => {
    render(<ImageCard image={makeImage({ bearCount: 1 })} href="/images/img-1" />);
    expect(screen.getByText('1 bear')).toBeInTheDocument();
  });

  it('treats a null bearCount as 0 bears', () => {
    render(
      <ImageCard image={makeImage({ bearCount: null })} href="/images/img-1" />,
    );
    expect(screen.getByText('0 bears')).toBeInTheDocument();
  });

  it('falls back to an em dash and a placeholder when url and date are missing', () => {
    render(
      <ImageCard
        image={makeImage({ url: null, date: null, camFeed: null })}
        href="/images/img-1"
      />,
    );

    // No Next image is rendered without a url; a text placeholder shows instead.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('No image')).toBeInTheDocument();
    // Missing camFeed and date both render the em-dash fallback.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });
});

describe('GalleryEmptyState — distinct messages per variant (Req 1.9, 1.10, 7.7)', () => {
  const variants: GalleryEmptyStateVariant[] = ['no-images', 'no-match', 'page-beyond'];

  it('renders each variant with a status role', () => {
    for (const variant of variants) {
      const { unmount } = render(<GalleryEmptyState variant={variant} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
      unmount();
    }
  });

  it('renders the no-images message (archive is empty — Req 7.7)', () => {
    render(<GalleryEmptyState variant="no-images" />);
    expect(screen.getByText('No images are available')).toBeInTheDocument();
  });

  it('renders the no-match message (filters exclude everything — Req 1.10)', () => {
    render(<GalleryEmptyState variant="no-match" />);
    expect(
      screen.getByText('No images match the active filters/search'),
    ).toBeInTheDocument();
  });

  it('renders the page-beyond message (paged past the end — Req 1.9)', () => {
    render(<GalleryEmptyState variant="page-beyond" />);
    expect(screen.getByText('No images on this page')).toBeInTheDocument();
  });

  it('gives all three variants mutually distinct titles', () => {
    const titles = variants.map((variant) => {
      const { container, unmount } = render(<GalleryEmptyState variant={variant} />);
      // The title is the first <p> (font-medium) within the status region.
      const title = container.querySelector('p')?.textContent ?? '';
      unmount();
      return title;
    });

    expect(new Set(titles).size).toBe(titles.length);
  });
});
