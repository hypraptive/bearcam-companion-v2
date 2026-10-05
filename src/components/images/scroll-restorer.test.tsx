// @vitest-environment jsdom

/**
 * Interaction test for `ScrollRestorer` (task 13.2).
 *
 * `ScrollRestorer` renders nothing — its behavior lives entirely in a browser
 * effect that reads/writes `sessionStorage` and calls `window.scrollTo`. This
 * suite drives those two APIs directly to assert the save/restore contract
 * keyed by the serialized Query_State (Req 6.7):
 *
 *   - On mount, a previously-saved vertical position for the key is restored
 *     via `window.scrollTo`.
 *   - A `scroll` event (and unmount) saves the current `window.scrollY` under
 *     the key.
 *   - Distinct `stateKey`s restore independently — one key's saved position
 *     never leaks into another.
 *
 * jsdom does not implement `window.scrollTo`, so it is spied/stubbed. The
 * component namespaces its sessionStorage keys with `bearcam:gallery-scroll:`,
 * so the test asserts through the public `window.scrollTo` / `window.scrollY`
 * surface and the component's own round-trip rather than hard-coding internals.
 */

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollRestorer } from './scroll-restorer';

const STORAGE_PREFIX = 'bearcam:gallery-scroll:';

/** The key `ScrollRestorer` persists under for a given Query_State. */
function storageKeyFor(stateKey: string): string {
  return `${STORAGE_PREFIX}${stateKey}`;
}

/** Seed a saved scroll position as if a prior visit had recorded it. */
function seedSavedScroll(stateKey: string, y: number): void {
  window.sessionStorage.setItem(storageKeyFor(stateKey), String(y));
}

/** Set the current vertical scroll offset jsdom reports via `window.scrollY`. */
function setScrollY(y: number): void {
  Object.defineProperty(window, 'scrollY', {
    value: y,
    writable: true,
    configurable: true,
  });
}

/** Dispatch a window scroll event the way a real scroll would. */
function fireScroll(): void {
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
}

let scrollToSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.sessionStorage.clear();
  setScrollY(0);
  // jsdom doesn't implement scrollTo — install a spy to observe restore calls.
  scrollToSpy = vi.fn();
  Object.defineProperty(window, 'scrollTo', {
    value: scrollToSpy,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ScrollRestorer — restore on mount (Req 6.7)', () => {
  it('restores the saved vertical position for the stateKey on mount', () => {
    const stateKey = '?feed=BF&bears=with';
    seedSavedScroll(stateKey, 640);

    render(<ScrollRestorer stateKey={stateKey} />);

    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    // Called with the restored y as the vertical component.
    const [, y] = scrollToSpy.mock.calls[0];
    expect(y).toBe(640);
  });

  it('does not scroll when there is no saved position for the key', () => {
    render(<ScrollRestorer stateKey="?feed=RF" />);
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('ignores a corrupt (non-numeric) saved value instead of scrolling', () => {
    window.sessionStorage.setItem(storageKeyFor('?page=2'), 'not-a-number');

    render(<ScrollRestorer stateKey="?page=2" />);

    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});

describe('ScrollRestorer — save on scroll and unmount (Req 6.7)', () => {
  it('saves the current scrollY under the key on a scroll event', () => {
    const stateKey = '?feed=BF';
    render(<ScrollRestorer stateKey={stateKey} />);

    setScrollY(420);
    fireScroll();

    expect(window.sessionStorage.getItem(storageKeyFor(stateKey))).toBe('420');
  });

  it('captures the latest position on unmount even without a trailing scroll event', () => {
    const stateKey = '?feed=KRV';
    const { unmount } = render(<ScrollRestorer stateKey={stateKey} />);

    setScrollY(910);
    act(() => {
      unmount();
    });

    expect(window.sessionStorage.getItem(storageKeyFor(stateKey))).toBe('910');
  });

  it('round-trips: a saved scroll is restored on a later mount with the same key', () => {
    const stateKey = '?bears=without';

    // First visit: scroll down, then leave.
    const first = render(<ScrollRestorer stateKey={stateKey} />);
    setScrollY(300);
    fireScroll();
    act(() => {
      first.unmount();
    });

    // Return visit: mount again, scroll position should be restored.
    scrollToSpy.mockClear();
    setScrollY(0);
    render(<ScrollRestorer stateKey={stateKey} />);

    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    const [, y] = scrollToSpy.mock.calls[0];
    expect(y).toBe(300);
  });
});

describe('ScrollRestorer — independence across Query_State keys (Req 6.7)', () => {
  it('restores each stateKey to its own saved position', () => {
    seedSavedScroll('?feed=BF', 100);
    seedSavedScroll('?feed=RF', 800);

    // Mount for the BF key — restores 100, not 800.
    const bf = render(<ScrollRestorer stateKey="?feed=BF" />);
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy.mock.calls[0][1]).toBe(100);
    act(() => bf.unmount());

    // Mount for the RF key — restores 800, independently.
    scrollToSpy.mockClear();
    render(<ScrollRestorer stateKey="?feed=RF" />);
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy.mock.calls[0][1]).toBe(800);
  });

  it('saving under one key does not overwrite another key', () => {
    seedSavedScroll('?feed=RF', 800);

    const stateKey = '?feed=BF';
    render(<ScrollRestorer stateKey={stateKey} />);
    setScrollY(250);
    fireScroll();

    // The BF key got the new value; the RF key is untouched.
    expect(window.sessionStorage.getItem(storageKeyFor('?feed=BF'))).toBe('250');
    expect(window.sessionStorage.getItem(storageKeyFor('?feed=RF'))).toBe('800');
  });
});
