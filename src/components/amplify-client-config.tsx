'use client';

import { Amplify } from 'aws-amplify';
import outputs from '../../amplify_outputs.json';

/**
 * Configures Amplify in the browser so client components can use the browser
 * data client (`client` from `@/lib/amplify/client`) and Amplify Auth.
 *
 * Server Components do NOT rely on this — they use the server-configured
 * `serverClient`. This only covers the client runtime. `ssr: true` lets the
 * client pick up credentials from cookies set during server rendering.
 *
 * Rendered once near the root of the tree (see `app/layout.tsx`). It renders
 * nothing; configuration runs as a module side effect on the client.
 */
Amplify.configure(outputs, { ssr: true });

export function AmplifyClientConfig(): null {
  return null;
}
