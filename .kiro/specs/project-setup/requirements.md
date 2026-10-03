# Requirements Document

## Introduction

The `project-setup` feature establishes the complete scaffolding for BearCam Companion v2 — a crowdsourced bear identification platform built on Next.js 14+ App Router and AWS Amplify Gen 2. The goal is a working skeleton deployed to Amplify Hosting with authentication, storage, and the full data schema in place, and a basic gallery page that compiles and deploys successfully. No functional feature pages are required beyond the skeleton; subsequent specs build on this foundation.

## Glossary

- **Next.js_App**: The Next.js 14+ application using the App Router, located in the `src/` directory.
- **Amplify_Backend**: The AWS Amplify Gen 2 backend, defined entirely in TypeScript in the `amplify/` directory.
- **Amplify_Auth**: The Cognito User Pool + Identity Pool resource defined via `defineAuth()`.
- **Amplify_Storage**: The S3 bucket resource defined via `defineStorage()`.
- **Amplify_Data**: The AppSync GraphQL API and DynamoDB tables defined via `defineData()`.
- **Amplify_Hosting**: The Amplify Hosting service that builds and serves the Next.js app, connected to the git repository.
- **Admin_Group**: The Cognito user pool group named `admin` that grants elevated write access to the API.
- **AppSync_Schema**: The GraphQL schema generated from the `defineData()` TypeScript definition, comprising the `Image`, `Object`, `Identification`, and `Bear` models.
- **Public_Prefix**: The `public/` key prefix in S3 under which all webcam images are stored.
- **Gallery_Page**: The home page at `/` that serves as the entry point to the image browsing experience.
- **Skeleton_Layout**: The shared application shell consisting of a top navigation bar and footer, rendered on all pages.
- **CAM_FEEDS**: The constant mapping of camera feed codes (`BF`, `RF`, `BFL`, `KRV`, `RW`) to their explore.org slugs, defined in `src/lib/constants.ts`.
- **Meta_Identification_Options**: The fixed list of non-bear identification labels (e.g., "Not a bear", "Unknown") defined in `src/lib/constants.ts`.

---

## Requirements

### Requirement 1: Next.js Project Scaffolding

**User Story:** As a developer, I want a Next.js 14+ project with TypeScript strict mode and the App Router configured, so that I have a modern, type-safe foundation to build on.

#### Acceptance Criteria

1. THE Next.js_App SHALL use Next.js version 14 or higher with the App Router as the sole routing mechanism — no `pages/` directory or Pages Router configuration shall be present.
2. THE Next.js_App SHALL have TypeScript strict mode enabled in `tsconfig.json` with both `"strict": true` and `"noImplicitAny": true`.
3. WHEN `tsc --noEmit` is run, THE Next.js_App SHALL exit with code 0 and produce no TypeScript diagnostic errors or warnings.
4. THE Next.js_App SHALL use Tailwind CSS v4 or higher for styling, configured without a `tailwind.config.js` file, with all customization residing in CSS files only.
5. THE Next.js_App SHALL include the shadcn/ui component library with all shadcn/ui components installed exclusively into `src/components/ui/` — no shadcn/ui components shall be placed outside that directory.
6. THE Next.js_App SHALL use Lucide React as the sole icon library; packages such as `react-icons`, `@heroicons/react`, or `@fortawesome/*` SHALL NOT appear in `dependencies` or `devDependencies`.
7. WHEN `next build` is run, THE Next.js_App SHALL complete the build without errors.

---

### Requirement 2: Application Directory Structure

**User Story:** As a developer, I want the prescribed directory structure created with placeholder files, so that the codebase organization is established before feature implementation begins.

#### Acceptance Criteria

1. THE Next.js_App SHALL contain a `src/app/(public)/` route group directory for pages accessible without authentication, with a `.gitkeep` placeholder file so the empty directory is tracked in git.
2. THE Next.js_App SHALL contain a `src/app/(auth)/` route group directory for pages requiring authentication, with a `.gitkeep` placeholder file.
3. THE Next.js_App SHALL contain a `src/app/admin/` directory for admin-only pages, with a `.gitkeep` placeholder file.
4. THE Next.js_App SHALL contain a `src/components/ui/` directory for shadcn/ui components.
5. THE Next.js_App SHALL contain a `src/components/bears/` directory for bear-specific components, with a `.gitkeep` placeholder file.
6. THE Next.js_App SHALL contain a `src/components/images/` directory for image-specific components, with a `.gitkeep` placeholder file.
7. THE Next.js_App SHALL contain a `src/components/layout/` directory for navigation, footer, and page shell components.
8. THE Next.js_App SHALL contain a `src/lib/amplify/` directory for Amplify client configuration and typed query helpers, with a stub `index.ts` file that re-exports the client and auth helpers.
9. THE Next.js_App SHALL contain `src/lib/utils.ts` exporting a `cn()` utility function that merges Tailwind class names using `clsx` and `tailwind-merge`.
10. THE Next.js_App SHALL contain `src/lib/constants.ts` exporting `CAM_FEEDS`, `META_IDENTIFICATION_OPTIONS`, and a `CamFeed` type — no `CAM_FEED_SLUGS` export.
11. THE Next.js_App SHALL contain a `src/types/` directory for shared TypeScript types not generated by Amplify, with a `.gitkeep` placeholder file.

---

### Requirement 3: Amplify Gen 2 Backend Initialization

**User Story:** As a developer, I want the Amplify Gen 2 backend initialized with a TypeScript-first structure, so that all cloud resources are defined as code and deployable via the Amplify CLI.

#### Acceptance Criteria

1. THE Amplify_Backend SHALL be initialized using the Amplify Gen 2 `create-amplify` toolchain, producing an `amplify/` directory at the project root containing at minimum `backend.ts`, `auth/resource.ts`, `data/resource.ts`, and `storage/resource.ts`.
2. THE Amplify_Backend SHALL define all resources in TypeScript files within the `amplify/` directory — no manual CloudFormation templates or AWS console configuration SHALL be required.
3. THE Amplify_Backend SHALL have a root `amplify/backend.ts` file that assembles Amplify_Auth, Amplify_Storage, and Amplify_Data into a single backend definition by importing and passing each resource to the `defineBackend()` call.
4. THE Amplify_Backend SHALL produce an `amplify_outputs.json` file at the project root during sandbox deployment; this file SHALL be listed in `.gitignore` and SHALL NOT be present in any committed repository state.
5. WHEN `ampx sandbox` is run, THE Amplify_Backend SHALL complete deployment to the configured AWS account with zero errors and zero failed CloudFormation stacks.
6. IF `ampx sandbox` is run without valid AWS credentials configured in the environment, THEN THE Amplify_Backend SHALL exit with a non-zero status code and display an error message indicating that AWS credentials are missing or invalid.
7. WHEN `ampx sandbox` completes successfully, THE Amplify_Backend SHALL generate an `amplify_outputs.json` file containing non-empty values for the AppSync GraphQL endpoint, Cognito User Pool ID, Cognito Identity Pool ID, and S3 bucket name.

---

### Requirement 4: Authentication Configuration

**User Story:** As a developer, I want Cognito authentication configured via `defineAuth()`, so that users can register and log in with email and password and admin privileges can be granted via a Cognito group.

#### Acceptance Criteria

1. THE Amplify_Auth SHALL be defined in `amplify/auth/resource.ts` using `defineAuth()`.
2. THE Amplify_Auth SHALL configure email and password as the sole login mechanism — no social or federated identity providers SHALL be configured.
3. THE Amplify_Auth SHALL enforce a password policy requiring a minimum length of 8 characters and a maximum of 256 characters, with at least one uppercase letter, one lowercase letter, one number, and one symbol.
4. THE Amplify_Auth SHALL declare a single user pool group named `admin`.
5. THE Amplify_Auth SHALL support a `preferredUsername` user attribute that is optional and mutable, with a maximum length of 64 characters.
6. THE Amplify_Auth SHALL enable unauthenticated (guest) access on the Cognito Identity Pool so that anonymous users can read public AppSync data.
7. WHEN a user successfully authenticates, THE Amplify_Auth SHALL issue a JWT that includes a `cognito:groups` claim listing all Cognito user pool groups the authenticated user belongs to.
8. IF a user attempts to register with a password that does not satisfy the password policy, THEN THE Amplify_Auth SHALL reject the registration attempt with an error indicating which policy requirement was not met, without creating a user account.
9. IF a user attempts to authenticate with an unrecognized email address or an incorrect password, THEN THE Amplify_Auth SHALL reject the authentication attempt with an error indicating that the credentials are invalid, without revealing which field was incorrect.

---

### Requirement 5: Storage Configuration

**User Story:** As a developer, I want an S3 bucket configured via `defineStorage()`, so that webcam images can be stored and accessed with the correct permission tiers.

#### Acceptance Criteria

1. THE Amplify_Storage SHALL be defined in `amplify/storage/resource.ts` using `defineStorage()` with the bucket name `bearcam-images`.
2. THE Amplify_Storage SHALL grant guest (unauthenticated) users read access to objects under the `public/*` key prefix.
3. THE Amplify_Storage SHALL grant authenticated users read access to objects under the `public/*` key prefix.
4. THE Amplify_Storage SHALL grant members of the Admin_Group read, write, and delete access to objects under the `public/*` key prefix.
5. THE Amplify_Storage SHALL NOT grant write or delete access to guest or non-admin authenticated users on the `public/*` prefix.
6. IF a guest or non-admin authenticated user attempts a write or delete operation on an object under the `public/*` key prefix, THEN THE Amplify_Storage SHALL deny the request with an error indicating insufficient permissions without modifying or deleting any stored object.

---

### Requirement 6: Data Schema Configuration

**User Story:** As a developer, I want the full AppSync GraphQL API and DynamoDB tables defined via `defineData()`, so that the data layer is in place for all subsequent feature development.

#### Acceptance Criteria

1. THE Amplify_Data SHALL be defined in `amplify/data/resource.ts` using `defineData()`.
2. THE AppSync_Schema SHALL define an `Image` model with fields: `url` (URL), `date` (datetime), `s3Key` (string), `bearCount` (integer), `bearList` (string), `camFeed` (enum of `BF`, `RF`, `BFL`, `KRV`, `RW`), and a `hasMany` relationship to `Object` via `imageId`.
3. THE AppSync_Schema SHALL define an `Object` model with fields: `label` (string), `confidence` (float, 0–100), `width` (float, 0–1), `height` (float, 0–1), `left` (float, 0–1), `top` (float, 0–1), `imageId` (required id), `consensusName` (string), `consensusConfidence` (float, 0–1), `totalVotes` (integer), a `belongsTo` relationship to `Image` via `imageId`, and a `hasMany` relationship to `Identification` via `objectId`.
4. THE AppSync_Schema SHALL define an `Identification` model with fields: `bearId` (nullable id), `name` (string), `userId` (string), `userDisplayName` (string), `objectId` (required id), a `belongsTo` relationship to `Object` via `objectId`, and a `belongsTo` relationship to `Bear` via `bearId`.
5. THE AppSync_Schema SHALL define a `Bear` model with fields: `number` (string), `name` (string), `displayName` (string), `notes` (string), `active` (boolean), and a `hasMany` relationship to `Identification` via `bearId`.
6. THE AppSync_Schema SHALL authorize `Image` so that the public API key has read access and the Admin_Group has create, update, and delete access.
7. THE AppSync_Schema SHALL authorize `Object` so that the public API key has read access and the Admin_Group has create, update, and delete access.
8. THE AppSync_Schema SHALL authorize `Identification` so that the public API key has read access, authenticated users have create access, record owners have update and delete access to their own records, and the Admin_Group has create, update, and delete access.
9. THE AppSync_Schema SHALL authorize `Bear` so that the public API key has read access and the Admin_Group has create, update, and delete access.
10. WHEN `ampx sandbox` is run, THE Amplify_Data SHALL provision the AppSync API and all four DynamoDB tables without errors.
11. THE Amplify_Data SHALL export the schema type (e.g., `export type Schema = typeof schema`) from `amplify/data/resource.ts` so that typed client helpers can be derived without manual type duplication.
12. THE Amplify_Data definition in `amplify/data/resource.ts` SHALL import the Amplify_Auth resource and pass it to `defineData()` so that owner-based and group-based authorization rules are correctly bound to the Cognito User Pool.

---

### Requirement 7: Shared Constants and Utilities

**User Story:** As a developer, I want canonical constants and utility functions defined in `src/lib/`, so that feed codes, meta-identification options, and class name helpers are available consistently across the frontend and inform Lambda configuration.

#### Acceptance Criteria

1. THE Next.js_App SHALL export `CAM_FEEDS` from `src/lib/constants.ts` as a `const` object mapping exactly the five feed codes `BF`, `RF`, `BFL`, `KRV`, and `RW` to their corresponding explore.org slug strings, with no additional keys permitted, typed as `Record<CamFeed, string>`.
2. THE Next.js_App SHALL export `META_IDENTIFICATION_OPTIONS` from `src/lib/constants.ts` as a readonly tuple containing exactly 10 string literals in this order: `"Not a bear"`, `"Unknown"`, `"Unknown Adult"`, `"Unknown Subadult"`, `"Known Adult"`, `"Known Subadult"`, `"Cub (COY)"`, `"Cub (1.5yo)"`, `"Cub (2.5yo)"`, and `"Cub (3.5yo)"`, with no duplicates and no additional entries.
3. THE Next.js_App SHALL export a `CamFeed` type from `src/lib/constants.ts` derived as `keyof typeof CAM_FEEDS`, such that the type resolves to the union `"BF" | "RF" | "BFL" | "KRV" | "RW"` and any string value not in that union is rejected at compile time.
4. THE Next.js_App SHALL export a `cn()` function from `src/lib/utils.ts` that accepts zero or more arguments of type `clsx` input (strings, arrays, or conditional objects) and returns a single merged string in which conflicting Tailwind utility classes are resolved by `tailwind-merge` such that the last conflicting class wins.
5. THE Next.js_App SHALL compile `src/lib/constants.ts` and `src/lib/utils.ts` without TypeScript errors under strict mode.
6. IF `src/lib/constants.ts` is imported in a Lambda function file outside `src/`, THEN `CAM_FEEDS` and `CamFeed` SHALL be accessible without requiring any Next.js-specific runtime or module resolution.

---

### Requirement 8: Amplify Client Configuration

**User Story:** As a developer, I want the Amplify client configured and exported from `src/lib/amplify/`, so that all data access in the app routes through a single, typed entry point.

#### Acceptance Criteria

1. THE Next.js_App SHALL export a configured Amplify client instance from `src/lib/amplify/client.ts`, initialized with the outputs from `amplify_outputs.json`.
2. WHEN running in a Server Component context, THE Next.js_App SHALL export a server-side Amplify client configured using the `createServerRunner` pattern from `src/lib/amplify/client.ts`, such that the client reads session credentials from cookies without requiring a browser environment.
3. WHEN running in a Client Component context, THE Next.js_App SHALL export a browser-side Amplify client configured using `generateClient` from `src/lib/amplify/client.ts`, such that the client is usable only within components marked `'use client'`.
4. THE Next.js_App SHALL export an `isAdmin()` helper function from `src/lib/amplify/auth.ts` that retrieves the current user's access token using `fetchAuthSession`, reads the `cognito:groups` claim, and returns `true` if and only if the `admin` group is present in that claim.
5. IF the current user is unauthenticated or the `cognito:groups` claim is absent, THEN THE `isAdmin()` function SHALL return `false` without throwing an error.
6. IF the `amplify_outputs.json` file is absent at build time, THEN THE Next.js_App SHALL fail the build with an error message indicating that `amplify_outputs.json` is missing, rather than producing a runtime error.

---

### Requirement 9: Skeleton Layout and Gallery Page

**User Story:** As a visitor, I want to see a working home page with a navigation bar and footer when I open the app, so that I know the application has loaded and I can navigate to other sections.

#### Acceptance Criteria

1. THE Next.js_App SHALL render the Skeleton_Layout on all pages via `src/app/layout.tsx`, where `layout.tsx` imports and renders the named-export `Nav` component from `src/components/layout/nav.tsx` and the named-export `Footer` component from `src/components/layout/footer.tsx` — no default exports for these components.
2. THE Next.js_App SHALL render a Gallery_Page at the `/` route that displays a heading with the application name "BearCam Companion" and a placeholder message indicating the gallery is not yet available.
3. THE Next.js_App SHALL render the Gallery_Page as a Server Component, verifiable by the absence of `'use client'` in `src/app/(public)/page.tsx`.
4. WHEN an unauthenticated user requests the Gallery_Page, THE Next.js_App SHALL return an HTTP 200 response and render the page without JavaScript console errors.
5. THE Next.js_App SHALL use the Next.js `<Link>` component for all internal navigation links in the Skeleton_Layout — no raw `<a>` tags with same-origin `href` values shall appear in `nav.tsx` or `footer.tsx`.
6. THE Skeleton_Layout SHALL include a login link implemented with `<Link href="/login">` that navigates to the authentication route.
7. WHEN the Next.js_App is built, all `<Link>` `href` values in `nav.tsx` and `footer.tsx` SHALL resolve to routes defined in the `src/app/` directory — no links to undefined routes.

---

### Requirement 10: Amplify Hosting Deployment

**User Story:** As a developer, I want the app connected to Amplify Hosting and successfully deployed from the git repository, so that every push to the main branch produces a live, accessible build.

#### Acceptance Criteria

1. THE Amplify_Hosting SHALL be connected to the git repository and configured to build and deploy the Next.js_App on every push to the main branch.
2. WHEN a push is made to the main branch, THE Amplify_Hosting SHALL execute the Next.js build (`next build`) and deploy the output without errors within 15 minutes of the push event.
3. THE Amplify_Hosting SHALL serve the Gallery_Page at the root URL of the deployed environment and return an HTTP 200 response.
4. THE Amplify_Hosting SHALL inject the correct `amplify_outputs.json` for the deployment environment at build time via the Amplify Gen 2 hosting integration — the file SHALL NOT be committed to the repository.
5. THE Amplify_Hosting SHALL provision a unique deployment URL for the main branch environment accessible over HTTPS.
6. IF the `next build` step fails, THEN THE Amplify_Hosting SHALL mark the deployment as failed, preserve the previously deployed version, and surface a build error indication in the Amplify console.
7. IF the `amplify_outputs.json` file is absent or malformed at build time, THEN THE Amplify_Hosting SHALL mark the deployment as failed with an error indication that identifies the missing or invalid configuration file.
8. WHEN a deployment completes successfully, THE Amplify_Hosting SHALL make the updated Gallery_Page available at the deployment URL within 5 minutes of the build completing.
