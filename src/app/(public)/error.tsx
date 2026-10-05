'use client';

// Grid error state for the Gallery_Page (Req 1.11, 7.6).
//
// This is the App Router error boundary for the `(public)` route group. It must
// be a Client Component ('use client') because an error.tsx receives the
// `reset` callback and renders interactive retry UI. Next.js invokes this when
// the Gallery_Page's server render throws — e.g. when the AppSync image-list
// read fails — instead of rendering partial or stale image content (Req 7.6).
//
// Query_State preservation (Req 1.11): the active filters, search term, and
// pagination live entirely in the URL query string. An error boundary does not
// change the URL, so the Query_State is still present. Calling `reset()`
// re-renders this same route segment against that unchanged URL, which re-runs
// the server fetch with the identical Query_State — so the retry re-applies the
// visitor's filters/search/page automatically, with no state to thread through
// here.
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type GalleryErrorProps = {
  /** The error thrown during the Gallery_Page render (standard Next.js boundary prop). */
  error: Error & { digest?: string };
  /**
   * Re-renders the errored route segment against the current (unchanged) URL,
   * re-running the server fetch with the same Query_State (Req 1.11).
   */
  reset: () => void;
};

/**
 * Gallery_Page error boundary (Req 1.11, 7.6).
 *
 * Renders a non-blocking error message indicating images could not be loaded
 * and a retry affordance that calls `reset()`. The active Query_State is
 * preserved in the URL and re-applied by the retry (see file header).
 */
export default function GalleryError({ error, reset }: GalleryErrorProps): React.JSX.Element {
  useEffect(() => {
    // Surface the failure in the browser console for diagnostics; the UI stays
    // a friendly, generic message.
    console.error('Gallery image list failed to load:', error);
  }, [error]);

  return (
    <div
      role="alert"
      className="container mx-auto flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 py-16 text-center"
    >
      <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="text-lg font-medium text-foreground">Images could not be loaded</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Something went wrong while fetching the gallery. Your filters and search are
          preserved — try again.
        </p>
      </div>
      <Button variant="default" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
