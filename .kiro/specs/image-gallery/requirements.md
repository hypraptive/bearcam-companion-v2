# Requirements Document

## Introduction

The `image-gallery` feature is the public, no-login-required browsing experience for BearCam Companion v2. It lets any anonymous visitor browse all collected webcam snapshots in a paginated grid, filter them by date/year, camera feed, and bear presence, search by bear name or number, and open an individual image to see the full snapshot with AI-detected bounding boxes overlaid — each labeled with its crowd-sourced consensus identification and vote count. Visitors can page through adjacent images from the detail view, and the gallery preserves their active filters, search, and page/scroll position when they return from a detail page.

All data access in this feature is read-only through the public API key (anonymous access). The feature is built on the Next.js App Router, favoring Server Components for data fetching to keep mobile loads fast, with Client Components used only where interactivity (filter controls, overlay toggles) requires them. This feature consumes the data schema and project scaffolding established by the `project-setup` spec; it does not define backend resources.

## Glossary

- **Gallery_System**: The collection of Next.js App Router pages and components that implement the public image browsing experience under the `(public)` route group.
- **Gallery_Page**: The home page at `/` that renders the paginated grid of images and the filter/search controls.
- **Image_Detail_Page**: The page at `/images/[id]` that renders a single image at full size with bounding box overlays and navigation.
- **Image_Grid**: The responsive grid component on the Gallery_Page that displays image thumbnails.
- **Image_Card**: A single cell in the Image_Grid representing one Image, showing its thumbnail and summary metadata.
- **Filter_Controls**: The set of UI controls on the Gallery_Page for selecting year, camera feed, and bear-presence filters.
- **Search_Control**: The text input on the Gallery_Page used to search images by bear name or number.
- **Bounding_Box_Overlay**: The visual layer on the Image_Detail_Page that draws a rectangle over each displayed Object using its fractional coordinates.
- **Consensus_Label**: The text label attached to a Bounding_Box_Overlay showing an Object's `consensusName` and `totalVotes`.
- **Query_State**: The combined set of active filters, search term, and pagination position, encoded in the URL query string.
- **Image**: A data model record representing one webcam snapshot, with fields `url`, `date`, `s3Key`, `bearCount`, `bearList`, `camFeed`, and related `objects`.
- **Object**: A data model record representing one AI-detected bounding box within an Image, with fields `label`, `confidence`, `width`, `height`, `left`, `top`, `consensusName`, `consensusConfidence`, and `totalVotes`.
- **CamFeed**: One of the five camera feed codes — `BF` (Brooks Falls), `RF` (The Riffles), `BFL` (Brooks Falls Low), `KRV` (Lower River), `RW` (River Watch).
- **Public_API_Key**: The AppSync public API key authorization mode that grants anonymous read access to Images, Objects, and Identifications.
- **Amplify_Helpers**: The typed AppSync query helper functions located in `src/lib/amplify/` through which all data access is performed.
- **Page_Size**: The fixed maximum number of Image_Cards displayed per page of the Image_Grid; the concrete value is 24.
- **Bear_Object**: An Object whose `label` equals `"Bear"`.

---

## Requirements

### Requirement 1: Paginated Image Grid

**User Story:** As an anonymous visitor, I want to browse all collected webcam images in a paginated grid, so that I can explore the archive without being overwhelmed by one enormous page.

#### Acceptance Criteria

1. WHEN the Gallery_Page is requested without any Query_State, THE Gallery_System SHALL render the first page of Images in the Image_Grid ordered by `date` descending, with ties broken by Image `id` descending.
2. THE Gallery_System SHALL display at most 24 Image_Cards per page of the Image_Grid.
3. THE Gallery_System SHALL render each Image_Card using the Next.js `<Image>` component for the thumbnail and the Next.js `<Link>` component for navigation to the Image_Detail_Page.
4. THE Gallery_System SHALL display on each Image_Card the Image `date`, the Image `camFeed`, and the Image `bearCount`.
5. WHEN more Images exist beyond the current page, THE Gallery_System SHALL provide an enabled navigation control to advance to the next page and encode the resulting page position in the Query_State.
6. WHILE the current page is the last available page, THE Gallery_System SHALL disable the next-page navigation control such that activating it produces no navigation.
7. WHILE the current page is not the first page, THE Gallery_System SHALL provide a navigation control to return to the previous page.
8. WHILE Images are being retrieved for the Image_Grid, THE Gallery_System SHALL display a loading indicator.
9. WHEN a page beyond the available Images is requested, THE Gallery_System SHALL render an empty-state message indicating no images are available for that page.
10. WHEN no Images match the current Query_State, THE Gallery_System SHALL render an empty-state message indicating no images match the active filters.
11. IF the query to retrieve Images fails, THEN THE Gallery_System SHALL render an error-state message and preserve the active Query_State so the retrieval can be retried.

---

### Requirement 2: Filter by Year, Camera Feed, and Bear Presence

**User Story:** As an anonymous visitor, I want to filter images by year, camera feed, and whether bears are present, so that I can narrow the archive down to the images I care about.

#### Acceptance Criteria

1. THE Gallery_System SHALL provide a Filter_Control for selecting a single year, populated with the distinct set of calendar years (derived from `Image.date`) for which at least one Image exists, sorted in descending order.
2. IF no Images exist for any year, THEN THE Gallery_System SHALL present the year Filter_Control in an empty state containing zero selectable years and disable it from selection.
3. THE Gallery_System SHALL provide a Filter_Control for selecting a single CamFeed from exactly the five defined feed codes: BF, RF, BFL, KRV, RW.
4. THE Gallery_System SHALL provide a Filter_Control for selecting bear presence with exactly three mutually exclusive options "any", "with bears", and "without bears", defaulting to "any".
5. WHEN a year filter is active, THE Gallery_System SHALL display only Images whose `date` falls on or after 00:00:00.000 of January 1 and on or before 23:59:59.999 of December 31 of the selected calendar year, evaluated in UTC.
6. WHEN a CamFeed filter is active, THE Gallery_System SHALL display only Images whose `camFeed` exactly equals the selected feed code.
7. WHEN the bear-presence filter is set to "with bears", THE Gallery_System SHALL display only Images whose `bearCount` is greater than or equal to 1.
8. WHEN the bear-presence filter is set to "without bears", THE Gallery_System SHALL display only Images whose `bearCount` equals 0.
9. WHEN the bear-presence filter is set to "any", THE Gallery_System SHALL display Images regardless of `bearCount` value.
10. WHEN two or more Filter_Controls are active, THE Gallery_System SHALL display only Images that satisfy every active filter combined with logical AND.
11. IF no Images satisfy every active filter, THEN THE Gallery_System SHALL display an empty Image_Grid with a message indicating that no images match the active filters, while retaining the active filter selections.
12. WHEN a filter selection changes, THE Gallery_System SHALL reset the pagination position to the first page and update the Query_State in the URL query string to reflect the active filters, search, and pagination.
13. WHEN a visitor activates the clear control, THE Gallery_System SHALL remove all active filters and search, reset the bear-presence filter to "any", and return the Image_Grid to the unfiltered first page.

---

### Requirement 3: Search by Bear Name or Number

**User Story:** As an anonymous visitor, I want to search for images containing a specific bear by name or number, so that I can follow a particular bear across the archive.

#### Acceptance Criteria

1. THE Gallery_System SHALL provide a Search_Control that accepts a free-text search term of 1 to 100 characters, with leading and trailing whitespace trimmed before processing.
2. WHEN a search term is submitted, THE Gallery_System SHALL display only Images where at least one comma-delimited token in `bearList` contains the trimmed search term as a case-insensitive substring, so that matching occurs within individual bear names and never spans across the comma separator.
3. WHEN a search term is submitted together with one or more active filters, THE Gallery_System SHALL display only Images that satisfy both the search term and every active filter.
4. WHEN the search term changes to a new non-empty value, THE Gallery_System SHALL reset the pagination position to the first page and update the Query_State to reflect the trimmed search term.
5. WHEN a submitted search term matches no Images, THE Gallery_System SHALL render an empty-state message indicating that no images match the search term, and display zero Image results.
6. WHEN the Search_Control is cleared, THE Gallery_System SHALL remove the search term from the Query_State and display Images according to the remaining active filters.
7. IF a submitted search term is empty or consists solely of whitespace after trimming, THEN THE Gallery_System SHALL treat the search as cleared, remove the search term from the Query_State, and display Images according to the remaining active filters.
8. IF a submitted search term exceeds 100 characters, THEN THE Gallery_System SHALL reject the input, retain the previously applied Query_State unchanged, and present an indication that the search term exceeds the maximum allowed length.

---

### Requirement 4: Image Detail View with Bounding Box Overlays

**User Story:** As an anonymous visitor, I want to open an image and see the full snapshot with each detected bear boxed and labeled, so that I can see which bears were identified and how confident the crowd was.

#### Acceptance Criteria

1. WHEN an Image_Detail_Page is requested with an Image id that matches an existing Image record, THE Gallery_System SHALL render the full Image using the Next.js `<Image>` component.
2. THE Gallery_System SHALL render one Bounding_Box_Overlay for each displayed Bear_Object, positioning each overlay's left edge at (`left` × rendered image width), top edge at (`top` × rendered image height), width at (`width` × rendered image width), and height at (`height` × rendered image height), where `left`, `top`, `width`, and `height` are fractional values in the range 0.0 to 1.0.
3. THE Gallery_System SHALL display as Bounding_Box_Overlays only Objects whose `label` equals the exact string "Bear" by default on the Image_Detail_Page, and SHALL display zero Bounding_Box_Overlays when the Image has no Bear_Objects.
4. WHEN a Bear_Object has a non-null `consensusName`, THE Gallery_System SHALL render a Consensus_Label on that Object's Bounding_Box_Overlay displaying the `consensusName` text and the `totalVotes` integer count.
5. IF a Bear_Object has a null `consensusName`, THEN THE Gallery_System SHALL render that Object's Consensus_Label with placeholder text indicating no identification has been submitted, and SHALL display a `totalVotes` value of 0.
6. IF an Image_Detail_Page is requested with an id that matches no Image record, THEN THE Gallery_System SHALL render a not-found response and SHALL render zero Bounding_Box_Overlays.
7. THE Gallery_System SHALL display the Image `date` and the Image `camFeed` value on the Image_Detail_Page.
8. IF the Image record referenced by a valid id cannot be retrieved due to a data-source failure, THEN THE Gallery_System SHALL render an error state indicating the image could not be loaded and SHALL render zero Bounding_Box_Overlays.

---

### Requirement 5: Previous/Next Navigation Between Images

**User Story:** As an anonymous visitor viewing one image, I want to move to the adjacent images without going back to the grid, so that I can review a sequence of snapshots quickly.

#### Acceptance Criteria

1. THE Gallery_System SHALL display a next-image navigation control and a previous-image navigation control on the Image_Detail_Page.
2. WHEN the next-image control is activated, THE Gallery_System SHALL load the Image_Detail_Page of the Image immediately adjacent in the newer direction of the active ordering, determined using the same ordering and active Query_State that produced the originating Image_Grid.
3. WHEN the previous-image control is activated, THE Gallery_System SHALL load the Image_Detail_Page of the Image immediately adjacent in the older direction of the active ordering, determined using the same ordering and active Query_State that produced the originating Image_Grid.
4. WHILE the current Image is the newest Image in the active ordering, THE Gallery_System SHALL disable the next-image control such that activating it produces no navigation and triggers no data request.
5. WHILE the current Image is the oldest Image in the active ordering, THE Gallery_System SHALL disable the previous-image control such that activating it produces no navigation and triggers no data request.
6. WHEN the next-image or previous-image control is activated, THE Gallery_System SHALL carry forward the active Query_State unchanged so that returning to the Gallery_Page restores identical filters, search terms, and pagination position.
7. IF the adjacent Image cannot be retrieved or the retrieval fails, THEN THE Gallery_System SHALL retain the current Image_Detail_Page unchanged and display an indication that the adjacent Image could not be loaded.

---

### Requirement 6: Persistent Filter and Navigation State

**User Story:** As an anonymous visitor, I want my filters, search, and page position preserved when I open an image and come back, so that I don't lose my place while browsing.

#### Acceptance Criteria

1. THE Gallery_System SHALL encode the active filters, search term (0 to 100 characters), and pagination position (page number from 1 to the total available page count) as the Query_State in the Gallery_Page URL query string.
2. WHEN a visitor navigates from the Gallery_Page to an Image_Detail_Page, THE Gallery_System SHALL carry the complete Query_State forward in the navigation target so it is available for restoration on return.
3. WHEN a visitor returns from an Image_Detail_Page to the Gallery_Page, THE Gallery_System SHALL render the Image_Grid with the filters, search term, and pagination position held in the Query_State such that the displayed images match those that would result from applying that Query_State directly.
4. WHEN a Gallery_Page URL containing a Query_State is loaded directly, THE Gallery_System SHALL apply the encoded filters, search term, and pagination position to the rendered Image_Grid such that the displayed images match that Query_State.
5. IF a loaded Query_State is malformed or contains an unrecognized filter value or a search term exceeding 100 characters, THEN THE Gallery_System SHALL render the Image_Grid using the default unfiltered state (no filters, empty search term, page 1) and SHALL not display an error that blocks browsing.
6. IF a loaded Query_State specifies a pagination position greater than the total available page count or less than 1, THEN THE Gallery_System SHALL clamp the pagination position to the nearest valid page (1 or the last available page) and render the Image_Grid at that clamped position.
7. WHEN a visitor returns to the Gallery_Page from an Image_Detail_Page, THE Gallery_System SHALL restore the vertical scroll position of the Image_Grid to approximately its value at the time of departure.

---

### Requirement 7: Read-Only Public Data Access

**User Story:** As a site operator, I want the gallery to read data anonymously through the public API key, so that anyone can browse without logging in and no write operations are exposed.

#### Acceptance Criteria

1. THE Gallery_System SHALL perform all AppSync data access through the Amplify_Helpers in `src/lib/amplify/`.
2. THE Gallery_System SHALL perform all data access using the Public_API_Key authorization mode.
3. THE Gallery_System SHALL issue only read operations (query/list) against the Images, Objects, and Identifications models, and SHALL NOT issue any create, update, or delete operations against them.
4. THE Gallery_System SHALL NOT write to any Image, Object, or Identification field, including the denormalized `bearCount`, `bearList`, `consensusName`, `consensusConfidence`, and `totalVotes` fields.
5. WHERE a data fetch is performed to render initial page content, THE Gallery_System SHALL perform that fetch in a Server Component.
6. IF an AppSync read operation returns an error, THEN THE Gallery_System SHALL render an error state indicating that images could not be loaded, SHALL NOT render partial or stale image content, and SHALL present a retry affordance.
7. IF an AppSync read operation completes successfully but returns zero records, THEN THE Gallery_System SHALL render an empty state indicating that no images are available, distinct from the error state.

---

### Requirement 8: Responsive, Fast Mobile Rendering

**User Story:** As an anonymous visitor on a phone, I want the gallery to load fast and lay out cleanly on a small screen, so that I can browse comfortably on mobile.

#### Acceptance Criteria

1. WHEN the Image_Grid is rendered, THE Gallery_System SHALL apply a mobile-first responsive layout that displays 1 column below the `sm` breakpoint, 2 columns at the `sm` breakpoint, 3 columns at the `md` breakpoint, and 4 columns at the `lg` breakpoint.
2. WHEN the Gallery_Page or Image_Detail_Page is rendered at a viewport width of 320px (the minimum supported width), THE Gallery_System SHALL lay out the Image_Grid with no horizontal scrolling and no content overflow beyond the viewport width.
3. THE Gallery_System SHALL implement each page as a Server Component except where interactivity requires a Client Component, in which case the `'use client'` boundary SHALL be scoped to the interactive controls only and SHALL NOT be applied to the page root.
4. WHEN an Image thumbnail or full Image is rendered, THE Gallery_System SHALL render it through the Next.js `<Image>` component with a declared `sizes` attribute matching the responsive column layout defined in criterion 1.
5. WHEN internal navigation between the Gallery_Page and Image_Detail_Page is rendered, THE Gallery_System SHALL render it through the Next.js `<Link>` component.
6. WHEN the Gallery_Page is requested on a mobile viewport, THE Gallery_System SHALL render the initial above-the-fold Image_Grid content within 3 seconds on a simulated mobile network and device profile.
