import { generateClient } from 'aws-amplify/data';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';
import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import outputs from '../../../amplify_outputs.json';
import type { Schema } from '../../../amplify/data/resource';

/**
 * Amplify client entry points for BearCam Companion v2.
 *
 * The direct `amplify_outputs.json` import is intentional: if the backend has
 * not been deployed and the file is absent, TypeScript and the Next.js build
 * fail with a module-resolution error rather than a runtime error
 * (Requirement 8.6). Do not stub or guard this import.
 */

// Server-side runner — for use in Server Components and Route Handlers.
// Reads session credentials from cookies within a Next.js request context.
export const { runWithAmplifyServerContext } = createServerRunner({
  config: outputs,
});

/**
 * Server-side data client for Server Components.
 *
 * Created with the Next.js adapter so it is configured from `outputs` on every
 * server render — a plain `generateClient()` is NOT configured on the server
 * (nothing calls `Amplify.configure` there) and every query would fail. The
 * cookies variant yields a client whose `.models.*` calls work directly, and
 * works for public `apiKey` reads with or without a user session present.
 *
 * Use this (not the browser `client`) from any Server Component data path.
 */
export const serverClient = generateServerClientUsingCookies<Schema>({
  config: outputs,
  cookies,
});

// Browser-side client — typed against the generated schema.
// Use only within components marked `'use client'`, after Amplify has been
// configured on the client (see `AmplifyClientConfig`).
export const client = generateClient<Schema>();
