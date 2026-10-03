# BearCam Companion v2 — Data Model

## Overview

Four core entities: `Image`, `Object`, `Identification`, and `Bear`. The relationship chain is:

```
Image (1) → Objects (many) → Identifications (many)
Bear (reference table) ← Identifications reference bear names/IDs
```

## Schema (Amplify Gen 2 TypeScript)

```typescript
// amplify/data/resource.ts

const schema = a.schema({

  Image: a.model({
    url: a.url(),                  // Original explore.org snapshot URL
    date: a.datetime(),            // Timestamp from explore.org
    s3Key: a.string(),             // S3 object key (e.g. "public/filename.jpg")
    bearCount: a.integer(),        // Denormalized count of detected bears
    bearList: a.string(),          // Denormalized comma-separated IDs, e.g. "480 Otis,Unknown"
    camFeed: a.enum(['BF','RF','BFL','KRV','RW']),
    objects: a.hasMany('Object', 'imageId'),
  })
  .authorization(rules => [
    rules.publicApiKey().to(['read']),
    rules.group('admin').to(['create','update','delete']),
  ]),

  Object: a.model({
    label: a.string(),             // Detection label (e.g. "Bear", "Bird")
    confidence: a.float(),         // Detection confidence 0–100
    // Bounding box as fractions of image dimensions (0–1), matching Rekognition format
    width: a.float(),
    height: a.float(),
    left: a.float(),
    top: a.float(),
    imageId: a.id().required(),
    image: a.belongsTo('Image', 'imageId'),
    identifications: a.hasMany('Identification', 'objectId'),
    // Denormalized consensus — maintained by computeBearList Lambda, not updated from frontend
    consensusName: a.string(),     // Plurality winner, e.g. "480 Otis" (null if no votes yet)
    consensusConfidence: a.float(),// Fraction of votes for winner, e.g. 0.875 (7/8 voters agreed)
    totalVotes: a.integer(),       // Total number of Identifications for this object
  })
  .authorization(rules => [
    rules.publicApiKey().to(['read']),
    rules.group('admin').to(['create','update','delete']),
  ]),

  Identification: a.model({
    bearId: a.id(),                // FK to Bear table (null = free-text / unknown)
    name: a.string(),              // Resolved display name at time of creation (denormalized for resilience)
    userId: a.string(),            // Cognito sub (user identifier)
    userDisplayName: a.string(),   // Cognito username for display
    objectId: a.id().required(),
    object: a.belongsTo('Object', 'objectId'),
    bear: a.belongsTo('Bear', 'bearId'),
  })
  .authorization(rules => [
    rules.publicApiKey().to(['read']),
    rules.authenticated().to(['create']),
    rules.owner().to(['update','delete']),  // users can only edit their own
    rules.group('admin').to(['create','update','delete']),
  ]),

  Bear: a.model({
    number: a.string(),            // e.g. "480", "747" (some bears have no name)
    name: a.string(),              // e.g. "Otis" (optional)
    displayName: a.string(),       // Computed: "480 Otis" or "747" — used in dropdowns/display
    notes: a.string(),             // Optional admin notes
    active: a.boolean(),           // Whether to show in the identification dropdown
    identifications: a.hasMany('Identification', 'bearId'),
  })
  .authorization(rules => [
    rules.publicApiKey().to(['read']),
    rules.group('admin').to(['create','update','delete']),
  ]),

});
```

> Note: The exact Amplify Gen 2 schema syntax should be verified against the current `@aws-amplify/backend` package version at implementation time. The types and structure above represent the intended design.

## Identification Options

The dropdown for labeling a bounding box includes:

1. **Meta-options** (always shown at top):
   - `Not a bear`
   - `Unknown`
   - `Unknown Adult`
   - `Unknown Subadult`
   - `Known Adult`
   - `Known Subadult`
   - `Cub (COY)`, `Cub (1.5yo)`, `Cub (2.5yo)`, `Cub (3.5yo)`

2. **Named bears** from the `Bear` table where `active = true`, sorted by number

These meta-options are stored as special `Bear` records (no number, flagged appropriately) or handled as a fixed enum — TBD at implementation.

## Denormalized Fields

`Image.bearCount` and `Image.bearList` are maintained for fast filtering and search. `Object.consensusName`, `Object.consensusConfidence`, and `Object.totalVotes` are maintained for ML training data export. All denormalized fields must be updated whenever:

- A new `Object` is created or deleted (admin bounding box edit)
- An `Identification` is created, updated, or deleted

**Update logic**: For each `Object` on the image, query all its `Identifications`, count votes per name, pick the plurality winner. Store winner and vote fraction on the `Object`. Rebuild `bearList`/`bearCount` on the `Image`. This runs in a Lambda function (`computeBearList`) triggered by DynamoDB Streams on the `Identification` and `Object` tables.

**Do not update these fields from the frontend** — always let the Lambda maintain them to keep data consistent.

## ML Training Data Export

The `Object` table's consensus fields make it straightforward to export high-quality training data:

```
Objects where:
  consensusName is a named bear (not "Unknown", "Not a bear", meta-categories)
  consensusConfidence >= 0.75   (e.g. ≥75% of voters agreed)
  totalVotes >= 2               (at least some agreement, not just one person)
```

Each qualifying `Object` provides: `s3Key` (the image), bounding box (`width`, `height`, `left`, `top`), and `consensusName` (the label). This is sufficient for a standard object detection or re-identification training dataset without any additional data restructuring.

## Key Differences from v1

| Aspect | v1 | v2 |
|--------|----|----|
| Bear list | Hardcoded JS array in `SetID.js` | `Bear` table in DynamoDB |
| Auth enforcement | UI-only | AppSync `@auth` rules |
| Identification ownership | No ownership, any user can overwrite | `owner` auth rule — users can only edit their own |
| `bearList` updates | Frontend + Lambda (redundant) | Lambda only (DynamoDB Streams) |
| Consensus stored on Object | No | Yes — `consensusName`, `consensusConfidence`, `totalVotes` |
| Data access pattern | Amplify DataStore (full offline sync) | Direct AppSync queries/mutations |
| `Identification.user` | Cognito username string | `userId` (Cognito sub) + `userDisplayName` |

## V1 → V2 Migration Mapping

The following table shows how v1 DynamoDB fields map to the v2 schema. A migration script will handle the transformation — see project.md for the full migration plan.

| v1 table | v1 field | v2 model | v2 field | Notes |
|----------|----------|----------|----------|-------|
| Images | `id` | Image | `id` | Direct copy |
| Images | `url` | Image | `url` | Direct copy |
| Images | `date` | Image | `date` | Direct copy |
| Images | `file.key` | Image | `s3Key` | Flatten S3Object — use `file.key` |
| Images | `bearCount` | Image | `bearCount` | Direct copy; recomputed by migration |
| Images | `bearList` | Image | `bearList` | Direct copy; recomputed by migration |
| Images | `camFeed` | Image | `camFeed` | Direct copy |
| Objects | `id` | Object | `id` | Direct copy |
| Objects | `label` | Object | `label` | Direct copy |
| Objects | `confidence` | Object | `confidence` | Direct copy |
| Objects | `width/height/left/top` | Object | `width/height/left/top` | Direct copy |
| Objects | `imagesID` | Object | `imageId` | Rename only |
| *(none)* | — | Object | `consensusName` | Computed from Identifications during migration |
| *(none)* | — | Object | `consensusConfidence` | Computed during migration |
| *(none)* | — | Object | `totalVotes` | Computed during migration |
| Identifications | `id` | Identification | `id` | Direct copy |
| Identifications | `name` | Identification | `name` | Direct copy |
| Identifications | `user` | Identification | `userDisplayName` | v1 stored username; `userId` (Cognito sub) will be left null — not recoverable from v1 data |
| Identifications | `objectsID` | Identification | `objectId` | Rename only |
| *(none)* | — | Bear | *(all fields)* | Seed from hardcoded array in v1 `SetID.js` |

**Key migration considerations**:
- `Identification.userId` cannot be backfilled from v1 — v1 only stored the username string, not the Cognito sub. Migrated identifications will have `userId = null` and won't be editable by their original authors in v2 (they can submit a new identification instead).
- The `Bear` table should be seeded before Identifications are migrated so that `bearId` foreign keys can be resolved from the `name` string where possible.
- Meta-options ("Unknown", "Not a bear", etc.) should also be seeded as `Bear` records so existing Identifications referencing them resolve correctly.
