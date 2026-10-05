// Server Component — no 'use client' directive. App Router not-found UI for the
// Image_Detail_Page, rendered when `page.tsx` calls `notFound()` for an id that
// matches no Image record (Req 4.6).
import Link from 'next/link';
import { ImageOff } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

/**
 * Not-found state for the Image_Detail_Page (`/images/[id]`).
 *
 * Default export consumed by Next.js when `notFound()` is invoked for an
 * unknown Image id (Req 4.6). It renders a 404-style message and a back-to-
 * gallery link, and renders ZERO bounding box overlays — the BoundingBoxLayer
 * is intentionally not rendered here, so no overlays exist for a missing image
 * (Req 4.6). Uses a Next.js `<Link>` for internal navigation back to the grid.
 */
export default function ImageNotFound(): React.JSX.Element {
  return (
    <div className="container mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center">
      <ImageOff className="size-10 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-lg font-medium text-foreground">Image not found</h1>
        <p className="text-sm text-muted-foreground">
          This image does not exist or may have been removed.
        </p>
      </div>
      <Link href="/" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        Back to gallery
      </Link>
    </div>
  );
}
