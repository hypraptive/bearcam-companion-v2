# BearCam Companion v2 — Tech Stack

## Frontend

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | **Next.js 14+ (App Router)** | SSR/SSG for gallery pages, Server Components for fast mobile loads. All new pages use the App Router — no Pages Router. |
| Language | **TypeScript** | Strict mode enabled. Explicit return types on all functions. No `any` unless unavoidable and commented. |
| Styling | **Tailwind CSS v4** | Utility-first, mobile-first breakpoints. CSS-first config (no `tailwind.config.js` for most customization). |
| Component library | **shadcn/ui** | Components are copied into `src/components/ui/` and owned by the project. Built on Radix UI primitives — accessible by default. |
| Icons | **Lucide React** | Ships with shadcn/ui. Use Lucide icons consistently; do not mix in react-icons or other icon sets. |
| Auth UI | **Amplify UI for React** | `<Authenticator>` component for login/signup flow. Wrap only where auth is required. |
| Image annotation | **Annotorious** (or equivalent) | Used in admin bounding box editor. Evaluate v3 for v2 — same library as v1 but confirm Next.js/ESM compatibility. |

## Backend

| Layer | Choice | Notes |
|-------|--------|-------|
| Platform | **AWS Amplify Gen 2** | TypeScript/CDK-first. Backend defined in `amplify/` directory. |
| API (data) | **AWS AppSync (GraphQL)** | Defined via `defineData()` in Amplify Gen 2. Direct queries/mutations — no DataStore. |
| API (ingestion) | **Amazon API Gateway (REST)** | `POST /ingest` → `ingest-image` Lambda. Defined as a CDK construct in `backend.ts`. Serves the admin UI (Cognito authorizer) and external callers (API key + usage plan) from one endpoint. |
| Auth | **Amazon Cognito** | User Pool + Identity Pool via `defineAuth()`. One user group: `admin`. |
| Storage | **Amazon S3** | Webcam images stored under `public/` prefix via `defineStorage()`. |
| Functions | **AWS Lambda (Node.js 20.x)** | Defined via `defineFunction()`. TypeScript source. |
| AI Detection | **Amazon Rekognition** (initial) | `detectLabels` via AWS SDK v3. Abstracted behind a detection Lambda — see project.md for swap plan. |
| Scheduling | **Amazon EventBridge** (planned) | For automated image ingestion. Manual/admin-triggered first, scheduled later. |

## Key Amplify Gen 2 Principles

- All backend resources are defined in TypeScript in the `amplify/` directory — no manual CloudFormation or console configuration
- Environment-specific config is handled via Amplify branches, not `.env` files checked into the repo
- The generated `amplify_outputs.json` replaces v1's `aws-exports.js` — it is gitignored and generated per-environment
- Authorization is enforced at the API level using Amplify Gen 2 auth rules, not just in the UI

## Authentication & Authorization Strategy

- **Public read**: Anonymous users can query Images, Objects, and Identifications (read-only)
- **Authenticated write**: Only signed-in users can create/update Identifications (their own only)
- **Admin write**: Only members of the `admin` Cognito group can create/update/delete Images, Objects, and Bears
- These rules are enforced in the AppSync schema via `@auth` directives — not just in React UI checks

## What We Are NOT Using

- ~~Amplify DataStore~~ — replaced with direct AppSync queries for faster load and simpler mental model
- ~~Create React App~~ — replaced with Next.js
- ~~AWS Amplify v4 UI components (Collection, Card, etc.)~~ — replaced with shadcn/ui
- ~~Amplify Predictions category~~ — Rekognition called directly via AWS SDK in Lambda
- ~~Amazon Pinpoint analytics~~ — not included in v2 initially
- ~~AWS SDK v2~~ — use AWS SDK v3 (modular) in all Lambda functions
- ~~Hardcoded bear name array~~ — replaced with a Bears database table
