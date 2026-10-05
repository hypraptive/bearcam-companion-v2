'use client';

import { useEffect } from 'react';

const SCROLL_STORAGE_PREFIX = 'bearcam:gallery-scroll:';

type ScrollRestorerProps = {
  /**
   * The serialized Query_State (e.g. the gallery URL's query string) that keys
   * the saved scroll position. Each distinct filter/search/page combination
   * restores to its own remembered position.
   */
  stateKey: string;
};

/**
 * Scroll_Restorer — preserves the Gallery_Page's vertical scroll position so a
 * visitor returning from an Image_Detail_Page lands back approximately where
 * they left off (Req 6.7).
 *
 * Client Component: reads and writes `sessionStorage` and calls
 * `window.scrollTo`, all of which are browser-only APIs.
 *
 * Behavior:
 * - On mount (and whenever `stateKey` changes), restore the saved vertical
 *   scroll position for that key.
 * - While mounted, continuously record the current scroll position under the
 *   active key on scroll, and once more on unmount/navigation so the latest
 *   position is captured even without a trailing scroll event.
 *
 * Renders nothing (no visible output). All browser API access is guarded for
 * SSR safety.
 */
export function ScrollRestorer({ stateKey }: ScrollRestorerProps): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storageKey = `${SCROLL_STORAGE_PREFIX}${stateKey}`;

    const save = (): void => {
      try {
        window.sessionStorage.setItem(storageKey, String(window.scrollY));
      } catch {
        // sessionStorage can be unavailable (private mode, quota). Scroll
        // restoration is a progressive enhancement, so fail silently.
      }
    };

    // Restore the remembered position for this Query_State, if any.
    let restored: string | null = null;
    try {
      restored = window.sessionStorage.getItem(storageKey);
    } catch {
      restored = null;
    }
    if (restored !== null) {
      const y = Number.parseInt(restored, 10);
      if (Number.isFinite(y)) {
        window.scrollTo(0, y);
      }
    }

    window.addEventListener('scroll', save, { passive: true });

    return () => {
      // Capture the final position before leaving (e.g. navigating to a detail
      // page), then stop listening.
      save();
      window.removeEventListener('scroll', save);
    };
  }, [stateKey]);

  return null;
}
