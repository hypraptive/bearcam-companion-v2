# Implementation Plan: image-ingestion

## Overview

This plan builds the `image-ingestion` pipeline bottom-up: shared constants first (the one source of truth both Lambdas and the UI depend on), then the `ingest-image` Lambda assembled from its leaf client modules inward to the pure core and the event adapter, then its API Gateway exposure, then the `detect-objects` Lambda and its stream wiring, and finally the typed ingest helper and the admin UI that drive it. Each step builds on the previous one and ends by wiring the new piece into the thing that consumes it, so there is no orphaned code and no big-bang integration at the end.

Testing is dual, as the design's Testing Strategy requires: property-based tests (`fast-check`, 100+ iterations, one test per design Property, tagged with its Property number and the requirement clause it validates) for pure logic, and example / integration / CDK-assertion / smoke tests for I/O, infrastructure wiring, timeouts, logging, and UI rendering. Property-based and other test sub-tasks are marked optional with `*`; core implementation tasks are never optional.

All code is TypeScript (per `stack.md` / `conventions.md`): strict mode, explicit return types on exported functions, named exports, AWS SDK v3 modular imports in Lambdas, Server Components by default with `'use client'` only where interactive, shadcn/ui + Tailwind + Lucide + Next.js `<Image>`/`<Link>` in the UI.

## Tasks

- [ ] 1. Extend shared constants with explore.org endpoint and feed-slug resolution
  - [ ] 1.1 Add `EXPLORE_API_ENDPOINT`, `resolveFeedSlug`, and `CAM_FEED_CODES` to `src/lib/constants.ts`
    - Add `export const EXPLORE_API_ENDPOINT = 'https://omega.explore.org/api/snapshots/query'` in the same module as `CAM_FEEDS` (Req 14.2)
    - Add `export function resolveFeedSlug(feed: CamFeed): string` that looks up `CAM_FEEDS[feed]` and throws an `Error` naming the code if absent — no default/fallback slug (Req 14.6)
    - Add `export const CAM_FEED_CODES = Object.keys(CAM_FEEDS) as CamFeed[]` so the valid-code set is derived from the map keys (Req 14.5)
    - Keep the module free of any `next/*`, React, or browser-global dependency so it is Lambda-safe (Req 14.3)
    - Confirm no feed slug string literal is introduced anywhere outside this module (Req 1.5, 14.4)
    - _Requirements: 1.5, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [ ]* 1.2 Write property test for feed-slug resolution and round-trip
    - **Property 1: Feed-slug resolution and round-trip**
    - **Validates: Requirements 1.5, 14.4, 14.5, 14.6**
    - Generate `CamFeed` codes and arbitrary non-code strings; assert `resolveFeedSlug(code) === CAM_FEEDS[code]`, each slug maps back to exactly one code, `CAM_FEED_CODES` equals the keys of `CAM_FEEDS`, and a non-key input throws naming the code with no slug returned
    - _Requirements: 1.5, 14.4, 14.5, 14.6_

  - [ ]* 1.3 Write smoke tests for the constants module
    - Assert `CAM_FEEDS` has exactly five keys and five distinct slugs, and `EXPLORE_API_ENDPOINT` is a non-empty string in the same module (Req 14.1, 14.2)
    - Load the module in a Node context with no browser global defined to confirm it is Lambda-safe (Req 14.3)
    - _Requirements: 14.1, 14.2, 14.3_

- [ ] 2. Define `ingest-image` Lambda contracts and leaf client modules
  - [ ] 2.1 Define `IngestInput` and the `IngestResult` / `IngestOutcome` discriminated unions
    - Create `amplify/functions/ingest-image/types.ts` with `IngestInput` (`feed: CamFeed; url?: string; date?: string`) importing `CamFeed` from the shared constants by relative path
    - Define `IngestSuccess`, `IngestSkip` (with `SkipReason`), `IngestUpstreamFailure` (with `UpstreamSource` and `detail`), `IngestInternalFailure` (with `InternalReason`), and the adapter-only `IngestClientError`, exactly as specified in the design
    - Export `IngestResult` (core outcomes: success/skip/upstream-failure/internal-failure) and `IngestOutcome` (`IngestResult | IngestClientError`) with a single `kind` discriminator per variant (Req 5.7)
    - _Requirements: 5.6, 5.7_

  - [ ] 2.2 Implement the explore.org client with validation and timeout
    - Create `amplify/functions/ingest-image/explore-client.ts` resolving the slug via `resolveFeedSlug` and building the listing URL from `EXPLORE_API_ENDPOINT` with `order=desc&orderBy=created_at&page=1&page_size=1` (Req 1.1)
    - Enforce a 10s timeout via `AbortController` + `setTimeout`; on timeout/connection failure/non-2xx return a typed upstream result (`source: 'explore-api'`), never throw (Req 1.6, 1.7, 15.1)
    - Validate the response with explicit type guards: snapshot `url` must be a non-empty string and `created_at` must parse to a valid date; a missing/wrong-typed field yields `malformed-response` naming the field; zero snapshots yields a `no-snapshot` skip signal (Req 1.8, 1.9, 15.2, 15.3)
    - Log failures via `console.error` with the requested feed, resolved endpoint, and failure class, from a fixed field allowlist that never includes any header, token, or key value (Req 15.4, 15.5)
    - _Requirements: 1.1, 1.6, 1.7, 1.8, 1.9, 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ]* 2.3 Write property tests for explore.org validation and status classification
    - **Property 4: Explore.org snapshot validation** — **Validates: Requirements 1.9, 15.2, 15.3**
    - **Property 5: Explore.org status classification** — **Validates: Requirements 1.7**
    - Generate response objects with/without `url` and `created_at` of varying types, and HTTP status codes across 1xx–5xx; assert acceptance only on usable fields, `malformed-response` naming the bad field otherwise, non-2xx → `upstream-failure` attributed to `explore-api`, and no Image created on failure
    - _Requirements: 1.7, 1.9, 15.2, 15.3_

  - [ ]* 2.4 Write unit test for credential-safe explore.org failure logging
    - Assert the failure log includes feed, endpoint, and failure class and contains no credential substrings (Req 15.4, 15.5)
    - _Requirements: 15.4, 15.5_

  - [ ] 2.5 Implement the S3 client with deterministic key derivation
    - Create `amplify/functions/ingest-image/s3-client.ts` exporting `deriveS3Key(url): string` producing `public/<sha256(url) hex>.jpg` — deterministic per URL, distinct URLs distinct keys, always `public/`-prefixed (Req 4.4)
    - Implement `putJpeg` using `@aws-sdk/client-s3` `PutObjectCommand` with `Bucket = AMPLIFY_STORAGE_BUCKET_NAME`, the derived key, and `ContentType: 'image/jpeg'`; convert a `PutObject` failure into a typed `s3` upstream signal rather than throwing (Req 4.4, 4.5)
    - _Requirements: 4.4, 4.5_

  - [ ]* 2.6 Write property test for deterministic S3 key derivation
    - **Property 11: Deterministic S3 key derivation**
    - **Validates: Requirements 4.4**
    - Generate arbitrary URL strings; assert `deriveS3Key` is `public/`-prefixed, stable across repeated calls, and injective across distinct URLs
    - _Requirements: 4.4_

  - [ ] 2.7 Implement the IAM-authorized AppSync client
    - Create `amplify/functions/ingest-image/appsync-client.ts` posting SigV4-signed GraphQL to `AMPLIFY_DATA_GRAPHQL_ENDPOINT` using the execution-role credentials (IAM auth), isolating all AppSync access here
    - Implement `findImageByUrl(url)` performing the idempotency query (case-sensitive exact `url` match) under a 10s timeout, returning the matched records or a typed timeout/error signal (Req 3.1, 3.5)
    - Implement `createImage({ url, date, s3Key, camFeed })` returning the new id or a typed create-failure signal (Req 4.6, 4.9)
    - _Requirements: 3.1, 3.5, 4.6, 4.9_

- [ ] 3. Implement the pure `Ingest_Core` pipeline
  - [ ] 3.1 Implement `ingestImage(input)` orchestrating the fixed-order pipeline
    - Create `amplify/functions/ingest-image/ingest-core.ts` exporting `async function ingestImage(input: IngestInput): Promise<IngestResult>` that reads no raw event shape (Req 5.1, 5.2)
    - Resolve slug exclusively via `resolveFeedSlug`; re-validate a provided `url` as an absolute HTTP(S) URL (Req 1.2, 1.5)
    - Fetch latest-or-specific snapshot via the explore client, then run freshness → idempotency → download → S3 upload → create-Image in the exact short-circuit order from the design's Error Handling section
    - Implement freshness parsing of `INGEST_MAX_AGE_MINUTES` (base-10 int ≥ 1 else default 10) and the `ageMs <= minutes × 60000` boundary; too old → `image-too-old` skip, missing/unparseable timestamp with no `date` override → `invalid-timestamp` skip (Req 2.1–2.5)
    - Call idempotency before any download/upload; ≥1 match → `already-exists` skip with the first id; query timeout/error → `idempotency-check-failed` internal failure (Req 3.1–3.5)
    - Validate the download as a non-empty JPEG (magic bytes `FF D8 FF`) within 30s before upload; build the Image payload containing exactly `url`, `date`, `s3Key`, `camFeed` with `date` from `input.date` else `created_at`; create-after-upload failure → `image-create-failed` carrying `s3Key`; success → `success` with `imageId` (Req 4.1–4.10)
    - Wrap the whole body in `try/catch` so any unexpected error returns an `unexpected` internal failure instead of throwing (Req 5.6, 5.8)
    - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 5.1, 5.2, 5.6, 5.8, 15.1_

  - [ ]* 3.2 Write property test for freshness threshold parsing
    - **Property 6: Freshness threshold parsing**
    - **Validates: Requirements 2.1, 2.2**
    - Generate `INGEST_MAX_AGE_MINUTES` strings (empty, whitespace, negative, zero, floats, huge integers, valid ints); assert the parsed threshold equals a base-10 int ≥ 1 and defaults to 10 in every other case
    - _Requirements: 2.1, 2.2_

  - [ ]* 3.3 Write property tests for the freshness boundary and invalid-timestamp skip
    - **Property 7: Freshness boundary decision** — **Validates: Requirements 2.3, 2.4**
    - **Property 8: Invalid-timestamp skip** — **Validates: Requirements 2.5**
    - Generate `created_at`/threshold pairs straddling the boundary including exact equality; assert fresh iff `age ≤ minutes × 60000`, `image-too-old` skip otherwise, and absent/unparseable timestamp (no override) → invalid-timestamp skip with no download/upload/create
    - _Requirements: 2.3, 2.4, 2.5_

  - [ ]* 3.4 Write property test for the idempotency decision
    - **Property 9: Idempotency decision**
    - **Validates: Requirements 3.2, 3.3, 3.4**
    - Generate match sets of varying length including empty; assert a non-empty set → `already-exists` skip with the first matched id and no duplicate work, empty set → proceed to download
    - _Requirements: 3.2, 3.3, 3.4_

  - [ ]* 3.5 Write property tests for JPEG validity and the Image payload projection
    - **Property 10: JPEG payload validity** — **Validates: Requirements 4.3**
    - **Property 12: Image record projection** — **Validates: Requirements 4.6, 4.7, 4.8**
    - Generate byte buffers with/without the `FF D8 FF` prefix (incl. empty); assert acceptance iff non-empty JPEG, else `empty-or-non-jpeg` upstream failure with no upload/create. Generate inputs/snapshots; assert the payload is exactly `{url,date,s3Key,camFeed}` with `camFeed === feed`, `s3Key === deriveS3Key(url)`, `date` = input date when present else `created_at`, and no payload + date-validation internal failure when neither parses
    - _Requirements: 4.3, 4.6, 4.7, 4.8_

  - [ ]* 3.6 Write property test for total robustness and discriminator exhaustiveness
    - **Property 13: Ingest_Core total robustness and discriminator exhaustiveness**
    - **Validates: Requirements 5.6, 5.7, 5.8, 15.1**
    - Inject generated client behaviors (resolve/reject/throw) for explore, S3, and AppSync; assert `ingestImage` always resolves without throwing to an `IngestResult` whose `kind` is exactly one of the four variants with a matching shape
    - _Requirements: 5.6, 5.7, 5.8, 15.1_

  - [ ]* 3.7 Write integration tests for timeouts, idempotency ordering, and failure mapping
    - Explore 10s fetch and 30s download timeouts map to the correct `upstream-failure`; idempotency query runs before download/upload and a query timeout/error yields `internal-failure` with no writes; S3 failure → `s3` upstream failure; AppSync create failure → `image-create-failed` with `s3Key`; happy path create resolving `{id}` → `success` with `imageId`
    - _Requirements: 1.6, 3.1, 3.5, 4.1, 4.2, 4.5, 4.9, 4.10_

- [ ] 4. Implement the `Event_Adapter` handler and HTTP mapping
  - [ ] 4.1 Implement input parsing and client-error validation in the handler
    - Create `amplify/functions/ingest-image/handler.ts` as the only module that reads the API Gateway proxy event shape (Req 5.3)
    - Parse the JSON body; absent/invalid JSON or missing `feed` → `client-error` field `body`/`feed`; a `feed` not among the five codes → `client-error` field `feed`; a present-but-not-non-empty-string `url`/`date`, or a `url` that is not an absolute HTTP(S) URL → `client-error` naming the field — all without invoking `Ingest_Core` (Req 1.3, 1.4, 5.4, 5.5, 6.3, 6.6)
    - On valid input, call `ingestImage` with the normalized `{feed,url?,date?}` (Req 5.3, 6.3)
    - _Requirements: 1.3, 1.4, 5.3, 5.4, 5.5, 6.3, 6.6_

  - [ ] 4.2 Implement `toHttpResponse` mapping `IngestOutcome` to status + JSON
    - Map by discriminator only: `success`/`skip` → 200, `client-error` → 400, `upstream-failure` → 502, `internal-failure` → 500, with the JSON body shapes from the design table; total over the union with an exhaustiveness check (Req 6.4–6.9)
    - Wire the handler to return `toHttpResponse(outcome)` so every response is JSON with a consistent status (Req 6.9, 15.6)
    - _Requirements: 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 15.6_

  - [ ]* 4.3 Write property tests for input validation and HTTP mapping
    - **Property 2: Feed-code input validation** — **Validates: Requirements 1.3, 5.4**
    - **Property 3: URL and date input validation** — **Validates: Requirements 1.4, 5.5**
    - **Property 14: IngestOutcome to HTTP response mapping** — **Validates: Requirements 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 15.6**
    - Generate bodies with missing/invalid `feed` and present-but-malformed `url`/`date`; assert a `client-error` naming the field with no core invocation. Generate every `IngestOutcome` variant; assert the status/body mapping is total with no unmapped case
    - _Requirements: 1.3, 1.4, 5.4, 5.5, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 15.6_

- [ ] 5. Define the `ingest-image` function resource
  - [ ] 5.1 Create `defineFunction` for `ingest-image`
    - Create `amplify/functions/ingest-image/resource.ts` with `defineFunction` on Node.js 20.x, entry `handler.ts`, a timeout above the summed worst-case stage timeouts (e.g. 60s) so per-stage `AbortController`s fire first, and `INGEST_MAX_AGE_MINUTES` default `10` in `environment` (`AMPLIFY_DATA_GRAPHQL_ENDPOINT` / `AMPLIFY_STORAGE_BUCKET_NAME` are injected by Amplify) (Req 2.1)
    - Ensure `amplify/tsconfig.json` permits importing `src/lib/constants` so the bundled function ships only the constant values
    - _Requirements: 2.1, 5.1_

- [ ] 6. Expose ingestion via the API Gateway REST endpoint
  - [ ] 6.1 Add the REST API, `POST /ingest`, dual authorization, usage plan, and CORS in `backend.ts`
    - Register `ingestImage` in `defineBackend`; create a dedicated stack via `backend.createStack('ingest-api')` and a `RestApi` (Req 6.1)
    - Add the `ingest` resource and `POST` method wired to a `LambdaIntegration` of the ingest function (Req 6.1, 6.3)
    - Attach a `CognitoUserPoolsAuthorizer` built from `backend.auth.resources.userPool` for the admin path, and the API-key path (`apiKeyRequired` / request authorizer) bound to a `UsagePlan` with `throttle` (rateLimit, burstLimit) and `quota` (limit, period) — choosing the custom-request-authorizer vs secondary-method approach that expresses "one logical endpoint, two credential types" against the installed `aws-cdk-lib` (Req 7.1, 7.2, 7.4, 13.5)
    - Set `defaultCorsPreflightOptions.allowOrigins` to exactly the single configured admin origin (`ADMIN_UI_ORIGIN`) and never `*` (Req 7.7, 7.8)
    - _Requirements: 6.1, 6.3, 7.1, 7.2, 7.4, 7.7, 7.8, 13.5, 13.6_

  - [ ] 6.2 Grant the ingest function role S3 and AppSync IAM permissions
    - Grant `s3:PutObject` on `arn:…:<bucket>/public/*` and `appsync:GraphQL` for the Image idempotency `list`/`get` and `create` operations to `backend.ingestImage.resources.lambda`'s execution role (Req 4.4, 4.6, 7.1)
    - _Requirements: 4.4, 4.6_

  - [ ]* 6.3 Write CDK assertion tests for the ingestion endpoint
    - Assert `POST /ingest` exists; a Cognito authorizer is attached for the admin path; API-key authorization plus a usage plan with throttle (rate, burst) and quota are configured for the external path; CORS `allowOrigins` is exactly the one admin origin and never `*` (Req 6.1, 7.1, 7.2, 7.4, 7.7, 7.8)
    - _Requirements: 6.1, 7.1, 7.2, 7.4, 7.7, 7.8_

- [ ] 7. Define `detect-objects` contracts and detection core
  - [ ] 7.1 Define `DetectionResult`, `DetectionInstance`, and `DetectOutcome` types
    - Create `amplify/functions/detect-objects/types.ts` with `DetectionInstance` (`width/height/left/top` 0–1), `DetectionResult` (`label`, `confidence` 0–100, `instances[]`), and the `DetectOutcome` union (`all-created` / `partial` / `skipped`) from the design
    - _Requirements: 11.2, 9.9_

  - [ ] 7.2 Implement `detectObjects(s3Key)` isolating Rekognition
    - Create `amplify/functions/detect-objects/detect-core.ts` exporting `async function detectObjects(s3Key: string): Promise<DetectionResult[]>` calling `@aws-sdk/client-rekognition` `DetectLabelsCommand` with `MinConfidence: 50` and `Image.S3Object = { Bucket: AMPLIFY_STORAGE_BUCKET_NAME, Name: s3Key }` (Req 9.1)
    - Map each `Label` → `DetectionResult` with instances from `Label.Instances[].BoundingBox`; exclude any non-conforming result (missing name/confidence, box values outside 0–1 or non-numeric) rather than passing it through (Req 11.2, 11.4)
    - Surface a Rekognition call failure by throwing out of `detectObjects` with no fabricated/partial results; keep every Rekognition-specific type inside this module (Req 11.1, 11.3, 11.5)
    - _Requirements: 9.1, 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 7.3 Write property test for detection contract conformance and filtering
    - **Property 18: Detection contract conformance and filtering**
    - **Validates: Requirements 11.2, 11.4**
    - Generate backend responses with in- and out-of-range confidences and box coordinates; assert `detectObjects` returns only conforming results (`confidence ∈ [0,100]`, every box coord `∈ [0,1]`) and excludes the rest
    - _Requirements: 11.2, 11.4_

  - [ ]* 7.4 Write integration tests for the Rekognition call contract
    - Assert Rekognition is called with `MinConfidence: 50` and that a backend throw surfaces out of `detectObjects` with no fabricated results
    - _Requirements: 9.1, 11.5_

- [ ] 8. Implement `detect-objects` AppSync writes and handler
  - [ ] 8.1 Implement the IAM-authorized AppSync client for detection
    - Create `amplify/functions/detect-objects/appsync-client.ts` with `createObject({ imageId, label, confidence, width, height, left, top })` and `updateImageBearCount(imageId, bearCount)` via SigV4-signed GraphQL to `AMPLIFY_DATA_GRAPHQL_ENDPOINT`
    - Create payloads carry no `consensusName`/`consensusConfidence`/`totalVotes`; the Image update writes only `bearCount` (never `bearList` or consensus fields) (Req 10.2)
    - _Requirements: 9.3, 10.1, 10.2_

  - [ ] 8.2 Implement the stream handler: INSERT filter, per-record processing, Object mapping, provisional bearCount
    - Create `amplify/functions/detect-objects/handler.ts` that defensively re-checks `record.eventName === 'INSERT'` and ignores `MODIFY`/`REMOVE`, evaluating each batch record independently (Req 8.2, 8.3, 8.6)
    - Read `s3Key` from the inserted Image; absent/empty/non-string → record a processing error, skip detection, continue the batch (Req 8.4, 8.5)
    - Call `detectObjects(s3Key)` under a 30s processing timeout; error/timeout → record a detection error identifying the Image, leave it unmodified, continue; a detection failure creates no partial/malformed Objects (Req 8.7, 9.7)
    - For every instance across all labels (no label filtering), create one Object with `{imageId,label,confidence,width,height,left,top}` storing boxes as exact 0–1 fractions; a label with zero instances creates nothing; zero instances overall → zero Objects and provisional `bearCount` 0 (Req 9.2, 9.3, 9.4, 9.5, 9.6)
    - Tolerate per-Object create failures (log Image + instance, keep successes, continue) and report `all-created` vs `partial`; set provisional `bearCount` to the count of successfully persisted Objects whose `label` is exactly `"Bear"`; a bearCount-update failure logs and leaves the prior value and Objects intact (Req 9.8, 9.9, 10.1, 10.3)
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 10.1, 10.2, 10.3_

  - [ ]* 8.3 Write property tests for stream filtering and batch independence
    - **Property 15: Stream INSERT filtering** — **Validates: Requirements 8.2, 8.3**
    - **Property 16: Batch record independence** — **Validates: Requirements 8.5, 8.6**
    - Generate batches mixing INSERT/MODIFY/REMOVE and valid/invalid `s3Key`; assert detection runs iff `INSERT`, and each record's outcome depends only on itself
    - _Requirements: 8.2, 8.3, 8.5, 8.6_

  - [ ]* 8.4 Write property tests for Object mapping, create resilience, bearCount, and field non-interference
    - **Property 17: Detection-to-Object mapping** — **Validates: Requirements 9.2, 9.3, 9.4, 9.5, 9.6**
    - **Property 19: Object-create resilience and outcome classification** — **Validates: Requirements 9.8, 9.9**
    - **Property 20: Provisional bear count** — **Validates: Requirements 10.1**
    - **Property 21: Lambda-managed field non-interference** — **Validates: Requirements 10.2**
    - Generate `DetectionResult[]` (incl. zero-instance labels and out-of-range boxes), failing create subsets, and label sets with exact `"Bear"` and near-misses; assert produced records equal total instance count with exact box fidelity, outcome is `all-created`/`partial` with correct counts, `bearCount` counts only exact `"Bear"`, and no payload carries `bearList`/consensus fields
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.8, 9.9, 10.1, 10.2_

  - [ ]* 8.5 Write integration tests for detection failure handling
    - Detection failure creates zero Objects; a `bearCount`-update failure leaves the prior value and created Objects intact; a detection error leaves the Image unmodified
    - _Requirements: 8.7, 9.7, 10.3_

- [ ] 9. Define the `detect-objects` resource and stream wiring
  - [ ] 9.1 Create `defineFunction` for `detect-objects`
    - Create `amplify/functions/detect-objects/resource.ts` on Node.js 20.x, entry `handler.ts`, 60s timeout, with the `AMPLIFY_*` env vars available
    - _Requirements: 8.1_

  - [ ] 9.2 Wire the DynamoDB stream event source and detection IAM grants in `backend.ts`
    - Register `detectObjects` in `defineBackend`; attach a `DynamoEventSource` on `backend.data.resources.tables['Image']` with `startingPosition: TRIM_HORIZON`, a batch size, and `filterCriteria` for `eventName = INSERT` (Req 8.1, 8.2)
    - Grant the function role `rekognition:DetectLabels`, `s3:GetObject` on `public/*`, and `appsync:GraphQL` for `Object` create and `Image` update (Req 9.1, 9.3, 10.1)
    - _Requirements: 8.1, 8.2, 9.1, 9.3, 10.1_

  - [ ]* 9.3 Write a CDK assertion test for the stream mapping
    - Assert the `detect-objects` function has an event-source mapping on the `Image` table stream filtered to `INSERT`
    - _Requirements: 8.1_

- [ ] 10. Checkpoint - backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement the typed ingest helper
  - [ ] 11.1 Create `postIngest` in `src/lib/amplify/ingest.ts`
    - Define `IngestRequest` (`feed: CamFeed; url?: string`) and the `IngestResponse` union from the design
    - `postIngest` reads the access token via `fetchAuthSession()`, sets `Authorization: Bearer <token>`, POSTs JSON to the ingest endpoint, and normalizes success/skip/4xx-5xx-with-JSON/network-or-parse-failure into `IngestResponse` so the UI gets a consistent set of states (Req 12.5)
    - _Requirements: 12.2, 12.4, 12.5, 12.10, 12.11_

  - [ ]* 11.2 Write property test for admin UI request construction
    - **Property 22: Admin UI request construction**
    - **Validates: Requirements 12.2, 12.4**
    - Generate a selected feed and optional snapshot URL; assert the request body includes `feed` and includes `url` iff a specific snapshot was selected
    - _Requirements: 12.2, 12.4_

  - [ ]* 11.3 Write unit test for the helper's auth header
    - Assert `postIngest` sets the `Authorization` header from the session access token
    - _Requirements: 12.5_

- [ ] 12. Implement the admin ingestion UI
  - [ ] 12.1 Create the admin-gated route Server Component
    - Create `src/app/admin/ingest/page.tsx` as a Server Component that resolves the session and calls `isAdmin()` from `src/lib/amplify/auth.ts`: not signed in → redirect to sign-in; signed-in non-admin or indeterminate → render access-denied with no ingestion controls (Req 13.1–13.4)
    - Render `ingest-panel.tsx` only when `isAdmin()` is true; the UI gate is in addition to the API authorizer, never a substitute (Req 13.5)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [ ] 12.2 Create the interactive ingest panel and response-to-message mapping
    - Create `src/app/admin/ingest/ingest-panel.tsx` (`'use client'`) with a shadcn/ui `Select` populated from `CAM_FEED_CODES` (exactly five), a fetch-latest `Button` calling `postIngest({feed})`, a browse view listing up to 20 recent snapshots (Next.js `<Image>` thumbnails, no raw `<img>`) with a save action calling `postIngest({feed,url})`, Tailwind utilities, and Lucide icons (Req 12.1, 12.2, 12.3, 12.4)
    - While a request is in-flight, show a Lucide spinner and disable the triggering control to block duplicate concurrent submits; restore on any response (Req 12.6, 12.7)
    - Map `IngestResponse`: success → confirmation incl. new Image id; skip → human-readable reason; 4xx/5xx-with-JSON → message from the body with feed+browse state retained; network/parse failure → generic "request could not be completed" with state retained; empty/failed browse list → "no snapshots available" with save disabled (Req 12.8–12.12)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11, 12.12_

  - [ ]* 12.3 Write property test for response-to-message mapping
    - **Property 23: Admin UI response-to-message mapping**
    - **Validates: Requirements 12.8, 12.9, 12.10, 12.11**
    - Generate every `IngestResponse` variant; assert success → message with the Image id, skip → the reason, error-body → message from the body, network/parse failure → the generic message
    - _Requirements: 12.8, 12.9, 12.10, 12.11_

  - [ ]* 12.4 Write example tests for UI rendering and access gating
    - Feed selector renders exactly the five `CAM_FEED_CODES`; browse renders `min(N,20)` items and the empty/failed case shows the no-snapshots message with save disabled; in-flight disables the trigger and shows a spinner, any response restores it; gating across unauthenticated → redirect, non-admin → access denied, admin → allowed, `isAdmin()` error → denied
    - _Requirements: 12.1, 12.3, 12.6, 12.7, 12.12, 13.1, 13.2, 13.3, 13.4_

- [ ] 13. Final wiring and static-contract verification
  - [ ]* 13.1 Add static/smoke checks enforcing the design seams
    - Lint/grep check: no explore.org slug literal outside `src/lib/constants.ts` (Req 1.5, 14.4); `Ingest_Core` imports no raw event type and the detection handler references no Rekognition-specific type outside `detect-core.ts` (Req 5.2, 5.3, 11.1, 11.3)
    - Type-level test confirming the `ingestImage({ feed, url?, date? }): Promise<IngestResult>` signature (Req 5.1)
    - _Requirements: 1.5, 5.1, 5.2, 5.3, 11.1, 11.3, 14.4_

  - [ ] 13.2 Build the backend and app and resolve any wiring errors
    - Run the Amplify backend synth/typecheck and the Next.js build; fix any import-path, tsconfig, or type errors so the constants module, both Lambdas, the API Gateway construct, the ingest helper, and the admin route all compile and wire together end to end
    - _Requirements: 6.1, 8.1, 12.5, 13.5, 14.3_

- [ ] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (property-based, unit, integration, CDK-assertion, example, and static/smoke tests) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each property-based test implements exactly one design Property (1–23), runs ≥100 `fast-check` iterations, and is tagged `// Feature: image-ingestion, Property {n}: {text}` referencing the requirement clause it validates.
- Property-based tests cover pure logic; AWS behavior, CDK wiring, timeouts, logging, and UI rendering are covered by integration, CDK-assertion, example, and smoke tests, exactly as the design's Testing Strategy classifies them.
- The build order keeps each piece integrated into its consumer as it lands (constants → clients → core → adapter → function → API Gateway → detection core → detection handler → stream wiring → helper → UI → build), so there is no orphaned code and no big-bang final integration.
- `bearList` and all `Object` consensus fields remain owned by the out-of-scope `compute-bear-list` Lambda; `detect-objects` writes only a provisional `bearCount`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "2.2", "2.5", "7.1"] },
    { "id": 2, "tasks": ["2.3", "2.4", "2.6", "2.7", "7.2"] },
    { "id": 3, "tasks": ["3.1", "7.3", "7.4", "8.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "4.1", "8.2"] },
    { "id": 5, "tasks": ["4.2", "8.3", "8.4", "8.5"] },
    { "id": 6, "tasks": ["4.3", "5.1", "9.1"] },
    { "id": 7, "tasks": ["6.1", "9.2"] },
    { "id": 8, "tasks": ["6.2", "6.3", "9.3", "11.1"] },
    { "id": 9, "tasks": ["11.2", "11.3", "12.1"] },
    { "id": 10, "tasks": ["12.2"] },
    { "id": 11, "tasks": ["12.3", "12.4", "13.1"] },
    { "id": 12, "tasks": ["13.2"] }
  ]
}
```
