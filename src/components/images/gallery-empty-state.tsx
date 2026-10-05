import { ImageOff, SearchX, FileQuestion } from 'lucide-react';

/**
 * Which empty condition the Image_Grid is in. Each variant maps to a distinct
 * message so a visitor can tell "no data at all" from "your filters excluded
 * everything" from "you paged past the end" (design Error Handling table).
 *
 * - `no-images`   — the archive has zero Images (Req 7.7).
 * - `no-match`    — Images exist but none match the active filters/search
 *                   (Req 1.10, 2.11, 3.5).
 * - `page-beyond` — the requested page is past the available Images (Req 1.9).
 */
export type GalleryEmptyStateVariant = 'no-images' | 'no-match' | 'page-beyond';

type GalleryEmptyStateProps = {
  variant: GalleryEmptyStateVariant;
};

type EmptyStateContent = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

const EMPTY_STATE_CONTENT: Record<GalleryEmptyStateVariant, EmptyStateContent> = {
  'no-images': {
    icon: ImageOff,
    title: 'No images are available',
    description: 'There are no webcam images in the archive yet. Check back later.',
  },
  'no-match': {
    icon: SearchX,
    title: 'No images match the active filters/search',
    description:
      'Try adjusting or clearing the active filters and search to see more images.',
  },
  'page-beyond': {
    icon: FileQuestion,
    title: 'No images on this page',
    description: 'This page is beyond the available images. Step back to a previous page.',
  },
};

/**
 * Server Component that renders a distinct empty-state message for each gallery
 * empty condition. Rendered in place of the Image_Grid when a page yields no
 * displayable Images (Req 1.9, 1.10, 2.11, 3.5, 7.7).
 */
export function GalleryEmptyState({ variant }: GalleryEmptyStateProps): React.JSX.Element {
  const { icon: Icon, title, description } = EMPTY_STATE_CONTENT[variant];

  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center sm:py-24"
    >
      <Icon className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <p className="text-lg font-medium text-foreground">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
