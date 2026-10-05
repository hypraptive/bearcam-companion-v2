import { ImageCard } from '@/components/images/image-card';
import type { ImageModel } from '@/lib/amplify/gallery';

type ImageGridProps = {
  /** The images to render, one `ImageCard` per entry (Req 1.1). */
  images: ImageModel[];
};

/**
 * The responsive Image_Grid (Req 1.1, 8.1, 8.2).
 *
 * Server Component: renders a mobile-first responsive grid of `ImageCard`s —
 * 1 column below `sm`, 2 at `sm`, 3 at `md`, 4 at `lg` — using Tailwind
 * utilities only. Each card links to its Image_Detail_Page at `/images/[id]`.
 */
export function ImageGrid({ images }: ImageGridProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {images.map((image) => (
        <ImageCard key={image.id} image={image} href={`/images/${image.id}`} />
      ))}
    </div>
  );
}
