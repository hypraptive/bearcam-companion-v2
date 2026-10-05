'use client';

// Client Component — App Router error boundary for the Image_Detail_Page,
// rendered when the Image fetch fails for an otherwise valid id (Req 4.8, 5.7).
import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';

type ImageDetailErrorProps = {
  /** The error thrown while rendering the detail page; `digest` is set for
   *  server-side errors so they can be correlated with server logs. */
  error: Error & { digest?: string };
  /** Re-attempts rendering the detail page segment (Req 4.8). */
  reset: () => void;
};

/**
 * Error state for the Image_Detail_Page (`/images/[id]`).
 *
 * Default export consumed by Next.js as the route segment's error boundary
 * (requires `'use client'` and the `{ error, reset }` signature). It is shown
 * when the Image record for a valid id cannot be retrieved due to a data-source
 * failure: it renders an "image could not be loaded" message with a retry
 * affordance that calls `reset()` to re-render the segment (Req 4.8), plus a
 * back-to-gallery link. It renders ZERO bounding box overlays — the
 * BoundingBoxLayer is never rendered in the error path, so no overlays appear
 * over a failed load (Req 4.8, 5.7).
 */
export default function ImageDetailError({
  error,
  reset,
}: ImageDetailErrorProps): React.JSX.Element {
  useEffect(() => {
    // Surface the failure in the browser console / monitoring for diagnosis.
    console.error('Image_Detail_Page failed to load image:', error);
  }, [error]);

  return (
    <div
      role="alert"
      className="container mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center"
    >
      <AlertTriangle className="size-10 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-lg font-medium text-foreground">Image could not be loaded</h1>
        <p className="text-sm text-muted-foreground">
          Something went wrong while loading this image. Please try again.
        </p>
      </div>
      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="sm" onClick={() => reset()}>
          Try again
        </Button>
        <Link href="/" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          Back to gallery
        </Link>
      </div>
    </div>
  );
}
