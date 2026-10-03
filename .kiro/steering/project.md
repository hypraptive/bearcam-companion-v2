# BearCam Companion v2 — Project Overview

## What This App Does

BearCam Companion is a crowdsourced bear identification platform tied to the live webcam streams at [explore.org](https://explore.org). The app:

1. **Ingests images** from multiple explore.org webcam feeds on a scheduled or admin-triggered basis
2. **Runs AI detection** on each new image to find bears and produce bounding boxes
3. **Lets users label bears** — authenticated users can assign an identity (name or number) to each detected bear in an image
4. **Aggregates identifications** via a voting/plurality system — multiple users can label the same bear, and the most common answer wins
5. **Presents a browsable gallery** of all collected images, filterable by date, camera feed, and bear presence — available to all visitors without login

## Version 2 Goals

Version 2 is a full rebuild (frontend + backend) addressing known limitations of v1:

- Replace Create React App with Next.js App Router for better performance and SEO
- Replace Amplify Gen 1 (CLI-driven) with Amplify Gen 2 (TypeScript/CDK-first)
- Replace Amplify DataStore (with its slow initial sync) with direct AppSync queries
- Replace the hardcoded bear name list with a database-driven approach so bears can be added without a code deploy
- Improve mobile responsiveness throughout
- Enforce authorization at the API level (not just the UI)
- Lay groundwork for additional features: automated scheduling, BearID face recognition integration, enhanced admin tools

## Camera Feeds

| Code | Explore.org slug | Location |
|------|-----------------|----------|
| BF | brown-bear-salmon-cam-brooks-falls | Brooks Falls (main) |
| RF | brown-bear-salmon-cam-the-riffles | The Riffles |
| BFL | brooks-falls-brown-bears-low | Brooks Falls Low |
| KRV | brown-bear-salmon-cam-lower-river | Lower River |
| RW | river-watch-brown-bear-salmon-cams | River Watch |

Explore.org snapshot API: `https://omega.explore.org/api/snapshots/query?feed=<slug>&order=desc&orderBy=created_at&page=1&page_size=N`

## User Roles

| Role | Capabilities |
|------|-------------|
| **Anonymous** | Browse all images, view identifications and vote counts |
| **Authenticated user** | Everything above + submit/update their own bear identifications |
| **Admin** | Everything above + trigger image ingestion, add/edit/delete bounding boxes, manage bear list, access admin dashboard |

Admin group is managed via a Cognito user pool group named `admin`.

## Key Concepts

- **Image**: A single webcam snapshot saved to S3, with metadata (timestamp, feed, bear count)
- **Object**: A bounding box detected by AI within an image (may be a bear or other animal)
- **Identification**: One user's label for one bounding box (e.g. "480 Otis", "Unknown", "Not a bear")
- **Bear list**: A denormalized `bearCount` / `bearList` string on each Image, maintained for fast filtering and search (e.g. `"480 Otis,128 Grazer"`)
- **Bear registry**: A database table of known bears (replaces the hardcoded list from v1)

## AI Detection

The detection pipeline is intentionally abstracted to allow the underlying model to be swapped without affecting the rest of the application.

- **v2 initial implementation**: Amazon Rekognition `detectLabels` (same as v1) — fast to set up, good enough to bootstrap the app
- **Planned replacement**: A more bear-specific model (e.g. a custom YOLO/EfficientDet model, or the BearID pipeline) once the app is running. Rekognition's general-purpose detection misses bears and produces false positives at an unacceptable rate for production use.
- **Design principle**: The Lambda function that performs detection should be the only thing that changes when swapping models. The data written (bounding box coordinates as 0–1 fractions, label, confidence) must remain consistent regardless of which model produces it.

## Reference

The Gen 1 app is at [https://github.com/hypraptive/bearcam-companion](https://github.com/hypraptive/bearcam-companion) and serves as a functional reference throughout development. Consult it for business logic, bear identification lists, and feature details, but do not copy its architecture directly.

## Data Migration from v1

V2 will be seeded with data from the existing Gen 1 deployment rather than starting fresh. This preserves all crowd-sourced identifications users have already submitted.

The migration is a one-time script run after the v2 backend is deployed and before the app goes live. It covers:

1. **S3 images** — copy or re-point to the existing S3 bucket (images themselves don't need transformation)
2. **DynamoDB tables** — export v1 tables, transform to v2 schema, import into v2 tables
3. **Bear registry** — seed the `Bear` table from the hardcoded bear list in v1's `SetID.js`
4. **Consensus fields** — compute initial `consensusName`, `consensusConfidence`, and `totalVotes` on each `Object` from the existing `Identifications`
5. **Denormalized fields** — rebuild `bearCount` and `bearList` on each `Image`

The migration will be handled as a dedicated spec (`data-migration`) after the `project-setup` spec is complete. Do not design the v2 schema or Lambda logic in ways that make this migration harder — the `computeBearList` Lambda logic should be reusable by the migration script.
