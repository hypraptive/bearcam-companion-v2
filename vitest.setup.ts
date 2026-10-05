/**
 * Vitest global setup.
 *
 * Registers `@testing-library/jest-dom` matchers (e.g. `toBeInTheDocument`,
 * `toHaveClass`) for component tests and automatically unmounts React trees
 * rendered by `@testing-library/react` after each test so DOM-based tests do
 * not leak state into one another.
 *
 * This runs for every test file. The jest-dom matchers are harmless in the
 * node-environment logic tests that never touch the DOM; `cleanup` is a no-op
 * when nothing was rendered.
 */
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

afterEach(() => {
  cleanup();
});
