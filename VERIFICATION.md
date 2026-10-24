# Dogear verification

Verified locally on 2026-10-24 with Node 22.22.2, Chromium, Docker Desktop, and project-pinned Supabase CLI 2.122.0.

## Collection icon selection

Added a Collection icon dropdown with Layers (the existing default) plus Music, TV, Book, Speech, Paw print, User, Grinning face, Slightly frowning face, Star and Brush. It uses labelled icon previews, native radio selection and touch targets consistent with the colour controls. Selection closes the menu and restores focus. Existing icon colour settings apply to the selected icon. Creation, Edit collection and move-to-new-collection support the choice; library cards, the saved-entry picker and collection details render the saved icon.

Applied additive migration `202610240009_collection_icons.sql` locally and regenerated database types. The private collection column defaults to layers and constrains icon IDs to the supported list. The existing authenticated edit RPC validates icon choices atomically while retaining ownership, lock order, colour validation and partial-edit behaviour. Existing save/move wrappers and public quotation projection remain compatible. Apply pending migrations to hosted Supabase before deploying this frontend; no hosted changes were made here.

Validation: 79 unit tests and 171 real database checks (78 existing plus 93 collection checks) passed. Database coverage includes default icons, every supported icon ID, invalid value/type rejection and rollback, cross-user denial, creating icons during a move and preserving icons during colour-only edits. Focused root desktop/mobile checks passed for Layers defaults, Music creation, Star editing, TV creation during moves, reload persistence and existing colour workflows. Lint, typecheck, formatting and production root/project builds passed. All 22 project-path desktop/mobile browser regression checks passed, including axe checks on the expanded icon menu. Desktop/mobile icon menu screenshots were inspected.

## Compact colour dropdowns

Each collection appearance field now shows a closed dropdown with its current colour chip and name. Opening a dropdown reveals the existing 12 swatches; only one palette is open at a time. Choosing a swatch, including the current choice, closes the palette and restores trigger focus. Escape and outside clicks close it. Panels expand within the form to avoid clipping inside mobile dialogs. Closing on a completed outside click avoids shifting subsequent controls during a tap.

Validation: 79 unit tests, lint, typecheck, formatting and production build checks passed. Focused desktop/mobile browser checks cover initially collapsed palettes, 12 options when open, 44 px swatches, Escape/focus return, outside clicks, switching dropdowns, persistence after reload, collection workflows and accessibility. No database change was needed.

## Mobile collection colour swatches

Replaced native colour inputs with 12 coordinated, named swatches for each of background, icon, text and border. Native radio groups provide keyboard selection and accessible names; 44 px targets, focus rings and a checkmark make selection clear on mobile. Four-column grids fit narrow screens. Previously saved custom colours remain intact until the corresponding field is changed. No database schema or persistence changes were needed.

Validation: 79 unit tests, lint, typecheck, formatting and a production root build passed. Focused desktop/mobile browser checks passed for 12 options per group, minimum 44 px tap targets, absence of native colour inputs, saved palette choices after reload, creation/edit/move workflows and accessibility. The mobile swatch layout was inspected. Database tests were not repeated for this UI-only change.

## Collection names and colours

Collection thumbnails now show the collection name with a single-line ellipsis, while the full name remains beside/below the thumbnail. Books and collections share thumbnail dimensions. Creation, including creation during a quote move, supports separate background, icon, text and border colour controls. Edit collection updates name and colours together with a preview. Saved colours flow through canonical caches to library, picker and detail views and persist after reload. Existing collections retain their default palette.

Applied additive migration `202610240008_collection_colours.sql` locally and regenerated database types. Hex colours are constrained on private collection rows and validated by authenticated save/edit/move wrappers. Invalid appearance rolls back creation or rename. Existing RPC signatures remain compatible; public quotation projection is unchanged. No hosted migration/deployment was performed. Apply pending migrations before deploying this frontend.

Validation: 79 unit/component/service tests and 148 database checks (78 existing plus 70 collection checks) passed. New database cases cover persistence, partial edits, invalid keys/types/colours, rollback, styled moves and ownership/anonymous denial. Root desktop/mobile browser checks passed; project-path checks passed after fixing a test to wait for the edit dialog to close before measuring the thumbnail. Final focused browser checks verify independent icon/text colours and long-name truncation. Desktop/mobile screenshots were inspected. Lint, typecheck, formatting and root/project production builds passed; the existing Vite bundle-size advisory remains.

## Collections

Implemented user-owned collections alongside books, with a third single-open picker panel, optional quote author/source credits, private names, collection detail/rename flows, and moves between books and collections. Creation and moves can create a collection only with its first quote. Moving or deleting the final quote removes the empty source entry. Moves preserve quote IDs, creation dates, text, private notes and references; book attribution becomes explicit credits rather than changing to destination metadata. Users can clear credits, and changed sources clear publication years.

Applied additive migration `202610240007_collections.sql` locally without resetting data, and regenerated database types. Every quote has exactly one parent with a composite ownership FK. New mutation RPCs and legacy book saves/deletes share a per-user transaction lock before existing book locks. RLS and restricted execution enforce ownership. The public sampler still exposes exactly four fields, with custom source using the legacy `book_title` alias; collection names and private fields are excluded. The authenticated hero includes collection navigation independently of public credits.

The unified library RPC returns compact book summaries and collections. Existing user-scoped freshness, intent prefetch, cancellation and canonical mutation caching extend to collection details and quotes. Rename updates private titles; moves update both parents and authoritative counts, with targeted background reconciliation. No Open Library request is needed for collection workflows.

Validation: 79 unit/component/service tests and 133 real database checks (78 existing plus 55 collection checks) passed. Database coverage includes ownership, anonymous denial, direct-write denial, exactly-one-parent constraints, rollback, duplicate names, last-quote cleanup, opposing concurrent moves, rename collisions and save/delete races. Desktop/mobile production browser checks cover creation, reuse, rename, moving/clearing credits, reload persistence, original attribution, private notes, identity preservation and existing auth/performance regressions. All 22 browser checks passed at the root path and all 22 passed at the project path. Axe checks passed on collection details and the move dialog, and desktop/mobile screenshots were inspected. Lint, typecheck, formatting, production builds and git diff whitespace checks passed. Vite reports the main application bundle above its 500 kB advisory threshold; route details remain lazy and navigation performance regressions pass.

Hosted migration/deployment has not been performed. Apply migration 007 to the hosted Supabase project before deploying this frontend; review using `npx supabase db push --dry-run`, then apply using `npx supabase db push`.

## Library and quote navigation performance

Implemented cached book summaries with independent details/quote rendering; 60-second full-detail and 30-second library/quote/hero freshness; compact library projections without descriptions/ISBNs; on-demand saved metadata; parallel hero/library reads; retained hero selection; intent-based book code/data prefetching; and lazy/async grid/picker cover images with explicit dimensions. The main opened-book cover remains eager.

Applied additive migration `202610240006_quote_results.sql` locally and regenerated TypeScript database types. New invoker-rights save/delete response wrappers call the existing RPCs, preserving their validation, ownership checks and transaction locks. They return canonical saved records and authoritative remaining counts. Frontend caches update only after server success, retaining canonical catalog metadata. Incomplete quote lists and library reconciliation refresh in the background without delaying dialogs/navigation; edits and complete confirmed quote lists avoid unnecessary immediate reads. Original RPCs remain available for older clients. Hosted deployment must apply the migration before publishing this frontend; no hosted migration or publication was performed here.

Validation includes real database checks for wrapper results, immutable catalog metadata, anonymous/cross-user denial, validation, and last-quote cleanup. Unit/component tests cover cached partial rendering, independent slow reads, fresh return visits, parallel hero requests, canonical save/edit/delete cache updates, non-blocking reconciliation, account scope, and deduplicated prefetches. A production desktop/mobile regression holds library, hero, detail and quote requests separately to verify request ordering, compact response fields, native image loading attributes, cached navigation without repeated reads, and editing/deleting while follow-up reads are blocked. Saved metadata retry retains typed quote text and makes no external metadata request.

Results: 76 unit/component/service tests, 78 real database checks, and all 18 desktop/mobile production browser checks at each of the root and project paths passed. Lint, typecheck, formatting, and production builds passed. Coverage also includes stale saved selections that can no longer be read, with a clear recovery action and no incomplete save.

## Header Sign in navigation

Authentication screens are now included in initial application code. Clicking the homepage header’s Sign in link no longer waits for a lazy authentication-page download. Registration and password-recovery navigation reuse that same loaded code. Form submission, session handling, and Supabase authentication are unchanged.

A production browser regression reproduced the previous delay by blocking further JavaScript requests after the homepage rendered: the Sign in screen could not open. The updated regression requires the header link to show the sign-in form while downloads remain blocked and confirms registration/reset navigation also avoids additional scripts. This addresses page-opening latency; it does not claim to change hosted authentication response times. Authentication screen code now downloads up front instead of on first use.

Validation: 66 unit/component/service tests and all 16 desktop/mobile production browser checks passed at the domain root, including navigation with further script downloads blocked, registration, recovery, sign-out, account switching, and quote saving/editing/deletion. Lint, typecheck, formatting, and root/project production builds passed. No database/API semantics changed.

## Open Library search indicator

The search field now replaces its magnifying-glass icon with a 20px spinner during debounce, queued, and active searches. A shared pending state drives the input’s busy attribute and the “Searching Open Library…” status, which remains visible after the field loses focus. Error and completed/empty-result messages remain visible, with retry still available. Normal-motion browsers rotate the spinner; reduced-motion browsers retain the static indicator and status text.

Validation: 66 unit/component/service tests and all 14 desktop/mobile production browser checks passed at the domain root. The new browser regression verifies actual transform changes during a held Open Library request, continued visibility after blur, reduced-motion behaviour, accessibility, failure cleanup, and successful retry. Lint, typecheck, formatting, and root/project production builds passed. No database/API request semantics changed.

## Add quote navigation

The Add quote editor is now included in initial application code. Its first navigation no longer depends on downloading a lazy editor chunk. The library page and book picker share a 30-second, user-scoped library cache; repeated navigation reuses a fresh result, while existing quote mutations immediately invalidate it and account changes still clear private data. Public homepage sampling and Open Library request timing are unchanged.

A production browser regression test reproduced the old delay by holding page-code downloads and new library requests: the editor heading failed to appear. With the change, both the page-level Add a quote link and top-bar Add quote link open the editor while those requests remain blocked, without requesting extra JavaScript or refetching a fresh library. This verifies the avoidable client-side wait, not a measured improvement to hosted database latency. The editor code now downloads on initial load instead of the first click.

Validation: 66 unit/component/service tests and all 12 desktop/mobile production browser checks passed at the domain root, including the blocked-download navigation regression and full quote lifecycle. Unit checks cover fresh-cache reuse, quote-mutation invalidation, cache expiry, and account-scoped separation. Lint, typecheck, formatting, and root/project production builds passed. No database schema, permissions, or authentication backend changed; database checks were not repeated for this client change.

## Loading feedback

The initial HTML now contains a branded startup indicator, visible before application JavaScript and during authentication callbacks. Shared status spinners cover session checks, initial page/database reads, homepage/personal quote loading, library selection, Open Library searches (including debounce and queue waits), selected descriptions, and pending authentication/save/edit/delete/refresh controls. A small, non-blocking activity badge tracks active TanStack Query reads and mutations, including background refetches. The app header/footer remain mounted while lazy page code loads. Existing data remains visible during background requests, write controls retain pending labels and disable duplicate submissions, and reduced-motion preferences stop spinner rotation.

The homepage quote was already fetched within its card; it does not block rendering the rest of the signed-out homepage after session resolution. This change adds visible feedback rather than claiming lower database/API latency. Sampling still requests a fresh user-added quote on each homepage visit.

Validation: 63 unit/component/service tests passed, including concurrent reads, mutation errors, cancellation, disabled/cached queries, background refreshes retaining data, session checks, and a suspended page retaining navigation. All 10 desktop/mobile production browser checks passed at the project path and all 10 passed at the domain root. They cover initial HTML with JavaScript held back, delayed Supabase quote reads, failure cleanup, delayed Open Library searches, pending quote saves, and reduced-motion/accessibility behaviour. Desktop/mobile loading screenshots were inspected. Lint, typecheck, formatting, and both production builds passed. Database schema, authentication backend, and request semantics are unchanged; database checks were not repeated for this UI change.

## Navigation sign-out

Signed-in navigation now offers Library, Add quote, and a Sign out button. Settings is hidden, its route redirects to the library, and its component remains dormant for future use. Successful sign-out returns to the sign-in screen from any page, including password recovery. Sign out uses the existing Supabase session lifecycle and private-cache clearing; pending feedback prevents repeat clicks and failures show a retryable error.

Validation: 56 unit/component/service tests passed, including sign-out pending/error/retry behaviour. All 8 desktop/mobile production browser checks passed at the project path, including signing out directly from navigation, hidden Settings and its URL redirect, password recovery, and account switching. Lint, typecheck, formatting, and production builds passed. No database schema, permissions, or authentication backend changed; database checks were not repeated for this navigation change.

## Personal library quote hero

The signed-in library now opens with a full-width hero above the library heading and Add quote button. It shows one of the current user’s quotations, author/book attribution, and a Refresh button. Refresh selects another quote when available, retaining the current quote on an error. Single-quote libraries explain the disabled refresh action; empty libraries keep the existing call to action. Full quotation text wraps without an internal scroll area.

Applied additive migration `202610240005_library_quote_hero.sql` locally without resetting existing data and regenerated database types. The separate authenticated `get_random_library_quote(exclude_quote_id)` RPC uses invoker privileges, RLS, and `auth.uid()` to constrain sampling to the caller. Anonymous invocation is denied. It returns no notes or account identifiers. Private query keys include the signed-in user ID and existing mutation invalidation keeps samples current.

Validation: 55 unit/component/service tests and 67 real database checks passed, including refresh exclusion, single/empty libraries, owner isolation, anonymous denial, edit visibility, retry behaviour, and clearing the previous account’s quotation. All 8 desktop/mobile production browser checks passed at the root URL with the revised full-width layout, including quote refresh, attribution links, accessibility, screen-width measurements, heading placement, and no horizontal overflow. All 8 project-path browser checks also passed before the layout revision. Desktop/mobile screenshots of the revised hero were inspected. Lint, typecheck, formatting, and production builds passed.

## Public sampling of all user-added quotes

As explicitly requested, the public homepage now samples from all actual user-added quotation text. The replacement RPC `get_random_homepage_quote()` joins saved quotes to their book metadata and returns exactly four fields: text, book author, book title, and publication year. It never returns note text, page references, account/owner identifiers, library-association IDs, or timestamps. Existing raw-table grants/RLS and quote mutation rules remain unchanged.

Applied additive migration `202610240004_personal_homepage_quotes.sql` locally without resetting saved user data. It removes the temporary editorial sample table/RPC introduced during the earlier interpretation of the request. There is no editorial pool, fake fallback quote, opt-in flag, or automatic copying of user content. The page fetches once per visit; editing/deleting a quotation affects future samples directly. The quote form and landing-page wording disclose public quotation text and private notes/account data. The “A little quip” card expands to show the full quotation without internal scrolling.

Validation: 46 unit/component/service tests and 59 database checks passed. All 8 desktop/mobile production browser checks passed under the project path and all 8 passed at the domain root. The root-path checks include the revised homepage paragraph, UK-English document language, “A little quip” title, a real user-added database quote, and the four-field public response with notes/account data excluded. Manual browser measurements confirmed that short and long quotes show their full text without internal or horizontal scrolling at desktop/mobile widths. Lint, typecheck, formatting, and production build passed.

## Accordion baseline

The Add quote book picker now uses a single-open, keyboard-accessible accordion. It defaults to library selection when saved books are available and new-book search when the library is empty. Loading/error states allow new-book search; a user’s explicit choice or input focus prevents asynchronous library results from switching the panel unexpectedly. Opening one section hides and unmounts the other section's inputs.

Validation: 37 unit/component/service tests passed, including populated/empty defaults, panel exclusivity, keyboard switching, saved-book selection, and delayed library loading. Lint and typecheck passed. All 8 desktop/mobile production browser checks passed, including panel switching, hidden-input assertions, quote saving, and axe accessibility checks. Formatting and production build passed. No database or authentication behavior changed.

## Saved-book picker baseline

The top-bar Add quote page now offers books already in the signed-in user's library, with a local title/author filter, covers, authors, and quote counts. Open Library search remains available beneath it, including while the private library is loading, empty, or unavailable. Saved-book selection uses stored metadata, including legacy Google records, without external search or description requests.

Validation for this UI change: 35 unit/component/service tests; lint and typecheck; desktop/mobile production browser checks covering top-bar navigation, local filtering, no external metadata requests, reuse of the existing book URL, one library card, and increased quote counts. The picker is included in axe accessibility checks. Formatting and production build are checked before handoff. No database/auth behavior or migrations changed, so the database checks below remain results from the Open Library integration stage.

## Open Library integration baseline

Open Library now supplies book search, cover URLs, and selected-work descriptions. No API key is required. Google Books API calls and configuration have been removed. Existing Google catalog rows and their quotes remain intact; the additive migration permits further quotes against those existing records while requiring Open Library for new catalog entries.

- Search uses a compact field list and three-character minimum, 300 ms debounce, cancellation, and 30-minute caching.
- Search and selected-description requests share a per-tab queue with at least 1.1 seconds between starts; retries respect `Retry-After`. This is not a global cross-tab/per-IP limiter.
- Descriptions load only after selection, accept string/object formats, and render as text. Missing descriptions do not block saving; loading metadata does not erase entered quotations.
- Work IDs identify saved books. The UI labels dates as first-publication years and does not infer edition ISBNs.
- Metadata requests time out after 20 seconds. Cover IDs use direct HTTPS image URLs with missing-image fallback. Open Library attribution links are present.

## Open Library integration checks and results

| Check                                     | Result                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                            | Passed                                                                                                                    |
| `npm run typecheck`                       | Passed                                                                                                                    |
| `npm run format:check`                    | Passed                                                                                                                    |
| `npm run test -- --run`                   | 30 tests passed                                                                                                           |
| `npx supabase migration up --local`       | Applied `202610240002_open_library.sql` without resetting existing data                                                   |
| Database TypeScript generation            | Regenerated from the migrated local schema                                                                                |
| `npm run test:db`                         | 45 real database checks passed, including legacy Google compatibility                                                     |
| `npm run test:e2e`                        | 8 desktop/mobile checks passed under `/dogear/`                                                                           |
| `TEST_BASE_PATH=/ npm run test:e2e`       | 8 desktop/mobile checks passed at `/`                                                                                     |
| `npm run build`                           | Passed; produces static assets in `dist/`                                                                                 |
| Live Open Library search                  | HTTP 200 with real titles, authors, years, and cover IDs                                                                  |
| `node scripts/live-openlibrary-check.mjs` | Real browser search → selection → description → save quote → delete quote → empty library passed without API interception |

Automated browser suites mock Open Library for repeatability and use real local Supabase for authentication, emails, profiles, quote storage, and account isolation. The optional live check uses real Open Library and local Supabase; it removes its temporary account and newly created catalog fixture. A screenshot from the live saved-book screen was inspected.

Database checks cover cross-user access denial, anonymous access, restricted direct writes, composite ownership integrity, validation, atomic rollback, concurrent saves, last-quote cleanup, concurrent save/delete, and continued save/delete support for existing Google catalog records. New Google catalog inserts and malformed Open Library/edition IDs are rejected.

Baseline foundation verification also passed `npm ci` with zero reported vulnerabilities, a clean local database reset, missing-production-configuration rejection, static-asset credential checks, responsive screenshots, and axe checks on the tested screens/dialog. Those baseline installation and security checks were recorded before the provider switch; package dependencies have not changed.

## Running locally and remaining setup

- Development app: `http://127.0.0.1:5173/`; local email inbox: `http://127.0.0.1:54324/`. The ignored `.env.local` contains only public Supabase settings.
- Hosted Supabase, production SMTP, deployment-domain callbacks, and GitHub Pages publication remain unverified. No remote is configured and nothing was published. Follow README for setup and apply all migrations before deploying the updated frontend.
- Register the deployed application with Open Library as requested by its usage guidance. For frequent/shared-IP use, arrange identification and shared caching/rate limiting; the static per-tab client does not claim an identified-client allowance.
- Manual entry remains deferred. Legacy Google and Open Library books are preserved as separate provider records; they are not automatically merged.
