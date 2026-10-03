# Design Document: project-setup

## Overview

This spec produces the full deployable skeleton for BearCam Companion v2: a Next.js 14+ App Router application with TypeScript strict mode and Tailwind CSS v4, backed by an AWS Amplify Gen 2 backend that defines Cognito authentication, an S3 bucket for webcam images, and an AppSync GraphQL API with all four DynamoDB tables (`Image`, `Object`, `Identification`, `Bear`). The result is a working application deployed to Amplify Hosting — a basic gallery page renders at `/`, the shared layout shell is in place, and all backend infrastructure is provisioned and authorization-enforced at the API level. No functional feature pages beyond the skeleton are required; subsequent specs build on this foundation.

---

## Architecture

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (client)                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────────────┐
│              Amplify Hosting (CDN + SSR)                         │
│              Next.js 14 App Router                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Server Components (SSR)  │  Client Components           │   │
│  │  - Gallery page           │  - Auth UI (Amplify UI)      │   │
│  │  - Image detail page      │  - Identification panel      │   │
│  └───────────┬───────────────┴──────────┬───────────────────┘   │
└──────────────┼──────────────────────────┼──────────────────────┘
               │ GraphQL (AppSync)         │ GraphQL (AppSync)
               │ (server-side)            │ (browser)
┌──────────────▼──────────────────────────▼──────────────────────┐
│                    AWS AppSync (GraphQL API)                     │
│              Authorization via @auth rules                       │
└───────┬──────────────────────────────────────────────────────┬──┘
        │ DynamoDB                                             │
┌───────▼───────────────────────────────────────────────────┐  │
│  DynamoDB Tables                                           │  │
│  - Image    - Object    - Identification    - Bear         │  │
└───────────────────────────────────────────────────────────┘  │
                                                                │
┌───────────────────────────────────────────────────────────────▼──┐
│  Amazon Cognito (User Pool + Identity Pool)                       │
│  Groups: admin                                                    │
│  Guest (unauthenticated) access enabled                           │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  Amazon S3 (bearcam-images)                                      │
│  public/* — read: guest + authenticated; write/delete: admin     │
└──────────────────────────────────────────────────────────────────┘
```

### Component Layers

| Layer | Technology | Location |
|-------|-----------|----------|
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS v4, shadcn/ui | `src/` |
| Backend | AWS Amplify Gen 2 (Auth, Data, Storage) | `amplify/` |
| Hosting | AWS Amplify Hosting (SSR + CDN) | Amplify console |

---

## Project Initialization

### 1. Bootstrap Next.js

```bash
npx create-next-app@latest bearcam-companion-v2 \
  --typescript \
  --app \
  --src-dir \
  --no-tailwind \
  --eslint \
  --import-alias "@/*"
```

> Tailwind v4 is installed manually (see §6a) rather than via the `create-next-app` flag, which installs v3.

### 2. Install Tailwind CSS v4

```bash
npm install tailwindcss @tailwindcss/postcss postcss
```

Create `postcss.config.mjs`:

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

### 3. Initialize Amplify Gen 2

Run inside the project directory:

```bash
npm create amplify@latest
```

This generates the `amplify/` directory and adds Amplify packages to `package.json`.

### 4. Install Additional Frontend Dependencies

```bash
# Amplify client libraries
npm install aws-amplify @aws-amplify/ui-react

# shadcn/ui dependencies (added by shadcn init, listed here for clarity)
npm install clsx tailwind-merge lucide-react

# Utility types
npm install -D @types/node
```

### Key `package.json` dependencies

```json
{
  "dependencies": {
    "aws-amplify": "^6.x",
    "@aws-amplify/ui-react": "^6.x",
    "clsx": "^2.x",
    "tailwind-merge": "^2.x",
    "lucide-react": "^0.x",
    "next": "^14.x",
    "react": "^18.x",
    "react-dom": "^18.x"
  },
  "devDependencies": {
    "@aws-amplify/backend": "^1.x",
    "@aws-amplify/backend-cli": "^1.x",
    "typescript": "^5.x",
    "tailwindcss": "^4.x",
    "@tailwindcss/postcss": "^4.x"
  }
}
```

---

## Directory Structure

The full prescribed layout matching `conventions.md`:

```
bearcam-companion-v2/
├── amplify/
│   ├── backend.ts                         # Root backend — assembles all resources
│   ├── auth/
│   │   └── resource.ts                    # defineAuth()
│   ├── data/
│   │   └── resource.ts                    # defineData() — schema + auth rules
│   ├── storage/
│   │   └── resource.ts                    # defineStorage()
│   └── functions/                         # Lambda handlers (later specs)
│       ├── ingest-image/
│       ├── detect-objects/
│       └── compute-bear-list/
├── src/
│   ├── app/
│   │   ├── layout.tsx                     # Root layout — Nav + Footer + Amplify provider
│   │   ├── globals.css                    # Tailwind v4 @import
│   │   ├── (public)/
│   │   │   ├── .gitkeep
│   │   │   └── page.tsx                   # Gallery home — Server Component
│   │   ├── (auth)/
│   │   │   └── .gitkeep
│   │   └── admin/
│   │       └── .gitkeep
│   ├── components/
│   │   ├── ui/                            # shadcn/ui components (owned by project)
│   │   ├── bears/
│   │   │   └── .gitkeep
│   │   ├── images/
│   │   │   └── .gitkeep
│   │   └── layout/
│   │       ├── nav.tsx                    # Top navigation bar
│   │       └── footer.tsx                 # Footer
│   ├── lib/
│   │   ├── amplify/
│   │   │   ├── client.ts                  # Amplify client (server + browser)
│   │   │   ├── auth.ts                    # isAdmin() helper
│   │   │   └── index.ts                   # Re-exports
│   │   ├── utils.ts                       # cn() utility
│   │   └── constants.ts                   # CAM_FEEDS, META_IDENTIFICATION_OPTIONS, CamFeed
│   └── types/
│       └── .gitkeep
├── public/
├── amplify_outputs.json                   # Generated — gitignored
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## Amplify Backend Design

### 5a. `amplify/auth/resource.ts`

```typescript
import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  userAttributes: {
    preferredUsername: {
      required: false,
      mutable: true,
    },
  },
  groups: ['admin'],
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSymbols: true,
  },
  access: (allow) => [
    allow.resource(auth).to(['addUserToGroup']),
  ],
});
```

**Design decisions:**
- `loginWith.email: true` — email + password only, no social providers.
- `groups: ['admin']` — single admin group; members are added manually in the Cognito console.
- Guest (unauthenticated) access is enabled by default when `defineAuth()` is passed to `defineBackend()` alongside a storage/data resource that references it — Amplify Gen 2 creates an Identity Pool with guest access enabled automatically.
- `preferredUsername` is optional and mutable, max 64 characters (Cognito default for standard attributes).

---

### 5b. `amplify/storage/resource.ts`

```typescript
import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'bearcam-images',
  access: (allow) => ({
    'public/*': [
      allow.guest.to(['read']),
      allow.authenticated.to(['read']),
      allow.groups(['admin']).to(['read', 'write', 'delete']),
    ],
  }),
});
```

**Design decisions:**
- Bucket logical name is `bearcam-images`; Amplify appends environment and hash to the physical bucket name.
- Only the `public/*` prefix is defined. Lambda functions access S3 directly via IAM execution role — not through Amplify Storage client — so no additional prefix rules are needed for Lambda.
- Non-admin authenticated users have `read` only; write/delete is denied by the absence of a rule (deny-by-default).

---

### 5c. `amplify/data/resource.ts`

```typescript
import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { auth } from '../auth/resource';

const schema = a.schema({

  Image: a.model({
    url: a.url(),
    date: a.datetime(),
    s3Key: a.string(),
    bearCount: a.integer(),
    bearList: a.string(),
    camFeed: a.enum(['BF', 'RF', 'BFL', 'KRV', 'RW']),
    objects: a.hasMany('Object', 'imageId'),
  }).authorization((allow) => [
    allow.publicApiKey().to(['read']),
    allow.group('admin').to(['create', 'update', 'delete']),
  ]),

  Object: a.model({
    label: a.string(),
    confidence: a.float(),
    width: a.float(),
    height: a.float(),
    left: a.float(),
    top: a.float(),
    imageId: a.id().required(),
    image: a.belongsTo('Image', 'imageId'),
    identifications: a.hasMany('Identification', 'objectId'),
    consensusName: a.string(),
    consensusConfidence: a.float(),
    totalVotes: a.integer(),
  }).authorization((allow) => [
    allow.publicApiKey().to(['read']),
    allow.group('admin').to(['create', 'update', 'delete']),
  ]),

  Identification: a.model({
    bearId: a.id(),
    name: a.string(),
    userId: a.string(),
    userDisplayName: a.string(),
    objectId: a.id().required(),
    object: a.belongsTo('Object', 'objectId'),
    bear: a.belongsTo('Bear', 'bearId'),
  }).authorization((allow) => [
    allow.publicApiKey().to(['read']),
    allow.authenticated().to(['create']),
    allow.owner().to(['update', 'delete']),
    allow.group('admin').to(['create', 'update', 'delete']),
  ]),

  Bear: a.model({
    number: a.string(),
    name: a.string(),
    displayName: a.string(),
    notes: a.string(),
    active: a.boolean(),
    identifications: a.hasMany('Identification', 'bearId'),
  }).authorization((allow) => [
    allow.publicApiKey().to(['read']),
    allow.group('admin').to(['create', 'update', 'delete']),
  ]),

});

export type Schema = typeof schema;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
  },
});
```

**Design decisions:**
- `defaultAuthorizationMode: 'apiKey'` — anonymous reads use the API key; the client switches to `userPool` mode for authenticated mutations automatically via per-request auth override.
- `auth` resource is imported so Amplify can bind the Cognito User Pool to the owner and group authorization rules.
- `Schema` type is exported so typed client helpers can be derived via `generateClient<Schema>()` without manual type duplication.
- `bearId` on `Identification` is nullable (`a.id()` without `.required()`) — a user may submit a free-text identification or "Unknown" without referencing a `Bear` record.
- Bounding box fields (`width`, `height`, `left`, `top`) are `a.float()` — stored as 0–1 fractions matching Rekognition output.

> **Note:** Verify exact method names (`allow.publicApiKey()` vs `allow.public()`, `allow.group()` vs `allow.groups()`) against the installed `@aws-amplify/backend` version at implementation time. The Amplify Gen 2 API surface changed between early betas and GA.

---

### 5d. `amplify/backend.ts`

```typescript
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';

defineBackend({
  auth,
  data,
  storage,
});
```

---

## Frontend Design

### 6a. Tailwind CSS v4 Configuration

Tailwind v4 uses a CSS-first configuration model — no `tailwind.config.js` is needed for base setup.

In `src/app/globals.css`:

```css
@import "tailwindcss";
```

Dark mode and theme tokens are configured in CSS using `@theme` blocks when needed. The `postcss.config.mjs` (shown in §3) handles the build pipeline.

> **No `tailwind.config.js`** should be present. shadcn/ui v4-compatible initialization generates any required CSS-level customizations.

---

### 6b. shadcn/ui Initialization

```bash
npx shadcn@latest init
```

Choices during init:
- Style: **Default** (New York variant available too — either works)
- Base color: **Neutral**
- CSS variables: **Yes**
- Components location: `src/components/ui` (confirm default)

This generates `src/components/ui/` with base component stubs and updates `globals.css` with shadcn design tokens using `@layer` and CSS variables. All components are owned by the project — they can be edited freely.

---

### 6c. `src/lib/constants.ts`

```typescript
export const CAM_FEEDS = {
  BF:  'brown-bear-salmon-cam-brooks-falls',
  RF:  'brown-bear-salmon-cam-the-riffles',
  BFL: 'brooks-falls-brown-bears-low',
  KRV: 'brown-bear-salmon-cam-lower-river',
  RW:  'river-watch-brown-bear-salmon-cams',
} as const satisfies Record<string, string>;

export type CamFeed = keyof typeof CAM_FEEDS;

export const META_IDENTIFICATION_OPTIONS = [
  'Not a bear',
  'Unknown',
  'Unknown Adult',
  'Unknown Subadult',
  'Known Adult',
  'Known Subadult',
  'Cub (COY)',
  'Cub (1.5yo)',
  'Cub (2.5yo)',
  'Cub (3.5yo)',
] as const;

export type MetaIdentificationOption = typeof META_IDENTIFICATION_OPTIONS[number];
```

**Design decisions:**
- `as const satisfies Record<string, string>` — locks keys and values as literals while still type-checking that both key and value are strings. `CamFeed` is then derived as `"BF" | "RF" | "BFL" | "KRV" | "RW"`.
- `META_IDENTIFICATION_OPTIONS` is a readonly tuple (`as const`) — length and order are fixed at compile time. The type `MetaIdentificationOption` is derived for use in the identification dropdown.
- This file has no Next.js or browser dependencies and is safe to import from Lambda functions.

---

### 6d. `src/lib/utils.ts`

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

**Design decisions:**
- `clsx` handles conditional logic (arrays, objects, falsy filtering).
- `tailwind-merge` resolves conflicts so the last conflicting Tailwind utility class wins (e.g., `cn('text-red-500', 'text-blue-500')` → `'text-blue-500'`).
- Explicit return type `string` satisfies the conventions requirement.

---

### 6e. `src/lib/amplify/client.ts`

```typescript
import { generateClient } from 'aws-amplify/data';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';
import outputs from '../../../amplify_outputs.json';
import type { Schema } from '../../../amplify/data/resource';

// Server-side runner — for use in Server Components and Route Handlers
export const { runWithAmplifyServerContext } = createServerRunner({
  config: outputs,
});

// Browser-side client — use only in 'use client' components
export const client = generateClient<Schema>();
```

**Design decisions:**
- `createServerRunner` is the Amplify Gen 2 pattern for SSR; it reads session credentials from cookies in a Next.js request context. Used in Server Components via `runWithAmplifyServerContext`.
- `generateClient<Schema>()` is the browser client — typed against the generated schema. Must only be called in Client Components.
- Both are in the same file to make the split explicit. The server runner is safe to import in server modules; the browser client is safe only after `'use client'` boundary.
- `amplify_outputs.json` is imported directly — if it's missing, TypeScript will fail the build with a module resolution error (satisfies Requirement 8.6).

---

### 6f. `src/lib/amplify/auth.ts`

```typescript
import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Returns true if the current user's access token contains the "admin" Cognito group.
 * Returns false for unauthenticated users or when the cognito:groups claim is absent.
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const session = await fetchAuthSession();
    const groups =
      (session.tokens?.accessToken?.payload?.['cognito:groups'] as
        | string[]
        | undefined) ?? [];
    return groups.includes('admin');
  } catch {
    return false;
  }
}
```

**Design decisions:**
- `fetchAuthSession` returns `null` tokens for unauthenticated users rather than throwing; the nullish coalescing to `[]` handles that case gracefully.
- The `try/catch` catches genuine errors (network issues, misconfigured Amplify) and returns `false` rather than propagating — auth check failures are non-fatal for public pages.
- `cognito:groups` is read from the access token payload (not the ID token) per Amplify Gen 2 conventions.
- Explicit `Promise<boolean>` return type.

---

### 6g. `src/lib/amplify/index.ts`

```typescript
export { runWithAmplifyServerContext, client } from './client';
export { isAdmin } from './auth';
```

---

### 6h. `src/app/layout.tsx`

```tsx
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Nav } from '@/components/layout/nav';
import { Footer } from '@/components/layout/footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'BearCam Companion',
  description: 'Crowdsourced bear identification for explore.org webcam feeds',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <div className="flex min-h-screen flex-col">
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
```

**Design decisions:**
- `Nav` and `Footer` are named exports (no default exports per conventions).
- Amplify client-side configuration (`Amplify.configure`) is deferred to a `'use client'` `AmplifyProvider` component wrapping only interactive subtrees — the root layout stays a Server Component.
- `suppressHydrationWarning` on `<html>` prevents hydration mismatches from dark mode class toggling.

---

### 6i. `src/components/layout/nav.tsx`

```tsx
import Link from 'next/link';

export function Nav(): React.JSX.Element {
  return (
    <header className="border-b bg-background">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold">
          BearCam Companion
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Login
          </Link>
        </nav>
      </div>
    </header>
  );
}
```

---

### 6j. `src/components/layout/footer.tsx`

```tsx
export function Footer(): React.JSX.Element {
  return (
    <footer className="border-t bg-background py-6">
      <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
        BearCam Companion — webcam images courtesy of{' '}
        <a
          href="https://explore.org"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          explore.org
        </a>
      </div>
    </footer>
  );
}
```

---

### 6k. `src/app/(public)/page.tsx`

```tsx
// Server Component — no 'use client' directive
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gallery — BearCam Companion',
};

export default function GalleryPage(): React.JSX.Element {
  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight">BearCam Companion</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        The gallery is coming soon. Check back after image ingestion is set up.
      </p>
    </div>
  );
}
```

**Design decisions:**
- No `'use client'` — this is a Server Component, satisfying Requirement 9.3.
- Uses a default export because this is a Next.js page (route entry point), not a shared component. Per conventions, named exports apply to shared components; page files use default exports as required by Next.js App Router.

---

## Components and Interfaces

This section catalogs all exported TypeScript interfaces, types, and component contracts defined in this spec.

### Backend Types

```typescript
// amplify/data/resource.ts
export type Schema = typeof schema;
// Provides typed access to all four models for generateClient<Schema>()
```

### Frontend Types

```typescript
// src/lib/constants.ts
export type CamFeed = keyof typeof CAM_FEEDS;
// Resolves to: "BF" | "RF" | "BFL" | "KRV" | "RW"

export type MetaIdentificationOption = typeof META_IDENTIFICATION_OPTIONS[number];
// Resolves to the union of all 10 meta-option string literals
```

### Component Interfaces

| Component | File | Props | Exports |
|-----------|------|-------|---------|
| `Nav` | `src/components/layout/nav.tsx` | none | named export `Nav` |
| `Footer` | `src/components/layout/footer.tsx` | none | named export `Footer` |
| `GalleryPage` | `src/app/(public)/page.tsx` | none (Server Component) | default export (Next.js page) |
| `RootLayout` | `src/app/layout.tsx` | `{ children: ReactNode }` | default export (Next.js layout) |

### Library Function Interfaces

```typescript
// src/lib/utils.ts
export function cn(...inputs: ClassValue[]): string;

// src/lib/amplify/auth.ts
export async function isAdmin(): Promise<boolean>;

// src/lib/amplify/client.ts
export const runWithAmplifyServerContext: ReturnType<typeof createServerRunner>['runWithAmplifyServerContext'];
export const client: ReturnType<typeof generateClient<Schema>>;

// src/lib/amplify/index.ts
export { runWithAmplifyServerContext, client } from './client';
export { isAdmin } from './auth';
```

---

## Data Models

The data models are defined in `amplify/data/resource.ts` via `defineData()`. Amplify Gen 2 generates a DynamoDB table for each model and a corresponding AppSync GraphQL type.

### Model Summary

| Model | Table | Primary Key | Relationships |
|-------|-------|-------------|---------------|
| `Image` | `Image-{env}-{hash}` | `id` (auto) | hasMany Object |
| `Object` | `Object-{env}-{hash}` | `id` (auto) | belongsTo Image, hasMany Identification |
| `Identification` | `Identification-{env}-{hash}` | `id` (auto) | belongsTo Object, belongsTo Bear |
| `Bear` | `Bear-{env}-{hash}` | `id` (auto) | hasMany Identification |

### Field Specifications

**Image**
| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `id` | String | No | Auto-generated by Amplify |
| `url` | URL (String) | Yes | Original explore.org snapshot URL |
| `date` | AWSDateTime | Yes | Timestamp from explore.org |
| `s3Key` | String | Yes | S3 object key, e.g. `public/filename.jpg` |
| `bearCount` | Int | Yes | Denormalized; maintained by Lambda |
| `bearList` | String | Yes | Comma-separated consensus names; maintained by Lambda |
| `camFeed` | Enum | Yes | One of: BF, RF, BFL, KRV, RW |

**Object**
| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `id` | String | No | Auto-generated |
| `label` | String | Yes | Detection label (e.g. "Bear") |
| `confidence` | Float | Yes | 0–100 |
| `width` | Float | Yes | 0–1 fraction of image width |
| `height` | Float | Yes | 0–1 fraction of image height |
| `left` | Float | Yes | 0–1 fraction from left edge |
| `top` | Float | Yes | 0–1 fraction from top edge |
| `imageId` | ID | No | FK to Image |
| `consensusName` | String | Yes | Plurality winner; maintained by Lambda |
| `consensusConfidence` | Float | Yes | 0–1 vote fraction; maintained by Lambda |
| `totalVotes` | Int | Yes | Total Identifications; maintained by Lambda |

**Identification**
| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `id` | String | No | Auto-generated |
| `bearId` | ID | Yes | FK to Bear (nullable for free-text) |
| `name` | String | Yes | Resolved display name at submission time |
| `userId` | String | Yes | Cognito sub |
| `userDisplayName` | String | Yes | Cognito username |
| `objectId` | ID | No | FK to Object |

**Bear**
| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `id` | String | No | Auto-generated |
| `number` | String | Yes | e.g. "480", "747" |
| `name` | String | Yes | e.g. "Otis" (optional) |
| `displayName` | String | Yes | Computed: "480 Otis" or "747" |
| `notes` | String | Yes | Admin notes |
| `active` | Boolean | Yes | Show in identification dropdown |

### Authorization Matrix

| Model | Public (API Key) | Authenticated User | Record Owner | Admin Group |
|-------|-----------------|-------------------|--------------|-------------|
| Image | read | — | — | create, update, delete |
| Object | read | — | — | create, update, delete |
| Identification | read | create | update, delete | create, update, delete |
| Bear | read | — | — | create, update, delete |

---

## Error Handling

### Build-Time Errors

| Condition | Behavior |
|-----------|----------|
| `amplify_outputs.json` missing | TypeScript module resolution fails at build time with "Cannot find module" — the import in `client.ts` is non-optional |
| TypeScript strict mode violation | `tsc --noEmit` exits non-zero; `next build` is blocked |
| Missing Amplify backend resource | `defineBackend()` TypeScript types surface missing resource at compile time |

### Runtime Errors

| Condition | Handler | User Impact |
|-----------|---------|-------------|
| Unauthenticated user calls `isAdmin()` | Returns `false` (no throw) | None — treated as non-admin |
| `fetchAuthSession` network failure | `try/catch` in `isAdmin()` returns `false` | None — treated as non-admin |
| AppSync authorization rejection | Amplify client throws `GraphQLError`; callers must handle | Shown as error state in UI (later specs) |
| S3 write denied for non-admin | S3 returns 403; Amplify Storage throws | Shown as error state in UI (later specs) |

### Deployment Errors

| Condition | Behavior |
|-----------|----------|
| `next build` fails in Amplify Hosting | Deployment marked failed; previous version preserved |
| `ampx pipeline-deploy` fails | Build halts before frontend build; `amplify_outputs.json` is not generated; deployment marked failed |
| `ampx sandbox` run without AWS credentials | CLI exits non-zero with credential error message |

---

## Amplify Hosting

### Connecting the Repository

1. In the AWS Amplify console, choose **Create new app → From git repository**
2. Connect to the GitHub repository and select the `main` branch
3. Amplify auto-detects the Next.js framework and sets the build command to `next build`
4. **Do not** add `amplify_outputs.json` to the repo — Amplify Hosting injects it at build time via the Gen 2 hosting integration

### Build Settings (`amplify.yml`)

Amplify Gen 2 with Hosting uses the following build spec (auto-generated, shown for reference):

```yaml
version: 1
backend:
  phases:
    build:
      commands:
        - npm ci --cache .npm --prefer-offline
        - npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID
frontend:
  phases:
    preBuild:
      commands:
        - npm ci --cache .npm --prefer-offline
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - .next/cache/**/*
      - .npm/**/*
```

The `ampx pipeline-deploy` command deploys the Amplify backend for the branch and generates `amplify_outputs.json` before the frontend build runs. This ensures the frontend has correct endpoints at build time.

### Per-Branch Environments

Each Amplify Hosting branch (e.g., `main`, `dev`) gets its own backend environment with separate Cognito pools, DynamoDB tables, and S3 bucket. Branch-specific config is handled entirely by Amplify — no `.env` files are committed.

---

## `.gitignore` Additions

Add the following to `.gitignore`:

```
# Amplify Gen 2 — generated per environment, never committed
amplify_outputs.json
.amplify/
amplify/#current-cloud-backend/

# Local environment overrides
.env*.local
.env.local
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Most of this spec consists of IaC definitions, directory scaffolding, and infrastructure configuration — these are verified by smoke tests and Amplify sandbox deployment rather than property-based tests. Two pure utility functions have universal correctness properties worth testing with property-based testing: `cn()` and `isAdmin()`.

The recommended PBT library for this TypeScript/Node project is **[fast-check](https://github.com/dubzzz/fast-check)**, which integrates with Vitest and Jest.

---

### Property 1: `cn()` last-wins conflict resolution

*For any* pair of Tailwind utility classes that control the same CSS property (e.g., two `text-*` color classes, two `p-*` padding classes), calling `cn(firstClass, secondClass)` SHALL return a string that contains `secondClass` and does not contain `firstClass`.

**Validates: Requirements 7.4**

---

### Property 2: `cn()` non-conflicting class preservation

*For any* set of Tailwind utility classes that control different CSS properties, calling `cn(...classes)` SHALL return a string that contains all input classes.

**Validates: Requirements 7.4**

---

### Property 3: `isAdmin()` group membership correctness

*For any* array of Cognito group name strings, if the array contains the string `"admin"` then `isAdmin()` SHALL return `true`, and if the array does not contain `"admin"` then `isAdmin()` SHALL return `false` — regardless of what other groups are present, how many there are, or their order.

**Validates: Requirements 8.4, 8.5**

---

### Property 4: `CAM_FEEDS` key completeness

*For any* value of type `CamFeed` (i.e., `"BF" | "RF" | "BFL" | "KRV" | "RW"`), looking it up in `CAM_FEEDS` SHALL always return a non-empty string — there are no `CamFeed` values that map to `undefined` or an empty string.

**Validates: Requirements 7.1, 7.3**

---

## Testing Strategy

### Dual Approach

**Unit / example-based tests** cover:
- `CAM_FEEDS` has exactly 5 keys with correct slug values
- `META_IDENTIFICATION_OPTIONS` has exactly 10 entries in the specified order with no duplicates
- `Nav` renders with the "BearCam Companion" heading and a `<Link href="/login">`
- `GalleryPage` renders the heading and placeholder message
- `RootLayout` renders `Nav` and `Footer` around `children`

**Property-based tests** (using fast-check, min 100 iterations each) cover the 4 correctness properties above.

### Test Configuration

Each property test must be tagged:

```typescript
// Feature: project-setup, Property 1: cn() last-wins conflict resolution
it('cn() last-wins conflict resolution', () => {
  fc.assert(
    fc.property(/* generators */, (first, second) => {
      const result = cn(first, second);
      expect(result).toContain(second);
      // ...
    }),
    { numRuns: 100 }
  );
});
```

### Smoke Tests (build-time)

- `tsc --noEmit` exits 0
- `next build` exits 0
- `amplify_outputs.json` is present and contains non-empty `aws_appsync_graphqlEndpoint`, `aws_user_pools_id`, `aws_cognito_identity_pool_id`, `aws_user_files_s3_bucket`
- No `pages/` directory exists
- No `tailwind.config.js` exists
- `react-icons`, `@heroicons/react`, `@fortawesome/*` are absent from `package.json`

### Integration Tests (post-sandbox-deploy)

- Unauthenticated AppSync query on `listImages` returns 200
- Unauthenticated AppSync mutation on `createImage` is rejected with authorization error
- S3 `GetObject` on `public/*` succeeds for guest IAM credentials
- S3 `PutObject` on `public/*` is denied for guest IAM credentials
- `ampx sandbox` completes with zero CloudFormation errors
