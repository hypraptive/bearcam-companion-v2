# Requirements Document

## Introduction

The `image-ingestion` feature covers the pipeline that gets webcam snapshots from explore.org into BearCam Companion v2 and runs AI object detection on each new image. It spans three backend components and one admin-facing UI:

1. An `ingest-image` AWS Lambda that fetches a snapshot (the latest for a feed, or a specific URL) from the explore.org snapshot API, applies a configurable freshness check and an idempotency check, downloads the JPEG, uploads it to Amazon S3 under the `public/` prefix, and creates an `Image` record in AppSync.
2. An Amazon API Gateway REST endpoint (`POST /ingest`) that exposes the `ingest-image` Lambda to two caller types — the signed-in admin UI (Cognito User Pool authorizer) and external callers (API key + usage plan) — defined as a CDK construct in `amplify/backend.ts`.
3. A `detect-objects` AWS Lambda, triggered by DynamoDB Streams on `INSERT` to the `Image` table, that runs detection (Amazon Rekognition `detectLabels` initially), saves every detection that has bounding box instances as `Object` records with no label filtering, and sets a provisional `Image.bearCount`.
4. An admin-only page that triggers ingestion by calling `POST /ingest` with the admin's Cognito token, offering both a "fetch latest for feed" action and a browse-and-select flow for specific snapshots.

The feature follows the Amplify Gen 2 TypeScript/CDK-first model. The explore.org snapshot API is undocumented and fragile, so all calls to it are defensively wrapped and validated. The core ingestion logic is a pure, invocation-agnostic function so that the same logic can later be driven by EventBridge scheduling without change.

**Out of scope**: EventBridge scheduling (manual and external triggering only for now) and the `compute-bear-list` Lambda (owned by the bear-identification spec). The `bearCount` written by `detect-objects` is provisional and is later recomputed from consensus by `compute-bear-list`.

## Glossary

- **Ingestion_System**: The collection of backend resources (the `ingest-image` Lambda, the API Gateway REST endpoint, the `detect-objects` Lambda) and the admin UI that together implement this feature.
- **Ingest_Lambda**: The `ingest-image` AWS Lambda function (Node.js 20.x, TypeScript) that fetches, stores, and records a single webcam snapshot.
- **Ingest_Core**: The pure business-logic function with signature `ingestImage({ feed, url?, date? }): Promise<IngestResult>` that performs ingestion independently of how the Lambda was invoked.
- **Event_Adapter**: The thin layer inside the Ingest_Lambda handler that parses an incoming invocation event (an API Gateway proxy event now; other event shapes later) into the normalized `{ feed, url?, date? }` input passed to Ingest_Core.
- **IngestResult**: The structured return value of Ingest_Core, representing either a successful ingestion (including the new Image id) or a skip (including a machine-readable skip reason) or an error (including a machine-readable error reason).
- **Ingest_Endpoint**: The Amazon API Gateway REST route `POST /ingest` that invokes the Ingest_Lambda.
- **Admin_Authorizer**: The Cognito User Pool authorizer applied to the Ingest_Endpoint for requests from the signed-in admin UI.
- **ApiKey_Authorizer**: The API Gateway API key plus usage plan applied to the Ingest_Endpoint for external callers, providing throttling, quota, and per-key revocation.
- **Usage_Plan**: The API Gateway usage plan that binds API keys to throttling (rate and burst) and quota limits.
- **Detect_Lambda**: The `detect-objects` AWS Lambda function (Node.js 20.x, TypeScript) triggered by DynamoDB Streams on the `Image` table.
- **Detect_Core**: The isolated detection function with signature `detectObjects(s3Key): Promise<DetectionResult[]>` that calls the detection backend and returns results in the documented contract, independent of which model is used.
- **DetectionResult**: The output contract of Detect_Core — `{ label: string; confidence: number; instances: Array<{ width: number; height: number; left: number; top: number }> }`, where confidence is 0–100 and box coordinates are 0.0–1.0 fractions.
- **Explore_API**: The undocumented explore.org snapshot query endpoint `https://omega.explore.org/api/snapshots/query`.
- **CamFeed**: One of the five camera feed codes — `BF` (Brooks Falls), `RF` (The Riffles), `BFL` (Brooks Falls Low), `KRV` (Lower River), `RW` (River Watch).
- **Cam_Feeds_Map**: The shared `CAM_FEEDS` constant mapping each CamFeed code to its explore.org feed slug, importable by both frontend and Lambda code without pulling in Next.js or browser dependencies.
- **Image**: A data model record representing one webcam snapshot, with fields `url`, `date`, `s3Key`, `bearCount`, `bearList`, `camFeed`, and related `objects`.
- **Object**: A data model record representing one AI-detected bounding box within an Image, with fields `label`, `confidence`, `width`, `height`, `left`, `top`, and the Lambda-maintained consensus fields.
- **Admin_Ingest_Page**: The admin-only Next.js page that triggers ingestion by calling the Ingest_Endpoint.
- **isAdmin**: The canonical admin-check helper in `src/lib/amplify/auth.ts` that determines admin status from the `cognito:groups` claim.
- **Freshness_Threshold**: The maximum allowed age of a snapshot, in minutes, read from the environment variable `INGEST_MAX_AGE_MINUTES` and defaulting to 10.
- **Detection_Min_Confidence**: The minimum detection confidence passed to the detection backend, 50 (percent).

---

## Requirements

### Requirement 1: Fetch a Snapshot from the Explore.org API

**User Story:** As an admin, I want the ingestion function to fetch the latest snapshot for a camera feed (or a specific snapshot I provide), so that current webcam images enter the system.

#### Acceptance Criteria

1. WHEN Ingest_Core is invoked with a `feed` and no `url`, THE Ingest_Lambda SHALL request the latest snapshot from the Explore_API using the feed slug resolved from the Cam_Feeds_Map for that `feed`, requesting the first page ordered by `created_at` descending with a page size of 1.
2. WHEN Ingest_Core is invoked with both a `feed` and a `url`, THE Ingest_Lambda SHALL ingest the snapshot identified by that `url` rather than requesting the latest snapshot, provided the `url` is a well-formed absolute HTTP(S) URL.
3. IF Ingest_Core is invoked with a `feed` value that is not one of the five defined CamFeed codes, THEN THE Ingest_Lambda SHALL return an IngestResult indicating a client input error identifying the invalid feed, and SHALL NOT request any snapshot from the Explore_API.
4. IF Ingest_Core is invoked with both a `feed` and a `url` where the `url` is not a well-formed absolute HTTP(S) URL, THEN THE Ingest_Lambda SHALL return an IngestResult indicating a client input error identifying the invalid url, and SHALL NOT request or download any snapshot.
5. WHEN the Ingest_Lambda requests a snapshot from the Explore_API, THE Ingest_Lambda SHALL resolve the explore.org feed slug exclusively from the Cam_Feeds_Map and SHALL NOT embed any feed slug literal elsewhere in the ingestion code.
6. WHEN the Ingest_Lambda requests a snapshot from the Explore_API, THE Ingest_Lambda SHALL abandon the request if it has not completed within 10 seconds and SHALL return an IngestResult indicating an upstream failure identifying the Explore_API as the source, without creating an Image record.
7. IF the Explore_API request fails to complete or returns a non-success HTTP status, THEN THE Ingest_Lambda SHALL return an IngestResult indicating an upstream failure identifying the Explore_API as the source, and SHALL NOT create an Image record.
8. IF the Explore_API returns a success status but its result set contains zero snapshots for the requested feed, THEN THE Ingest_Lambda SHALL return an IngestResult indicating a skip with a reason identifying that no snapshot was available, and SHALL NOT create an Image record.
9. IF the Explore_API response cannot be parsed or is missing a required snapshot field (snapshot URL or `created_at` timestamp), THEN THE Ingest_Lambda SHALL return an IngestResult indicating a malformed upstream response, and SHALL NOT create an Image record.

---

### Requirement 2: Freshness Check

**User Story:** As an admin, I want stale snapshots to be skipped automatically, so that the archive is not polluted with images that are too old to be useful.

#### Acceptance Criteria

1. THE Ingest_Lambda SHALL determine the Freshness_Threshold by reading the environment variable `INGEST_MAX_AGE_MINUTES` and parsing it as a base-10 integer number of minutes.
2. IF the environment variable `INGEST_MAX_AGE_MINUTES` is unset, empty, or does not parse to an integer greater than or equal to 1, THEN THE Ingest_Lambda SHALL use a Freshness_Threshold of 10 minutes.
3. WHEN a snapshot's age — computed as the current time in milliseconds minus the snapshot `created_at` timestamp in milliseconds — is greater than the Freshness_Threshold converted to milliseconds (minutes multiplied by 60,000), THE Ingest_Lambda SHALL return an IngestResult indicating a skip with reason "Image too old" and SHALL NOT download, upload, or create an Image record for that snapshot.
4. WHEN a snapshot's age is less than or equal to the Freshness_Threshold expressed in milliseconds, THE Ingest_Lambda SHALL proceed to the idempotency check for that snapshot.
5. IF a snapshot's `created_at` timestamp is absent or cannot be parsed into a valid date-time value, THEN THE Ingest_Lambda SHALL return an IngestResult indicating a skip with a reason identifying an invalid or missing timestamp and SHALL NOT download, upload, or create an Image record for that snapshot.

---

### Requirement 3: Idempotency Check

**User Story:** As an admin, I want re-triggering ingestion for an already-stored snapshot to be a no-op, so that duplicate Image records are never created.

#### Acceptance Criteria

1. WHEN a snapshot has passed the freshness check, THE Ingest_Lambda SHALL query AppSync for an existing Image record whose `url` is a case-sensitive exact match of the snapshot URL, and SHALL perform this query before downloading or uploading the snapshot.
2. IF the idempotency query returns one or more Image records whose `url` is a case-sensitive exact match of the snapshot URL, THEN THE Ingest_Lambda SHALL return an IngestResult indicating a skip with reason "Image already exists" that includes the id of the matched Image record, and SHALL NOT download, upload, or create a duplicate Image record.
3. WHEN the idempotency query returns zero Image records with a case-sensitive exact match of the snapshot URL, THE Ingest_Lambda SHALL proceed to download and store the snapshot.
4. IF the idempotency query returns more than one Image record matching the snapshot URL, THEN THE Ingest_Lambda SHALL return an IngestResult indicating a skip with reason "Image already exists" that includes the id of the first matched record, and SHALL NOT download, upload, or create a duplicate Image record.
5. IF the idempotency query against AppSync fails to return a result within 10 seconds or returns an error, THEN THE Ingest_Lambda SHALL return an IngestResult indicating an internal failure with an indication that the idempotency check could not be completed, and SHALL NOT download, upload, or create an Image record.

---

### Requirement 4: Download, Store, and Record the Snapshot

**User Story:** As an admin, I want a fresh, new snapshot downloaded, stored in S3, and recorded in the database, so that it becomes a browsable image with a known S3 location.

#### Acceptance Criteria

1. WHEN a snapshot has passed the freshness and idempotency checks, THE Ingest_Lambda SHALL download the snapshot JPEG from the snapshot URL within a download timeout of 30 seconds.
2. IF the snapshot JPEG download fails to complete, exceeds the 30-second download timeout, or returns a non-success HTTP status, THEN THE Ingest_Lambda SHALL return an IngestResult indicating an upstream download failure, and SHALL NOT upload to S3 or create an Image record.
3. IF the downloaded response contains zero bytes or is not a JPEG image, THEN THE Ingest_Lambda SHALL return an IngestResult indicating an invalid-payload download failure, and SHALL NOT upload to S3 or create an Image record.
4. WHEN the snapshot JPEG has been downloaded and validated as a non-empty JPEG, THE Ingest_Lambda SHALL upload the image bytes to Amazon S3 under a key beginning with the `public/` prefix and uniquely derived from the snapshot URL so that the same snapshot resolves to the same key.
5. IF the S3 upload fails, THEN THE Ingest_Lambda SHALL return an IngestResult indicating a storage failure, and SHALL NOT create an Image record.
6. WHEN the S3 upload succeeds, THE Ingest_Lambda SHALL create an Image record in AppSync populated with the snapshot `url`, the resolved image `date`, the S3 object key as `s3Key`, and the originating `camFeed`.
7. WHERE Ingest_Core received a `date` input, THE Ingest_Lambda SHALL record that `date` as the Image `date`; otherwise THE Ingest_Lambda SHALL record the snapshot `created_at` timestamp as the Image `date`.
8. IF no `date` input was received and the snapshot `created_at` timestamp is absent or cannot be parsed as a valid timestamp, THEN THE Ingest_Lambda SHALL return an IngestResult indicating a validation failure, and SHALL NOT create an Image record.
9. IF the AppSync Image creation fails after a successful S3 upload, THEN THE Ingest_Lambda SHALL return an IngestResult indicating an internal failure identifying that the image was stored but not recorded.
10. WHEN the Image record is created successfully, THE Ingest_Lambda SHALL return an IngestResult indicating success that includes the new Image id.

---

### Requirement 5: Invocation-Agnostic Handler Architecture

**User Story:** As a developer, I want the ingestion business logic separated from the invocation mechanism, so that the same logic can be driven by API Gateway now and by other triggers (such as scheduling) later without rewriting it.

#### Acceptance Criteria

1. THE Ingest_Lambda SHALL implement its business logic as the Ingest_Core function with the signature `ingestImage({ feed, url?, date? }): Promise<IngestResult>`.
2. THE Ingest_Core function SHALL NOT read fields from any raw invocation event shape, and SHALL operate only on the normalized `{ feed, url?, date? }` input.
3. WHEN the Event_Adapter receives an invocation event, THE Event_Adapter SHALL parse that event into the normalized `{ feed, url?, date? }` input, and THE Event_Adapter SHALL be the only component that reads the raw event shape.
4. IF the Event_Adapter cannot extract a `feed` value from the incoming event, or the extracted `feed` is not one of the five defined CamFeed codes (BF, RF, BFL, KRV, RW), THEN THE Ingest_Lambda SHALL return a client input error outcome indicating the invalid feed and SHALL NOT invoke Ingest_Core.
5. IF the Event_Adapter extracts a `url` or `date` value that is present but not a non-empty string, THEN THE Ingest_Lambda SHALL return a client input error outcome indicating the invalid field and SHALL NOT invoke Ingest_Core.
6. THE Ingest_Core function SHALL return every outcome — success, skip, upstream failure, and internal failure — as an IngestResult value rather than by throwing an unhandled exception.
7. THE IngestResult value SHALL carry a discriminator field identifying the outcome as exactly one of success, skip, upstream-failure, or internal-failure, so that each outcome is distinguishable without inspecting other fields.
8. IF Ingest_Core encounters an internal error during processing, THEN THE Ingest_Core function SHALL catch that error and return an IngestResult with the internal-failure discriminator and a reason describing the failure, rather than propagating the error to the caller.

---

### Requirement 6: Expose Ingestion via an API Gateway REST Endpoint

**User Story:** As an admin and as an external integrator, I want to trigger ingestion over HTTP through a single, controlled endpoint, so that both the admin UI and external systems can submit snapshots.

#### Acceptance Criteria

1. THE Ingestion_System SHALL define the Ingest_Endpoint as `POST /ingest` on an Amazon API Gateway REST API using a CDK construct declared in `amplify/backend.ts`.
2. THE Ingest_Endpoint SHALL accept a JSON request body containing a required `feed` field whose value is one of the five valid CamFeed codes (BF, RF, BFL, KRV, RW), an optional `url` field containing an absolute HTTP(S) URL, and an optional `date` field containing an ISO 8601 datetime string.
3. WHEN a request is received on the Ingest_Endpoint, THE Event_Adapter SHALL parse the JSON body into the normalized Ingest_Core input and invoke Ingest_Core.
4. WHEN Ingest_Core returns a success IngestResult, THE Ingest_Endpoint SHALL respond with HTTP status 200 and a JSON body containing the new Image id.
5. WHEN Ingest_Core returns a skip IngestResult, THE Ingest_Endpoint SHALL respond with HTTP status 200 and a JSON body containing the machine-readable skip reason.
6. IF the request body is absent, is not valid JSON, omits a `feed` value, provides a `feed` value that is not one of the five valid CamFeed codes, or provides a `url` or `date` value that fails its format constraint, THEN THE Ingest_Endpoint SHALL respond with HTTP status 400 and a JSON body describing the input error without invoking Ingest_Core.
7. IF Ingest_Core returns an upstream failure IngestResult attributable to the Explore_API or S3, THEN THE Ingest_Endpoint SHALL respond with HTTP status 502 and a JSON body describing the upstream failure.
8. IF Ingest_Core returns an internal failure IngestResult, THEN THE Ingest_Endpoint SHALL respond with HTTP status 500 and a JSON body describing the failure.
9. THE Ingest_Endpoint SHALL return every response as JSON with an HTTP status code consistent with the IngestResult outcome.

---

### Requirement 7: Dual Authorization on the Ingestion Endpoint

**User Story:** As a site operator, I want the ingestion endpoint protected by both admin authentication and revocable, rate-limited API keys, so that the admin UI and external callers each have appropriate, controlled access.

#### Acceptance Criteria

1. WHEN a request to THE Ingest_Endpoint presents a valid, unexpired Cognito User Pool access token whose `cognito:groups` claim includes `admin`, THE Ingest_Endpoint SHALL authorize the request via the Admin_Authorizer and invoke Ingest_Core.
2. WHEN a request to THE Ingest_Endpoint presents a valid API Gateway API key bound to the Usage_Plan and within all Usage_Plan limits, THE Ingest_Endpoint SHALL authorize the request via the ApiKey_Authorizer and invoke Ingest_Core.
3. IF a request to THE Ingest_Endpoint presents no credential, an expired Cognito access token, a Cognito access token whose `cognito:groups` claim does not include `admin`, or an unrecognized API key, THEN THE Ingest_Endpoint SHALL reject the request with an HTTP 401 status when authentication is absent or invalid or an HTTP 403 status when authentication is valid but not authorized, SHALL NOT invoke Ingest_Core, and SHALL return a response body indicating the authorization failure.
4. THE Usage_Plan SHALL enforce, on requests authorized by the ApiKey_Authorizer, a steady-state request rate limit expressed in requests per second, a burst limit expressed as a maximum number of concurrent excess requests, and a quota expressed as a maximum number of requests per fixed time period, with concrete values set at deployment configuration time.
5. IF a request authorized by the ApiKey_Authorizer exceeds the configured Usage_Plan rate, burst, or quota limit, THEN THE Ingest_Endpoint SHALL reject the request with an HTTP 429 status, SHALL NOT invoke Ingest_Core, and SHALL return a response body indicating the rate or quota limit was exceeded.
6. WHEN an individual API key is revoked, THE Ingest_Endpoint SHALL reject all subsequent requests presenting that key with an HTTP 403 status and SHALL continue to authorize requests presenting other valid, non-revoked keys bound to the Usage_Plan.
7. WHEN a cross-origin request to THE Ingest_Endpoint originates from the single configured admin UI origin, THE Ingest_Endpoint SHALL return a cross-origin allowance naming exactly that origin.
8. IF a cross-origin request to THE Ingest_Endpoint originates from any origin other than the configured admin UI origin, THEN THE Ingest_Endpoint SHALL NOT return a cross-origin allowance for that origin, and SHALL NOT return a wildcard (`*`) cross-origin allowance under any circumstances.

---

### Requirement 8: Trigger Object Detection on New Images

**User Story:** As an admin, I want AI detection to run automatically whenever a new image is recorded, so that bounding boxes are available without a manual step.

#### Acceptance Criteria

1. THE Detect_Lambda SHALL be subscribed to the DynamoDB Stream on the Image table.
2. WHEN the Detect_Lambda receives a stream record whose event type is `INSERT` of an Image, THE Detect_Lambda SHALL process that Image for detection.
3. WHEN the Detect_Lambda receives a stream record whose event type is `MODIFY` or `REMOVE` of an Image, THE Detect_Lambda SHALL ignore that record and SHALL NOT invoke detection for it.
4. WHEN the Detect_Lambda processes an inserted Image, THE Detect_Lambda SHALL read the `s3Key` value from that Image record and pass it to Detect_Core.
5. IF the Detect_Lambda processes an inserted Image whose `s3Key` is absent, empty, or not a string, THEN THE Detect_Lambda SHALL skip detection for that record, record a processing error indicating the missing or invalid `s3Key`, and continue processing the remaining records in the batch.
6. WHEN the Detect_Lambda receives a stream batch containing more than one record, THE Detect_Lambda SHALL evaluate each record independently against criteria 2 through 5.
7. IF Detect_Core returns an error or does not complete within a 30-second processing timeout for an inserted Image, THEN THE Detect_Lambda SHALL record a detection error identifying the affected Image and SHALL leave the Image record unmodified.

---

### Requirement 9: Run Detection and Store All Detected Objects

**User Story:** As an admin, I want every detected bounding box saved regardless of its label, so that misclassified bears are preserved for later review and correction rather than discarded.

#### Acceptance Criteria

1. WHEN Detect_Core is invoked with an `s3Key`, THE Detect_Lambda SHALL run detection against the stored image using a minimum confidence of 50 on a 0-to-100 scale.
2. THE Detect_Lambda SHALL create one Object record for each detection instance that has a bounding box, across all detected labels, without filtering by label.
3. WHEN the Detect_Lambda creates an Object record, THE Detect_Lambda SHALL populate it with the detection `label`, the detection `confidence`, the owning `imageId`, and the bounding box `width`, `height`, `left`, and `top`.
4. THE Detect_Lambda SHALL store each bounding box coordinate (`width`, `height`, `left`, `top`) as a fractional value in the range 0.0 to 1.0 exactly as returned by the detection backend, without rescaling to pixel units.
5. WHEN a detected label has no bounding box instances, THE Detect_Lambda SHALL create no Object record for that label.
6. WHEN detection returns zero bounding box instances for the image, THE Detect_Lambda SHALL create zero Object records and SHALL set the provisional Image `bearCount` to 0.
7. IF detection fails for an image, THEN THE Detect_Lambda SHALL log the failure and SHALL NOT create partial or malformed Object records for that image.
8. IF the creation of an individual Object record fails, THEN THE Detect_Lambda SHALL log the failure identifying the affected Image and the detection instance, SHALL leave already-created Object records in place, and SHALL continue attempting to create the remaining Object records.
9. WHEN the Detect_Lambda has attempted creation of every Object record for an image, THE Detect_Lambda SHALL complete processing of that image and report an outcome distinguishing whether all records were created or only some were created.

---

### Requirement 10: Set Provisional Bear Count

**User Story:** As a developer, I want detection to set an initial bear count on the image, so that the gallery has a usable count before consensus is computed.

#### Acceptance Criteria

1. WHEN the Detect_Lambda has created the Object records for an inserted Image, THE Detect_Lambda SHALL set the provisional Image `bearCount` to the number of successfully created, persisted Object records whose `label` exactly equals the string "Bear".
2. THE Detect_Lambda SHALL NOT write to the Image `bearList` field or to any Object consensus field (`consensusName`, `consensusConfidence`, `totalVotes`).
3. IF updating the provisional Image `bearCount` fails, THEN THE Detect_Lambda SHALL log the failure identifying the affected Image, SHALL leave the prior `bearCount` value unchanged rather than partially written, and SHALL leave the already-created Object records in place.

---

### Requirement 11: Swappable Detection Backend

**User Story:** As a developer, I want the detection model isolated behind one function, so that the underlying model can be replaced later without changing the rest of the detection handler.

#### Acceptance Criteria

1. THE Detect_Lambda SHALL isolate the detection backend call within the single Detect_Core function `detectObjects(s3Key)`.
2. THE Detect_Core function SHALL return a list of results conforming to the DetectionResult contract — each carrying a label, a confidence in the range 0 to 100, and a list of zero or more instances each carrying `width`, `height`, `left`, and `top` as 0.0–1.0 fractions — regardless of which detection backend produces them.
3. THE Detect_Lambda SHALL consume only the DetectionResult contract when creating Object records, and SHALL NOT reference any detection-backend-specific response shape outside the Detect_Core function.
4. WHEN the detection backend returns a result that does not conform to the DetectionResult contract, THE Detect_Core function SHALL exclude the non-conforming result rather than passing it through to the handler.
5. IF the detection backend call fails, THEN THE Detect_Core function SHALL surface the failure to the Detect_Lambda rather than returning fabricated or partial results.

---

### Requirement 12: Admin Ingestion UI

**User Story:** As an admin, I want a page where I can pick a feed and pull the latest image, or browse and save specific snapshots, so that I can ingest images on demand.

#### Acceptance Criteria

1. THE Admin_Ingest_Page SHALL provide a control to select a single CamFeed from exactly the five defined feed codes: BF, RF, BFL, KRV, RW.
2. WHEN an admin selects a feed and activates the fetch-latest action, THE Admin_Ingest_Page SHALL send a `POST` request to the Ingest_Endpoint with a JSON body containing the selected `feed` and no `url`.
3. WHEN an admin selects a feed and opens the browse view, THE Admin_Ingest_Page SHALL request and display a list of up to 20 most-recent snapshots for the selected feed, each presented as a selectable item.
4. WHEN an admin saves a specific snapshot from the browse view, THE Admin_Ingest_Page SHALL send a `POST` request to the Ingest_Endpoint with a JSON body containing the selected `feed` and the chosen snapshot `url`.
5. WHEN the admin triggers an ingestion request, THE Admin_Ingest_Page SHALL include the signed-in admin's Cognito access token on the request so it is authorized by the Admin_Authorizer.
6. WHILE an ingestion request is in progress, THE Admin_Ingest_Page SHALL display a progress indicator and SHALL present the triggering control in a disabled state that prevents a duplicate concurrent submission.
7. WHEN the Ingest_Endpoint returns any response to an in-progress ingestion request, THE Admin_Ingest_Page SHALL remove the progress indicator and restore the triggering control to an enabled state.
8. WHEN the Ingest_Endpoint responds with a success outcome, THE Admin_Ingest_Page SHALL display a confirmation that includes the new Image id.
9. WHEN the Ingest_Endpoint responds with a skip outcome, THE Admin_Ingest_Page SHALL display the human-readable skip reason.
10. IF the Ingest_Endpoint responds with a 4xx or 5xx status and a parseable structured JSON body, THEN THE Admin_Ingest_Page SHALL display an error message derived from that response body and SHALL retain the current feed selection and browse state.
11. IF an ingestion request fails to complete due to a network failure, no response, or a response body that cannot be parsed as structured JSON, THEN THE Admin_Ingest_Page SHALL display a generic error message indicating the request could not be completed and SHALL retain the current feed selection and browse state.
12. IF the browse-view snapshot list request fails or returns zero snapshots, THEN THE Admin_Ingest_Page SHALL display a message indicating no snapshots are available and SHALL leave the save-snapshot action unavailable.

---

### Requirement 13: Admin-Only Access to the Ingestion UI

**User Story:** As a site operator, I want the ingestion page restricted to admins both in the UI and at the API, so that only authorized users can add images.

#### Acceptance Criteria

1. WHEN a visitor who is not signed in requests the Admin_Ingest_Page, THE Ingestion_System SHALL deny access by redirecting the visitor to the sign-in flow without rendering any ingestion controls.
2. WHEN a signed-in user for whom isAdmin returns false requests the Admin_Ingest_Page, THE Ingestion_System SHALL deny access by rendering an access-denied response without rendering any ingestion controls.
3. WHEN the Admin_Ingest_Page evaluates admin status, THE Admin_Ingest_Page SHALL determine that status using the isAdmin helper in `src/lib/amplify/auth.ts`, which inspects the `cognito:groups` claim, and SHALL complete the evaluation within 2 seconds.
4. IF isAdmin cannot be evaluated because admin status cannot be determined, THEN THE Ingestion_System SHALL deny access to the Admin_Ingest_Page without rendering any ingestion controls.
5. THE Ingestion_System SHALL enforce admin authorization on the Ingest_Endpoint through the Admin_Authorizer independently of any UI-level access gate.
6. IF a request reaches the Ingest_Endpoint without a valid Admin_Authorizer credential and without a valid ApiKey_Authorizer credential, THEN THE Ingestion_System SHALL reject the request at the API without performing any image ingestion and SHALL return an error response indicating the request is unauthorized, regardless of any UI gating.

---

### Requirement 14: Shared Camera Feed Constants

**User Story:** As a developer, I want the explore.org endpoint and feed slug mapping defined once in a Lambda-safe module, so that the frontend and Lambda stay in sync without the Lambda importing browser dependencies.

#### Acceptance Criteria

1. THE Ingestion_System SHALL define the Cam_Feeds_Map containing exactly five entries, mapping each CamFeed code (BF, RF, BFL, KRV, RW) to a non-empty explore.org feed slug string, with no duplicate codes and no duplicate slugs.
2. THE Ingestion_System SHALL define the Explore_API endpoint as a single non-empty string value within the same module as the Cam_Feeds_Map.
3. THE Ingestion_System SHALL make the Cam_Feeds_Map and the Explore_API endpoint importable by Lambda code that imports no Next.js or browser-only dependency, such that the module loads successfully in a Node.js runtime with no browser global available.
4. THE Ingest_Lambda and the Admin_Ingest_Page SHALL both resolve each explore.org feed slug exclusively by lookup in the Cam_Feeds_Map, and no feed slug string literal SHALL appear in any module other than the one defining the Cam_Feeds_Map.
5. WHERE the set of valid CamFeed codes is referenced, THE Ingestion_System SHALL derive that set from the keys of the Cam_Feeds_Map so that the frontend and Lambda reference an identical set of five codes.
6. IF a feed code that is not a key of the Cam_Feeds_Map is used to resolve a slug, THEN THE Ingestion_System SHALL reject the lookup, return no slug, and produce an error indication identifying the unknown feed code, without returning a default or fallback slug.

---

### Requirement 15: Explore.org API Resilience

**User Story:** As a site operator, I want calls to the fragile explore.org API handled defensively, so that an upstream outage or format change produces a clear message instead of an unhandled crash.

#### Acceptance Criteria

1. WHEN the Ingest_Lambda calls the Explore_API, THE Ingest_Lambda SHALL enclose the call in error-handling that converts a connection failure, a timeout, a non-success HTTP status, or an unparseable response body into a structured IngestResult rather than an unhandled exception.
2. WHEN the Ingest_Lambda receives an Explore_API response, THE Ingest_Lambda SHALL validate that each required field (snapshot URL and `created_at` timestamp) is present and of the expected type before using it.
3. IF an Explore_API response is missing a required field or a field is of an unexpected type, THEN THE Ingest_Lambda SHALL return an IngestResult indicating a malformed upstream response identifying the missing or invalid field.
4. WHEN the Ingest_Lambda encounters an Explore_API failure or malformed response, THE Ingest_Lambda SHALL log the failure with the requested feed, the resolved endpoint, and the failure class for CloudWatch.
5. THE Ingest_Lambda SHALL NOT log any API key, Cognito token, or other credential value when logging an Explore_API failure.
6. WHEN an Explore_API failure is surfaced through the Ingest_Endpoint, THE Ingest_Endpoint SHALL return a structured JSON error body that the Admin_Ingest_Page can render as a human-readable message.
