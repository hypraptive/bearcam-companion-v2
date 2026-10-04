# BearCam Companion v2 — Backend

## Amplify Gen 2 Structure

```
amplify/
├── backend.ts              # Root backend definition — assembles all resources
├── auth/
│   └── resource.ts         # Cognito User Pool + Identity Pool (defineAuth)
├── data/
│   └── resource.ts         # AppSync GraphQL API + DynamoDB tables (defineData)
├── storage/
│   └── resource.ts         # S3 bucket for webcam images (defineStorage)
└── functions/
    ├── ingest-image/       # Fetches image from explore.org, uploads to S3, creates Image record
    │   └── handler.ts
    ├── detect-objects/     # Triggered by DynamoDB Stream on Image table — runs AI detection
    │   └── handler.ts
    └── compute-bear-list/  # Triggered by DynamoDB Streams on Object/Identification tables
        └── handler.ts
```

## Lambda Functions

### `ingest-image`

**Invocation**: **API Gateway (REST)** → Lambda. A single endpoint (`POST /ingest`) serves multiple caller types. Chosen over a native AppSync mutation because external exposure requires per-caller API keys, usage plans, rate limiting, and throttling — all of which API Gateway provides out of the box and AppSync does not.

**Callers and auth** (configured per-method on the same route):
- **Admin UI** — Cognito User Pool authorizer (the signed-in admin's token)
- **External callers** — API Gateway API key tied to a usage plan (revocable, rate-limited, throttled, usage-tracked)
- **EventBridge scheduling (future)** — a scheduled rule invoking the same endpoint or the Lambda directly; no new work required because the handler is invocation-agnostic

**Handler architecture** (required): The Lambda's core logic must be a pure function with the signature `ingestImage({ feed, url?, date? }): Promise<IngestResult>`, with a thin adapter layer that parses the incoming event (API Gateway proxy event now; AppSync resolver event or EventBridge event later) into that normalized input. Business logic must never read the raw event shape directly — this keeps all invocation paths open and makes the function testable without constructing a full API Gateway event.

**Inputs** (normalized): `{ feed: CamFeed, url?: string, date?: string }`
- If `url` is provided: upload that specific explore.org snapshot
- If only `feed` is provided: fetch the latest snapshot for that feed

**Steps**:
1. Call `https://omega.explore.org/api/snapshots/query?feed=<slug>&order=desc&orderBy=created_at&page=1&page_size=1`
2. Freshness check: skip if the image is older than `INGEST_MAX_AGE_MINUTES` (see below)
3. Idempotency check: skip if an `Image` record with the same `url` already exists
4. Download the JPEG via fetch
5. Upload to S3 under `public/<filename>.jpg`
6. Create an `Image` record in AppSync with `{ url, date, s3Key, camFeed }`
7. Return the new Image ID (or a skip reason if steps 2–3 short-circuit)

**Freshness check configuration**:

The maximum image age is controlled by the environment variable `INGEST_MAX_AGE_MINUTES`, defaulting to `10`. This allows the threshold to be tuned without a code change as the ingestion schedule evolves:

```typescript
const maxAgeMinutes = parseInt(process.env.INGEST_MAX_AGE_MINUTES ?? '10', 10);
const maxAgeMs = maxAgeMinutes * 60 * 1000;
const imageAge = Date.now() - new Date(snapshot.created_at).getTime();
if (imageAge > maxAgeMs) {
  return { skipped: true, reason: 'Image too old', imageAge, maxAgeMs };
}
```

When scheduling is set up via EventBridge, set `INGEST_MAX_AGE_MINUTES` to a value slightly larger than the schedule interval (e.g. schedule every 5 minutes → set max age to 7 minutes) to tolerate minor timing jitter without missing images.

**Environment variables**:
- `AMPLIFY_DATA_GRAPHQL_ENDPOINT` — injected by Amplify Gen 2
- `AMPLIFY_STORAGE_BUCKET_NAME` — injected by Amplify Gen 2
- `INGEST_MAX_AGE_MINUTES` — configurable, default `10`

**API Gateway setup**:
- Defined as a CDK construct in `amplify/backend.ts` (Amplify Gen 2 exposes the underlying CDK stack for resources without a native `define*` helper)
- Route: `POST /ingest`, accepting a JSON body `{ feed, url?, date? }`
- Two authorizers on the route: a Cognito User Pool authorizer (admin UI) and API key + usage plan (external callers)
- Usage plan sets throttling and quota limits; API keys are issued per external caller and are independently revocable
- Enable CORS for the admin UI origin(s) only
- Return structured JSON responses with appropriate HTTP status codes (200 success, 4xx client errors, 5xx for explore.org/S3 failures)

**Notes**:
- The explore.org API endpoint and feed slug mapping live in `src/lib/constants.ts` (frontend) and are duplicated in a shared constants file importable by Lambda. Keep them in sync.

---

### `detect-objects`

**Trigger**: DynamoDB Streams on the `Image` table — fires on `INSERT` events only.

**Steps**:
1. For each inserted Image record, retrieve `s3Key`
2. Call the detection backend (initially Amazon Rekognition `detectLabels`, min confidence 50%)
3. Save **all** detections that have bounding box instances as `Object` records — do not filter by label. This preserves misclassified bears (e.g. detected as "Person" or "Bird") for later admin review and correction.
4. For each detection instance, create an `Object` record via AppSync mutation:
   - `{ imageId, label, confidence, width, height, left, top }`
   - Bounding box stored as fractions of image dimensions (0–1), exactly as returned by Rekognition
5. After all Objects are created, update `Image.bearCount` (count of Objects with `label = "Bear"`)

**Detection abstraction**:
- The actual detection call is isolated in a single function `detectObjects(s3Key)` within the handler file
- Swapping from Rekognition to a different model means rewriting only that function — the rest of the handler (DynamoDB Streams parsing, AppSync mutations, bounding box storage) stays the same
- The output contract of `detectObjects()` is:
  ```typescript
  type DetectionResult = {
    label: string;
    confidence: number;  // 0–100
    instances: Array<{
      width: number; height: number; left: number; top: number;  // 0–1 fractions
    }>;
  };
  ```

**Label filtering in the UI** (not in the Lambda):
- The public image view shows only `label = "Bear"` Objects by default
- Admins can toggle a "show all detections" mode to see every Object and review/correct misclassifications
- The admin bounding box editor allows changing the `label` on any Object

**Environment variables**:
- `AMPLIFY_DATA_GRAPHQL_ENDPOINT`
- `AMPLIFY_STORAGE_BUCKET_NAME`

---

### `compute-bear-list`

**Trigger**: DynamoDB Streams on both the `Object` table and `Identification` table — fires on `INSERT`, `MODIFY`, and `REMOVE` events.

**Steps**:
1. Determine which `Image` is affected (follow `objectId → imageId` if triggered by Identification change)
2. Query all `Objects` for that Image
3. For each Object, query all its `Identifications`
4. Compute the plurality winner:
   - Count votes per `name`
   - Sort by count descending
   - Winner = highest count; if tie, prefer the most recently submitted
5. Update the `Object` record: `{ consensusName, consensusConfidence, totalVotes }`
6. Rebuild `Image.bearList` (comma-separated consensus names of bear Objects only) and `Image.bearCount`
7. Update the `Image` record

**Notes**:
- This function is the single source of truth for all denormalized aggregate fields — the frontend never writes to `bearCount`, `bearList`, `consensusName`, `consensusConfidence`, or `totalVotes`
- Must handle the case where an Object has zero Identifications: set `consensusName = null`, `consensusConfidence = null`, `totalVotes = 0`
- For `bearList` and `bearCount`: only include Objects where `label = "Bear"` AND `consensusName` is not null/unknown

**Environment variables**:
- `AMPLIFY_DATA_GRAPHQL_ENDPOINT`

---

## Auth Configuration

```typescript
// amplify/auth/resource.ts
export const auth = defineAuth({
  loginWith: { email: true },
  userAttributes: {
    preferredUsername: { required: false, mutable: true },
  },
  groups: ['admin'],
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSymbols: true,
  },
});
```

- Sign-up is via email + password (no social providers initially)
- The `admin` group is declared here but members are added manually via the Cognito console or an admin management UI
- Unauthenticated (guest) access is enabled on the Identity Pool to allow public read of AppSync data

---

## Storage Configuration

```typescript
// amplify/storage/resource.ts
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

- All webcam images stored under the `public/` prefix
- Guests and authenticated users can read (view images in the browser)
- Only admins (via Lambda execution role or admin group) can write/delete
- Lambda functions access S3 directly via IAM role (not through Amplify Storage client)

---

## Explore.org Integration

The explore.org snapshot API is an **undocumented, unofficial endpoint** — treat it as fragile.

- Always wrap calls in try/catch with meaningful error logging
- Do not assume the response shape is stable — validate fields before use
- The `ingest-image` Lambda should return a structured error (not throw) so the admin UI can display a useful message if the feed is unavailable
- Feed slug to code mapping (canonical source: `src/lib/constants.ts`):

```typescript
export const CAM_FEEDS = {
  BF:  'brown-bear-salmon-cam-brooks-falls',
  RF:  'brown-bear-salmon-cam-the-riffles',
  BFL: 'brooks-falls-brown-bears-low',
  KRV: 'brown-bear-salmon-cam-lower-river',
  RW:  'river-watch-brown-bear-salmon-cams',
} as const;

export type CamFeed = keyof typeof CAM_FEEDS;
```

The `CAM_FEEDS` list covers the current known explore.org feeds for Katmai National Park. Additional feeds may be added in the future — when doing so, update `constants.ts` (and its Lambda duplicate) and the `camFeed` enum in the data schema. Do not hardcode feed slugs anywhere else.
