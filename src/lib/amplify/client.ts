import { generateClient } from 'aws-amplify/data';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';
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

// Browser-side client — typed against the generated schema.
// Use only within components marked `'use client'`.
export const client = generateClient<Schema>();
