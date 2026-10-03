# Implementation Plan: project-setup

## Overview

Bootstrap BearCam Companion v2 from an empty repository to a deployed skeleton on Amplify Hosting. Tasks follow a strict dependency order: Next.js scaffold first, then Amplify Gen 2 backend, then frontend source files, then verification and deployment. Each task builds directly on the one before it — no orphaned code.

## Tasks

- [x] 1. Bootstrap the Next.js project
  - Run `npx create-next-app@latest bearcam-companion-v2 --typescript --app --src-dir --no-tailwind --eslint --import-alias "@/*"` in the workspace root
  - Confirm the generated `tsconfig.json` has `"strict": true`; add `"noImplicitAny": true` if absent
  - Delete the generated `pages/` directory if present — App Router only
  - Remove the placeholder `src/app/page.tsx` and `src/app/globals.css` content (they will be replaced in later tasks)
  - Confirm `next` version is 14 or higher in `package.json`
  - _Requirements: 1.1, 1.2_

- [x] 2. Initialize Amplify Gen 2
  - Run `npm create amplify@latest` inside the project directory to generate the `amplify/` directory and add Amplify packages to `package.json`
  - Confirm `amplify/backend.ts`, `amplify/auth/resource.ts`, `amplify/data/resource.ts`, and `amplify/storage/resource.ts` stubs are present after init
  - _Requirements: 3.1, 3.2_

- [x] 3. Install and configure Tailwind CSS v4
  - [x] 3.1 Install Tailwind v4 and PostCSS plugin
    - Run `npm install tailwindcss @tailwindcss/postcss postcss`
    - Confirm `tailwindcss` version is `^4.x` in `package.json`
    - _Requirements: 1.4_
  - [x] 3.2 Create PostCSS config and globals.css
    - Create `postcss.config.mjs` with `@tailwindcss/postcss` as the sole plugin (see design §3)
    - Replace `src/app/globals.css` content with `@import "tailwindcss";` as the sole line — no `tailwind.config.js` file
    - _Requirements: 1.4_

- [x] 4. Initialize shadcn/ui
  - Run `npx shadcn@latest init` — select Default style, Neutral base color, CSS variables yes, components path `src/components/ui`
  - Confirm `src/components/ui/` directory is created and `globals.css` is updated with shadcn design tokens
  - Confirm no `tailwind.config.js` was generated (shadcn v4-compatible init uses CSS-only config)
  - _Requirements: 1.5_

- [x] 5. Install remaining frontend dependencies
  - Run `npm install aws-amplify @aws-amplify/ui-react clsx tailwind-merge lucide-react`
  - Confirm none of `react-icons`, `@heroicons/react`, or `@fortawesome/*` appear in `package.json`
  - _Requirements: 1.5, 1.6_

- [x] 6. Create directory structure with placeholders
  - Create `src/app/(public)/.gitkeep`
  - Create `src/app/(auth)/.gitkeep`
  - Create `src/app/admin/.gitkeep`
  - Create `src/components/bears/.gitkeep`
  - Create `src/components/images/.gitkeep`
  - Create `src/lib/amplify/.gitkeep` (will be replaced when client files are written)
  - Create `src/types/.gitkeep`
  - Create `amplify/functions/ingest-image/.gitkeep`
  - Create `amplify/functions/detect-objects/.gitkeep`
  - Create `amplify/functions/compute-bear-list/.gitkeep`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.11_

- [x] 7. Write `amplify/auth/resource.ts`
  - Implement `defineAuth()` with `loginWith.email: true`, `groups: ['admin']`, the password policy (min 8, uppercase, lowercase, numbers, symbols), and `preferredUsername` attribute (optional, mutable)
  - Export the result as `export const auth`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 8. Write `amplify/storage/resource.ts`
  - Implement `defineStorage()` with bucket name `bearcam-images` and the `public/*` access rules: guest → read, authenticated → read, admin group → read/write/delete
  - Export the result as `export const storage`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 9. Write `amplify/data/resource.ts`
  - [x] 9.1 Define all four models with correct fields and relationships
    - `Image` model: `url`, `date`, `s3Key`, `bearCount`, `bearList`, `camFeed` enum (`BF`,`RF`,`BFL`,`KRV`,`RW`), `hasMany Object` via `imageId`
    - `Object` model: `label`, `confidence`, `width`, `height`, `left`, `top`, `imageId` (required), `consensusName`, `consensusConfidence`, `totalVotes`, `belongsTo Image`, `hasMany Identification` via `objectId`
    - `Identification` model: `bearId` (nullable), `name`, `userId`, `userDisplayName`, `objectId` (required), `belongsTo Object`, `belongsTo Bear`
    - `Bear` model: `number`, `name`, `displayName`, `notes`, `active`, `hasMany Identification` via `bearId`
    - _Requirements: 6.2, 6.3, 6.4, 6.5_
  - [x] 9.2 Apply authorization rules to all models
    - `Image`: publicApiKey → read; admin group → create/update/delete
    - `Object`: publicApiKey → read; admin group → create/update/delete
    - `Identification`: publicApiKey → read; authenticated → create; owner → update/delete; admin group → create/update/delete
    - `Bear`: publicApiKey → read; admin group → create/update/delete
    - _Requirements: 6.6, 6.7, 6.8, 6.9_
  - [x] 9.3 Configure `defineData()` and export Schema type
    - Import `auth` from `../auth/resource` and pass it to `defineData()` so owner/group rules bind to the Cognito User Pool
    - Set `defaultAuthorizationMode: 'apiKey'` with 365-day expiry
    - Export `export type Schema = typeof schema` for typed client derivation
    - Export the result as `export const data`
    - _Requirements: 6.1, 6.11, 6.12_

- [x] 10. Write `amplify/backend.ts`
  - Import `auth`, `data`, and `storage` from their respective resource files
  - Call `defineBackend({ auth, data, storage })` — no other resources
  - _Requirements: 3.3_

- [x] 11. Write `src/lib/constants.ts`
  - Export `CAM_FEEDS` as a `const` object with exactly 5 keys (`BF`, `RF`, `BFL`, `KRV`, `RW`) typed `as const satisfies Record<string, string>`
  - Export `CamFeed` type derived as `keyof typeof CAM_FEEDS`
  - Export `META_IDENTIFICATION_OPTIONS` as a readonly tuple (`as const`) with exactly these 10 entries in order: `"Not a bear"`, `"Unknown"`, `"Unknown Adult"`, `"Unknown Subadult"`, `"Known Adult"`, `"Known Subadult"`, `"Cub (COY)"`, `"Cub (1.5yo)"`, `"Cub (2.5yo)"`, `"Cub (3.5yo)"`
  - Export `MetaIdentificationOption` type derived from the tuple
  - No `CAM_FEED_SLUGS` export — `CAM_FEEDS` is the canonical name
  - This file must have zero Next.js or browser dependencies so it is safe to import from Lambda functions
  - _Requirements: 7.1, 7.2, 7.3, 7.6_

- [x] 12. Write `src/lib/utils.ts`
  - Import `clsx` and `type ClassValue` from `clsx`, and `twMerge` from `tailwind-merge`
  - Export `cn(...inputs: ClassValue[]): string` that calls `twMerge(clsx(inputs))`
  - Explicit `string` return type required
  - _Requirements: 7.4, 7.5_

- [x] 13. Write `src/lib/amplify/client.ts`
  - Remove the `.gitkeep` placeholder from `src/lib/amplify/` before creating files
  - Import `generateClient` from `aws-amplify/data` and `createServerRunner` from `@aws-amplify/adapter-nextjs`
  - Import `outputs` from `../../../amplify_outputs.json` and `type Schema` from `../../../amplify/data/resource`
  - Export `runWithAmplifyServerContext` via `createServerRunner({ config: outputs })` for Server Component use
  - Export `client` via `generateClient<Schema>()` for Client Component use
  - The direct `amplify_outputs.json` import ensures a build-time error if the file is absent (satisfies Requirement 8.6)
  - _Requirements: 8.1, 8.2, 8.3, 8.6_

- [x] 14. Write `src/lib/amplify/auth.ts`
  - Import `fetchAuthSession` from `aws-amplify/auth`
  - Export `async function isAdmin(): Promise<boolean>` that fetches the auth session, reads `session.tokens?.accessToken?.payload?.['cognito:groups']`, and returns `true` if and only if the array includes `"admin"`
  - Return `false` (never throw) for unauthenticated users, absent `cognito:groups` claim, or any caught error
  - _Requirements: 8.4, 8.5_

- [ ] 15. Write `src/lib/amplify/index.ts`
  - Re-export `{ runWithAmplifyServerContext, client }` from `./client`
  - Re-export `{ isAdmin }` from `./auth`
  - _Requirements: 2.8_

- [ ] 16. Write `src/components/layout/nav.tsx`
  - Named export `Nav` (no default export) with explicit `React.JSX.Element` return type
  - Render a `<header>` with a `<Link href="/">` for the app name "BearCam Companion" and a `<Link href="/login">` for the login link
  - Use only `next/link` `<Link>` for internal navigation — no raw `<a>` tags with same-origin hrefs
  - Tailwind utility classes only — no inline styles
  - _Requirements: 9.1, 9.5, 9.6_

- [ ] 17. Write `src/components/layout/footer.tsx`
  - Named export `Footer` (no default export) with explicit `React.JSX.Element` return type
  - Render a `<footer>` with attribution text linking to `https://explore.org` via a plain `<a>` (external link — `<Link>` is for internal navigation only)
  - Tailwind utility classes only
  - _Requirements: 9.1, 9.5_

- [ ] 18. Write `src/app/layout.tsx`
  - Default export `RootLayout` (required by Next.js App Router) accepting `{ children: ReactNode }`
  - Import and render named `Nav` from `@/components/layout/nav` and named `Footer` from `@/components/layout/footer`
  - Import `globals.css`; use `Inter` font from `next/font/google`
  - Export `metadata` object with `title: 'BearCam Companion'`
  - Wrap content in `<html lang="en" suppressHydrationWarning>` and a flex column `<div>` with `Nav`, `<main className="flex-1">`, and `Footer`
  - No Amplify client configuration here — keep root layout a Server Component
  - _Requirements: 9.1, 9.4_

- [ ] 19. Write `src/app/(public)/page.tsx`
  - Default export `GalleryPage` (required by Next.js App Router for page files)
  - No `'use client'` directive — this must be a Server Component
  - Render an `<h1>` with "BearCam Companion" and a `<p>` placeholder message indicating the gallery is coming soon
  - Export `metadata` with `title: 'Gallery — BearCam Companion'`
  - _Requirements: 9.2, 9.3_

- [ ] 20. Update `.gitignore`
  - Add `amplify_outputs.json`, `.amplify/`, and `amplify/#current-cloud-backend/` to `.gitignore`
  - Add `.env*.local` and `.env.local` if not already present
  - Confirm `amplify_outputs.json` is not tracked by git
  - _Requirements: 3.4_

- [ ] 21. Checkpoint — verify TypeScript and build pass locally
  - Run `tsc --noEmit` and confirm exit code 0 with no diagnostic errors
  - Run `next build` and confirm exit code 0
  - Confirm no `pages/` directory exists, no `tailwind.config.js` exists, and `react-icons`/`@heroicons/react`/`@fortawesome/*` are absent from `package.json`
  - Fix any type errors before proceeding — the sandbox deploy in task 22 will fail if the build is broken
  - _Requirements: 1.2, 1.3, 1.7_

- [ ] 22. Deploy backend to sandbox
  - ⚠️ Requires valid AWS credentials configured in the environment
  - Run `ampx sandbox` and confirm it completes with zero errors and zero failed CloudFormation stacks
  - Confirm `amplify_outputs.json` is generated at the project root and contains non-empty values for: `aws_appsync_graphqlEndpoint`, `aws_user_pools_id`, `aws_cognito_identity_pool_id`, `aws_user_files_s3_bucket`
  - Confirm `amplify_outputs.json` is not committed to git (check `.gitignore`)
  - _Requirements: 3.5, 3.6, 3.7, 6.10_

- [ ] 23. Write property-based and unit tests
  - [ ] 23.1 Set up fast-check testing framework
    - Install `vitest` and `fast-check` as dev dependencies: `npm install -D vitest @vitest/coverage-v8 fast-check`
    - Add a `vitest.config.ts` at the project root with environment `node` and a test file glob covering `src/**/*.test.ts`
    - Add a `"test"` script to `package.json`: `vitest --run`
    - _Requirements: 7.4, 7.5, 8.4, 8.5_
  - [ ]* 23.2 Write property test: `cn()` last-wins conflict resolution
    - Use `fc.constantFrom` to generate pairs of conflicting Tailwind utility classes (e.g., `text-red-500` / `text-blue-500`, `p-2` / `p-4`)
    - Assert that `cn(firstClass, secondClass)` contains `secondClass` and does not contain `firstClass`
    - Tag: `// Feature: project-setup, Property 1: cn() last-wins conflict resolution`
    - Run with `numRuns: 100`
    - **Property 1: `cn()` last-wins conflict resolution**
    - **Validates: Requirements 7.4**
  - [ ]* 23.3 Write property test: `cn()` non-conflicting class preservation
    - Use `fc.array(fc.constantFrom('flex', 'block', 'hidden', 'rounded', 'border'))` to generate sets of non-conflicting utility classes
    - Assert that `cn(...classes)` contains every input class
    - Tag: `// Feature: project-setup, Property 2: cn() non-conflicting class preservation`
    - Run with `numRuns: 100`
    - **Property 2: `cn()` non-conflicting class preservation**
    - **Validates: Requirements 7.4**
  - [ ]* 23.4 Write property test: `isAdmin()` group membership correctness
    - Mock `fetchAuthSession` to return an access token payload with a `cognito:groups` claim set to an arbitrary array of strings generated by `fc.array(fc.string())`
    - For each generated array: if it includes `"admin"`, assert `isAdmin()` returns `true`; otherwise assert `false`
    - Tag: `// Feature: project-setup, Property 3: isAdmin() group membership correctness`
    - Run with `numRuns: 100`
    - **Property 3: `isAdmin()` group membership correctness**
    - **Validates: Requirements 8.4, 8.5**
  - [ ]* 23.5 Write property test: `CAM_FEEDS` key completeness
    - Use `fc.constantFrom('BF', 'RF', 'BFL', 'KRV', 'RW')` as the generator
    - Assert that `CAM_FEEDS[key]` is a non-empty string for every valid `CamFeed` value
    - Tag: `// Feature: project-setup, Property 4: CAM_FEEDS key completeness`
    - Run with `numRuns: 5` (exhaustive over the 5-key enum)
    - **Property 4: `CAM_FEEDS` key completeness**
    - **Validates: Requirements 7.1, 7.3**
  - [ ]* 23.6 Write unit tests for constants and utilities
    - Assert `CAM_FEEDS` has exactly 5 keys with the correct slug values
    - Assert `META_IDENTIFICATION_OPTIONS` has exactly 10 entries in the specified order with no duplicates
    - Assert `cn()` returns a plain string for zero arguments
    - _Requirements: 7.1, 7.2_

- [ ] 24. Checkpoint — ensure all tests pass
  - Run `npm test` (mapped to `vitest --run`) and confirm all tests pass
  - Ask the user if any questions arise before proceeding to the hosting deployment.

- [ ] 25. Connect repository to Amplify Hosting and verify deployment
  - ⚠️ Requires AWS console access and a pushed git repository
  - [ ] 25.1 Push the repository to GitHub (or your git provider of choice)
    - Ensure `.gitignore` is committed and `amplify_outputs.json` is not tracked
    - Push the `main` branch
    - _Requirements: 10.1_
  - [ ] 25.2 Connect the repository to Amplify Hosting
    - In the AWS Amplify console: **Create new app → From git repository**
    - Select the repository and `main` branch; confirm Amplify detects Next.js and sets `next build` as the build command
    - Do not manually add `amplify_outputs.json` — Amplify Hosting injects it via `ampx pipeline-deploy` at build time
    - Confirm the `amplify.yml` build spec runs `npx ampx pipeline-deploy` in the backend phase before the frontend build
    - _Requirements: 10.1, 10.4_
  - [ ] 25.3 Verify the deployment
    - Confirm the build completes within 15 minutes and the deployment is marked successful in the Amplify console
    - Confirm the Gallery_Page is served at the root URL over HTTPS and returns HTTP 200
    - Confirm a unique deployment URL is provisioned for the `main` branch
    - _Requirements: 10.2, 10.3, 10.5, 10.8_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP path — the skeleton will still build and deploy without them
- Tasks 22 and 25 require AWS credentials/console access; they cannot be executed by a coding agent alone
- The `amplify_outputs.json` import in `client.ts` (task 13) will cause `tsc` and `next build` to fail until task 22 generates the file — run tasks 22 before 21 if you want a clean build check, or temporarily stub the import during development
- `GalleryPage` uses a default export (task 19) because Next.js App Router requires it for page files — this is the one exception to the named-exports convention, which applies to shared components only
- When `ampx sandbox` is run (task 22), Amplify Gen 2 creates an Identity Pool with guest access enabled automatically because `defineBackend` receives both a storage and data resource referencing the auth resource — no explicit Identity Pool configuration is needed
- Verify exact Amplify Gen 2 API method names (`allow.publicApiKey()` vs `allow.public()`) against the installed `@aws-amplify/backend` version before writing `amplify/data/resource.ts`; the API surface changed between early betas and GA

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2"] },
    { "id": 4, "tasks": ["4"] },
    { "id": 5, "tasks": ["5", "6"] },
    { "id": 6, "tasks": ["7", "8", "11", "12"] },
    { "id": 7, "tasks": ["9.1"] },
    { "id": 8, "tasks": ["9.2"] },
    { "id": 9, "tasks": ["9.3"] },
    { "id": 10, "tasks": ["10", "13", "14"] },
    { "id": 11, "tasks": ["15", "16", "17"] },
    { "id": 12, "tasks": ["18", "19", "20"] },
    { "id": 13, "tasks": ["21"] },
    { "id": 14, "tasks": ["22"] },
    { "id": 15, "tasks": ["23.1"] },
    { "id": 16, "tasks": ["23.2", "23.3", "23.4", "23.5", "23.6"] },
    { "id": 17, "tasks": ["25.1"] },
    { "id": 18, "tasks": ["25.2"] },
    { "id": 19, "tasks": ["25.3"] }
  ]
}
```
