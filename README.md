# BearCam Companion v2

BearCam Companion is a crowdsourced bear identification platform tied to the live webcam streams at [explore.org](https://explore.org). It pulls images from the Katmai National Park bear cams, runs AI detection to find bears, and lets users collaboratively identify each bear by name or number.

This is **version 2** — a full rebuild on Next.js and AWS Amplify Gen 2. The original (Gen 1) app is at [hypraptive/bearcam-companion](https://github.com/hypraptive/bearcam-companion).

## What it does

- **Ingests images** from multiple explore.org webcam feeds
- **Runs AI detection** on each image to find bears and produce bounding boxes
- **Lets users label bears** — signed-in users assign an identity to each detected bear
- **Aggregates identifications** by plurality vote — the most common answer wins
- **Presents a public gallery** of all images, filterable by date, feed, and bear presence — no login required to browse

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Backend | AWS Amplify Gen 2 (TypeScript/CDK) |
| Data API | AWS AppSync (GraphQL) + DynamoDB |
| Ingestion API | Amazon API Gateway (REST) |
| Auth | Amazon Cognito |
| Storage | Amazon S3 |
| Compute | AWS Lambda (Node.js 20.x) |
| AI Detection | Amazon Rekognition (initial; pluggable) |
| Testing | Vitest + fast-check |

## Project structure

```
bearcam-companion-v2/
├── amplify/                # Amplify Gen 2 backend (TypeScript/CDK)
│   ├── auth/               # Cognito User Pool + Identity Pool
│   ├── data/               # AppSync GraphQL API + DynamoDB models
│   ├── storage/            # S3 bucket for webcam images
│   ├── functions/          # Lambda functions (ingest, detect, compute)
│   └── backend.ts          # Root backend definition
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── (public)/        # Public routes — no auth required
│   │   ├── (auth)/          # Authenticated routes
│   │   └── admin/           # Admin-only routes
│   ├── components/
│   │   ├── ui/              # shadcn/ui components
│   │   ├── bears/           # Bear-specific components
│   │   ├── images/          # Image-specific components
│   │   └── layout/          # Nav, footer, shells
│   ├── lib/
│   │   ├── amplify/         # Amplify client config and helpers
│   │   ├── constants.ts     # CAM_FEEDS, identification options
│   │   └── utils.ts         # Shared utilities
│   └── types/              # Shared TypeScript types
└── .kiro/                  # Kiro steering docs and specs
```

## Getting started

### Prerequisites

- Node.js 20+
- An AWS account with credentials configured locally (`aws configure`)
- The Amplify Gen 2 CLI (installed as a dev dependency)

### Install

```bash
npm install
```

### Run the backend sandbox

Amplify Gen 2 deploys a personal cloud sandbox for local development. This provisions the Cognito pool, AppSync API, DynamoDB tables, and S3 bucket, and generates `amplify_outputs.json`:

```bash
npx ampx sandbox
```

Leave this running in a separate terminal — it watches `amplify/` and redeploys on change.

### Run the frontend

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Run tests

```bash
npm test
```

## Development

This project is built with [Kiro](https://kiro.dev) using a spec-driven workflow. See `.kiro/` for:

- **`steering/`** — project conventions, tech stack decisions, data model, and backend architecture that guide all development
- **`specs/`** — feature specs (requirements → design → tasks) for each major piece of functionality

### Seeding development data

The gallery reads from the `Image` and `Object` tables, which are empty until image ingestion runs. To populate your sandbox with sample data for developing and testing the gallery, use the seed script:

```bash
npm run seed              # seed ~35 images across all feeds and years
npm run seed -- --clear   # delete all seeded data, then reseed
npm run seed -- --clear-only
```

The script is deterministic (fixed random seed) so repeated runs produce the same spread of feeds, years, and bear-presence states. Images point at [Picsum](https://picsum.photos) placeholder URLs, so the bounding boxes are illustrative rather than real detections — real images arrive with the image-ingestion feature.

Writes are authorized only for the `admin` Cognito group, so the script provisions a dedicated `seed-admin@bearcam.local` user in your sandbox user pool (via the Cognito Admin API using your local AWS credentials) and signs in as that user. This is a dev-only tool and is not part of the application or the production data migration.

### Camera feeds

Images are pulled from these explore.org feeds (Katmai National Park):

| Code | Feed |
|------|------|
| BF | Brooks Falls (main) |
| RF | The Riffles |
| BFL | Brooks Falls Low |
| KRV | Lower River |
| RW | River Watch |

## Deployment

The app deploys to AWS Amplify Hosting. Connect the repository in the Amplify console; Amplify detects Next.js and runs `npx ampx pipeline-deploy` to provision the backend before building the frontend. The build spec is in `amplify.yml`.

## Attribution

Webcam images are sourced from [explore.org](https://explore.org). This project is a community tool for bear identification and is not officially affiliated with explore.org or the National Park Service.
