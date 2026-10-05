import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { ImageModel } from '@/lib/amplify/gallery';

/**
 * `sizes` attribute matching the Image_Grid responsive column layout
 * (Req 8.1, 8.4): 1 column below `sm`, 2 at `sm`, 3 at `md`, 4 at `lg`.
 * Each entry maps a min-width media query to the thumbnail's rendered width as
 * a fraction of the viewport, so Next.js can request an appropriately sized
 * source. Tailwind's default breakpoints are sm=640px, md=768px, lg=1024px.
 */
const THUMBNAIL_SIZES =
  '(min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw';

/**
 * Format an Image `date` (an ISO datetime string, possibly null) for display on
 * the card. Falls back to an em dash when the date is missing or unparseable so
 * the card never renders a broken value.
 */
function formatCardDate(date: string | null | undefined): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type ImageCardProps = {
  /** The Image record to summarize (Req 1.4). */
  image: ImageModel;
  /** The Image_Detail_Page href, carrying any active Query_State (Req 1.3). */
  href: string;
};

/**
 * A single cell in the Image_Grid representing one Image (Image_Card).
 *
 * Server Component: renders the thumbnail through the Next.js `<Image>`
 * component with a `sizes` attribute matching the responsive grid (Req 1.3,
 * 8.4) and navigates to the Image_Detail_Page through the Next.js `<Link>`
 * component (Req 1.3, 8.5). Displays the Image `date`, `camFeed`, and
 * `bearCount` (Req 1.4).
 */
export function ImageCard({ image, href }: ImageCardProps): React.JSX.Element {
  const { url, date, camFeed, bearCount } = image;
  const bears = bearCount ?? 0;

  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg border border-border bg-card',
        'transition-colors hover:border-ring focus-visible:border-ring',
        'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {url ? (
          <Image
            src={url}
            alt={`${camFeed ?? 'Webcam'} snapshot from ${formatCardDate(date)}`}
            fill
            sizes={THUMBNAIL_SIZES}
            unoptimized
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 p-2 text-xs sm:text-sm">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{camFeed ?? '—'}</span>
          <span className="truncate text-muted-foreground">{formatCardDate(date)}</span>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            bears > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          {bears} {bears === 1 ? 'bear' : 'bears'}
        </span>
      </div>
    </Link>
  );
}
