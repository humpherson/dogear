# Dogeard — Technical Specification

**Status:** Implementation-ready specification  
**Phase:** 1 — Application foundation and functional vertical slice  
**App name:** Dogeard  
**Tagline:** Keep the words that stay with you.

## 1. Objective

Build a responsive, accessible web application with private notes/account data and a static editorial homepage quote in which authenticated users can search for books, select a book, save multiple quotations against it, and browse their personal library. A book enters a user's library when their first quote is saved. The application must build as static assets and deploy to GitHub Pages. Supabase supplies authentication and persistent storage; no custom always-on backend is permitted.

**Implementation principle:** Deliver a working vertical slice, not just mocked pages. Where third-party credentials are absent, provide an explicit setup state and documented local instructions; never pretend persistence or authentication works.

## 2. Scope

### In scope for Phase 1

- React application scaffold, routing, design system, responsive layouts, accessible UI components.
- Supabase email/password sign-up, sign-in, sign-out, email verification handling, password reset, and session persistence.
- Database migrations and RLS policies for profiles, books, user_books, quotes, and retirement of the historical public homepage quote projection.
- Open Library title/author search with debounced autocomplete, cover thumbnails, author and date metadata, description fetched after selection, and result selection.
- Save, view, edit, and delete quotes; optional page number and private note.
- Personal library displaying each saved book once with quote count.
- Book detail page listing quotes belonging to the signed-in user.
- Loading, error, empty, and unauthenticated states.
- Basic unit/integration tests, lint, formatting, CI, GitHub Pages workflow, and setup documentation.

### Explicitly out of scope

- Public profiles, social feeds, public quote-sharing links beyond random homepage sampling, payments, teams, mobile native apps, OCR, AI features, bulk imports, advanced tags, offline sync.
- A self-hosted server or server-side rendering.
- Full-text quote search beyond a simple client-side filter in the user's loaded data.

## 3. Technology decisions

| Area                   | Choice                                                                        |
| ---------------------- | ----------------------------------------------------------------------------- |
| Runtime                | Current maintained Node.js LTS for development/build only                     |
| Frontend               | React + TypeScript (strict mode)                                              |
| Bundler                | Vite                                                                          |
| Styling                | Tailwind CSS v4                                                               |
| Components             | shadcn/ui primitives where useful; Radix-based accessibility                  |
| Routing                | React Router with HashRouter for GitHub Pages                                 |
| Forms                  | React Hook Form + Zod                                                         |
| Server-state           | TanStack Query                                                                |
| Icons                  | lucide-react                                                                  |
| Authentication and DB  | Supabase Auth + PostgreSQL + supabase-js                                      |
| Book metadata          | Open Library APIs; optional Google Books API                                  |
| Tests                  | Vitest + React Testing Library + MSW; Playwright for smoke tests if practical |
| Formatting and linting | Prettier + ESLint with TypeScript/React rules                                 |
| Hosting                | GitHub Pages via GitHub Actions                                               |

Use current compatible stable package versions at implementation time; commit the lockfile. Avoid adding unnecessary state management, a backend framework, or an ORM.

## 4. Brand and design system

**Name:** Dogeard; **wordmark:** `dogeard.`  
**Tagline:** Keep the words that stay with you.

Initial palette:

- Forest: `#203B35` — primary brand color
- Paper: `#F5F0E6` — warm light background
- Antique gold: `#C5A477` — restrained accent
- Ink: `#342F2A` — text

Design direction: warm, literary, calm, modern. Responsive mobile-first layout. Use generous spacing, legible typography, understated cards, visible focus indicators, sufficient contrast, and accessible forms. Prefer a system sans-serif for UI and optionally a freely available serif for editorial headings. Do not embed licensed font files. Implement theme tokens with CSS custom properties and Tailwind utilities. Respect reduced-motion preferences.

## 5. Routes

Use `HashRouter` so direct navigation and refresh work on GitHub Pages project sites.

| Route                  | Access           | Purpose                                           |
| ---------------------- | ---------------- | ------------------------------------------------- |
| `/#/`                  | Public           | Landing page; redirect signed-in users to library |
| `/#/login`             | Public           | Login                                             |
| `/#/signup`            | Public           | Registration                                      |
| `/#/reset-password`    | Public           | Request password reset                            |
| `/#/update-password`   | Recovery session | Set new password                                  |
| `/#/auth/callback`     | Public           | Process authentication redirects/errors           |
| `/#/library`           | Authenticated    | Personal books with quote counts                  |
| `/#/books/:userBookId` | Authenticated    | Book metadata and quotes                          |
| `/#/quotes/new`        | Authenticated    | Choose a library book or search; create a quote   |
| `/#/settings`          | Authenticated    | Redirect to library; Settings temporarily hidden  |
| `*`                    | Public           | Not-found page                                    |

Implement a shared `AppShell` with header, logo, navigation, main landmark, and responsive mobile layout. Signed-in navigation offers Library, Add quote, and a direct Sign out button with pending/error feedback. Hide Settings for now and redirect its existing URL to the library. Protected routes must wait for initial auth resolution before redirecting. Preserve intended navigation where reasonable.

## 6. Data model

All IDs use UUIDs unless an external identifier is specified. Use `timestamptz` for timestamps and `created_at`/`updated_at` where appropriate. Create SQL migrations under `supabase/migrations/`.

### `profiles`

- `id uuid primary key references auth.users(id) on delete cascade`
- `display_name text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Create a profile on signup using a safe database trigger or explicit idempotent provisioning. Users may read/update only their own profile.

### `books` (shared catalog)

- `id uuid primary key default gen_random_uuid()`
- `source text not null` (`open_library` or `google_books`)
- `source_id text not null` (Open Library work ID, e.g. `OL66554W`, or Google Books volume ID)
- `title text not null`
- `authors text[] not null default '{}'`
- `description text null` (store plain/sanitized text)
- `published_date text null` (Open Library search supplies a first-publication year; do not invent edition precision; preserve legacy dates)
- `cover_url text null`
- `isbn_10 text null`
- `isbn_13 text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `unique (source, source_id)`

Catalog books are readable by authenticated users. Do not allow arbitrary client updates/deletes of shared metadata. Implement a **narrowly scoped, security-reviewed** catalog upsert mechanism: either an authenticated SQL RPC that validates/normalizes allowed fields and uses `ON CONFLICT (source, source_id)` or another Supabase-supported trusted pathway. Never expose a service-role key to the browser. New catalogue records accept `open_library` and `google_books`; existing records from both providers remain readable and support additional quotes through the same ownership-checked RPC. Enforce work IDs (`OL` + digits + `W`) for Open Library; enforce size limits and safe URL formats. Catalog upsert must not allow a caller to modify another user's quotes or library.

### `user_books`

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `book_id uuid not null references public.books(id)`
- `created_at timestamptz not null default now()`
- `unique (user_id, book_id)`

Only the owner can read or mutate their rows. For the initial product, remove a book from the library when its last quote is deleted; document and test this behavior. A library entry is not created by merely selecting a search result.

### `quotes`

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `user_book_id uuid not null references public.user_books(id) on delete cascade`
- `text text not null` (trimmed, non-empty; e.g. max 10,000 chars)
- `page_number text null` (text supports Roman numerals/locations)
- `note text null` (e.g. max 5,000 chars)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Enforce that `quotes.user_id` matches the `user_books.user_id` of its parent via a composite foreign key (`unique (id,user_id)` on `user_books` and `foreign key (user_book_id,user_id) references user_books(id,user_id)`) or an equivalent database constraint. RLS alone is not a substitute for relational integrity. Users can CRUD only their own quotes.

### Atomic write operations

Implement an authenticated `save_quote_with_book` RPC/transaction that: validates input, finds or creates a catalog book safely, finds or creates the caller's `user_books` row, inserts the quote, and returns the quote and user-book IDs. Derive user identity from `auth.uid()` rather than accepting a trusted user ID from the client. Handle concurrent saves with unique constraints and `ON CONFLICT`. Use appropriately restricted `SECURITY DEFINER` only if necessary, fixed `search_path`, explicit grants, and no broad bypass of RLS. Add a transactional delete operation or trigger that removes `user_books` after the last quote is deleted, with concurrency safety.

### Static public homepage quotations

The signed-out homepage immediately displays one of three site-owner-supplied static entries from `src/content/homepageQuotes.ts`. Choose randomly once per component mount, keep the choice stable during the visit, and permit repeats. Store each quotation with its author, book and publication year; retain the owner-supplied wording and credits, including identical text on two entries. Do not request saved user quotes or show a quote-loading state. Show the full quotation without an internal scroll area.

Remove the historical security-definer `get_random_homepage_quote()` RPC with migration `202610250001_retire_public_quote_sampler.sql` and remove its unused frontend service. Anonymous and authenticated callers must no longer obtain a random projection of another user's quotation text or credits. Refresh the REST schema cache after dropping the function, preserve raw-table RLS and ownership constraints, and verify anonymous, owner and other-user calls fail with no data. Do not delete saved data. The signed-in personal library hero continues to sample only the caller's own saved quotes. Apply the migration to hosted Supabase as well as locally; frontend deployment alone cannot revoke database access.

## 7. RLS and security requirements

- Enable RLS on every public table, including `books`.
- Profiles, user_books, and quotes: users may access only their own rows; verify SELECT/INSERT/UPDATE/DELETE cases.
- `books`: authenticated read; write only through the narrow validated catalog/RPC pathway.
- Never place a Supabase service-role/secret key in frontend code, `.env` committed files, or GitHub Pages build artifacts.
- The Supabase publishable key and project URL may be embedded in the static build; security relies on RLS.
- Use parameterized Supabase operations; never interpolate untrusted strings into SQL.
- Treat Open Library HTML descriptions as untrusted; render plain text or sanitize safely, never use raw `dangerouslySetInnerHTML`.
- Validate form data in UI and at the database/RPC boundary; client validation alone is insufficient.
- Avoid exposing user data in logs or analytics. Do not introduce analytics by default.
- Configure auth email confirmation, password reset, allowed redirect URLs, and session handling for localhost and the GitHub Pages deployment URL.
- Ensure any auth redirect query/hash handling is compatible with `HashRouter`; test the actual Supabase callback flow, including password recovery.

## 8. Open Library integration

Implement `src/services/booksApi.ts` and a normalized `BookSearchResult` type. Use `https://openlibrary.org/search.json` with a title/author query, requesting only `key,title,author_name,first_publish_year,cover_i`. Normalize `/works/OL…W` and bare work IDs to `OL…W`. Work IDs identify catalog books; do not infer a particular edition or ISBN from the work. Requirements:

- Search only after 2–3 characters; debounce about 300 ms. Request `sort=new` for newest first-publication years, then locally put valid-cover results first within the 12 returned matches. Sort each cover/no-cover group newest to oldest, unknown years last, preserving ties. Do not exclude books without covers or issue extra requests for ranking.
- Request cancellation using AbortController; ignore stale responses.
- Cache with TanStack Query and avoid excessive calls. Space metadata requests at least 1.1 seconds apart per tab, including selected-work lookups and retries; honor Retry-After. This is not a global per-IP rate limiter.
- Retry transient HTTP 408/429/500/502/503/504 and network failures up to three total attempts with exponential equal jitter and Retry-After, within a 20-second overall deadline. Cancellation stops queued requests and backoff; permanent errors fail immediately. Serialize request starts rather than response completion to avoid slow-request head-of-line blocking.
- Fetch `/works/OL…W.json` only after selection for the optional description. Support string and object descriptions; show a recoverable failure and allow saving without a description.
- Use first-publication year as the date at available precision. Use direct Cover ID URLs under `https://covers.openlibrary.org/b/id/` and link back to Open Library.
- Show loading, no-results, error, and retry states.
- Keyboard-accessible combobox/listbox semantics (prefer a tested accessible component).
- Each suggestion displays cover placeholder or thumbnail, title, authors, and publication year if present.
- After selection, show title, authors, publication date (at available precision), description, and cover.
- Map missing or inconsistent API fields safely. Deduplicate identical source IDs.
- Support a manual-entry fallback for books not found **only if** the chosen data model is extended with a separate validated `manual` source and generated stable source IDs; otherwise explicitly defer manual entry and state this in the UI.
- Book metadata and image URLs are third-party content. Use HTTPS URLs when available and handle missing/broken covers.

Configuration: no API key is required. Respect [Open Library usage guidance](https://openlibrary.org/developers/api#usage), register the deployed application, and cache human-driven lookups. A static browser client cannot reliably identify itself using a custom User-Agent and must not claim the higher identified-client rate limit. Before high-volume deployment, arrange a registered/identified pathway with shared caching and rate limiting.

## 9. Frontend architecture

Suggested tree:

```text
.github/workflows/deploy.yml
public/
src/
  app/App.tsx
  app/router.tsx
  app/providers.tsx
  components/layout/AppShell.tsx
  components/books/BookSearch.tsx
  components/books/BookCard.tsx
  components/books/BookDetails.tsx
  components/quotes/QuoteForm.tsx
  components/quotes/QuoteCard.tsx
  components/ui/
  features/auth/
  hooks/
  lib/supabase.ts
  lib/env.ts
  pages/LandingPage.tsx
  pages/LoginPage.tsx
  pages/SignupPage.tsx
  pages/ResetPasswordPage.tsx
  pages/UpdatePasswordPage.tsx
  pages/AuthCallbackPage.tsx
  pages/LibraryPage.tsx
  pages/BookPage.tsx
  pages/AddQuotePage.tsx
  pages/SettingsPage.tsx
  services/booksApi.ts
  services/libraryService.ts
  services/quotesService.ts
  types/
  test/
  index.css
  main.tsx
supabase/migrations/
.env.example
README.md
AGENTS.md
vite.config.ts
```

Use feature-local code where practical. Keep Supabase queries and external API transformations out of presentation components. Use TanStack Query for server state; invalidate library/book/quote queries after mutations. Show user-facing toast or inline error on failures; no optimistic success before server confirmation. Prefer real functionality over extensive placeholder UI.

## 10. UX acceptance requirements

**Authentication:** Include the authentication screens in initial application code so the header Sign in link opens without another page-code download. A new user can sign up, confirm email when required, sign in, refresh without losing their session, sign out, request password reset, and complete password recovery. Unauthenticated access to private routes redirects to login.

**Book discovery:** Entering a title yields autocomplete results. Replace the input search icon with a visible spinner during debounce, queued, and active searches. Keep the search status visible after the field loses focus, identify the input as busy, and stop the indicator on completion or error. With reduced motion enabled, retain static busy feedback and readable status text. Selecting a result displays normalized metadata and a cover if available. Missing data does not crash the page.

**Save quote:** Include the Add quote editor in initial application code so navigating to it does not require another page-code download. Share a 30-second, user-scoped library cache between the library page and book picker; update the affected cache from confirmed mutation responses, with targeted background reconciliation. The Add quote page offers existing library books with a local title/author filter and external discovery in a single-open accordion. Open library selection by default when saved books are available, otherwise open new-book search. Respect explicit section choices while library data loads. Selecting a saved book reuses stored metadata without Open Library requests, including legacy Google Books entries. Empty/error/loading library states keep external search available. Selecting a book and entering a valid quote creates a catalog record if necessary, creates a single user-library association, and saves the quote in one transaction. Repeated quotes against the same book reuse the same user-library association.

**Library:** Above the library heading and Add quote button, show a full-width hero containing a random quote from the signed-in user’s own library, with author/book attribution and a Refresh button. Refresh must avoid the currently displayed quote when another is available. Disable refresh and explain when the user has only one quote; retain the existing empty-library call to action when none exist. Fetch through an authenticated invoker-rights RPC constrained by `auth.uid()` and RLS; keep query cache keys scoped to the user. The user sees each quoted book once, with cover, title, author, and correct quote count. Selecting a book shows only that user's quotes. Empty libraries show a clear call to action.

**Editing/deleting:** A user can edit their own quote and delete it after confirmation. Removing the last quote removes the corresponding book from their library. Other users cannot access or mutate these records, including by guessing IDs or direct Supabase requests.

**Navigation performance:** Return compact library summaries without descriptions/ISBNs. Load full metadata when opening/selecting a saved book, including legacy records, without external API calls. Render cached summaries immediately and let full details/quotes load independently; reuse full detail data for 60 seconds and quotes for 30 seconds. Start personal hero and library reads together and retain fresh hero selections across navigation. Preload book code/details/quotes on pointer, keyboard or touch intent with user-scoped keys and deduplication. Lazy-load grid/picker covers with async decoding and explicit dimensions; eagerly load the main detail cover. After a successful server write, update only affected caches from canonical save/edit results and authoritative deletion counts, preserve last-quote cleanup, and reconcile incomplete lists in the background. Keep RLS, mutation locks, and account cache isolation intact.

**Loading feedback:** Render a branded loading indicator in the initial HTML before JavaScript starts. Keep the application shell visible while lazy pages load. Use shared, labelled spinners for initial reads, Open Library search/debounce/rate-limit waits, selected descriptions, authentication, saving/editing/deleting quotes, and refresh. Show a non-blocking activity indicator for active queries and mutations, including background refetches. Keep existing content visible, disable duplicate submissions, clear indicators on success/error/cancellation, and respect reduced-motion preferences.

**Accessibility:** All forms have labels and errors, search results support keyboard navigation, dialogs manage focus, interactive controls have visible focus, and layouts work at mobile and desktop widths.

## 11. Environment configuration

Commit `.env.example`, not `.env.local`:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_BASE_PATH=/
```

Validate required environment variables and display a clear development-only setup screen when missing. Use Vite's `base` config from `VITE_BASE_PATH`, with `/` for localhost or a custom-domain root and `/<repository-name>/` for a GitHub Pages project site. Avoid hard-coding the repository name.

GitHub Actions should use repository **Variables** for public frontend configuration. Never treat `VITE_*` values as private secrets. Document the Supabase project setup and required allowed redirect URLs.

## 12. CI/CD and GitHub Pages

- Create a GitHub Actions workflow triggered on pushes to `main` and optionally manual dispatch.
- Install dependencies using `npm ci`, run `npm run lint`, `npm run typecheck`, `npm run test -- --run`, and `npm run build`.
- Upload the Vite `dist/` artifact and deploy with official GitHub Pages actions and appropriately scoped permissions.
- Configure Pages to deploy from GitHub Actions, not a branch directory.
- Use `HashRouter` to prevent route refresh 404s on project pages.
- Include README instructions for configuring the GitHub Pages repository settings, deployment URL, Supabase URL allowlist, and custom domains if applicable.
- Add `.gitignore` for local environment files, build output, dependencies, and local tooling artifacts.

## 13. Tests and quality gates

Minimum tests:

1. Open Library response normalization with missing author/cover/date/description.
2. Search debounce/stale request handling.
3. Form validation for blank quotes and length limits.
4. Auth route guard loading, signed-out, and signed-in states.
5. Library query rendering, empty state, and duplicate prevention.
6. Quote create/edit/delete flow with mocked Supabase responses.
7. Database RLS integration tests against a local Supabase instance (document local prerequisites): user A cannot read or mutate user B's profile, library, or quotes; user A cannot attach a quote to user B's user_book; anonymous access is denied; atomic save does not leave orphan library entries.
8. A production build and a GitHub Pages base-path smoke test.

Scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `format`, `format:check`. Tests must not require production credentials. Include a small test fixture dataset but do not expose private sample data.

## 14. Execution plan for Codex

Implement in ordered increments and run checks after each:

1. **Scaffold:** Initialize Vite/React/TS, install dependencies, configure ESLint/Prettier/Tailwind, brand tokens, and routing.
2. **Shell:** Build responsive navigation, landing, login, signup, library empty state, book details shell, quote form, and settings page.
3. **Supabase:** Add environment configuration, client, auth provider, auth screens, migrations, RLS, and documented setup.
4. **Book search:** Build normalized Open Library client and accessible autocomplete with tests.
5. **Persistence:** Implement atomic save RPC, quote CRUD, library queries, cache invalidation, and database security tests.
6. **Deployment:** Add CI/CD, README, AGENTS.md, and GitHub Pages smoke test.

Do not mark a feature complete until it is wired to real services and tested. If credentials are missing, complete all locally testable work and report exact setup steps and any blocked end-to-end checks.

## 15. Definition of done

- `npm install` (or `npm ci` with committed lockfile) and `npm run dev` start successfully.
- `npm run lint`, `npm run typecheck`, `npm run test -- --run`, and `npm run build` pass.
- The app builds into static files under `dist/` with no server runtime requirement.
- Authentication and a full search → select book → save quote → library → edit/delete quote flow work against a configured Supabase project.
- RLS is enabled and cross-user access tests pass.
- A GitHub Pages project-path build and refresh on private routes work.
- README documents setup, Supabase migrations, API configuration, local development, test commands, deployment, and limitations.
- No secret credentials are committed or exposed in the build.

## 16. Codex instructions

Create an `AGENTS.md` summarizing architecture, conventions, security requirements, commands, and the definition of done. Implement this specification rather than only restating it. Prefer simple, maintainable patterns and small components. If you must deviate from the spec, document the rationale. At the end, report what is working, commands run and results, setup actions still required, and known limitations.

**Initial Codex prompt:**

> Read `DOGEAR_TECHNICAL_SPEC.md` fully. Build the Dogeard application foundation and functional vertical slice in this repository following the specification. Start by inspecting the existing repository, then implement in the prescribed order. Use current compatible stable dependencies. Do not introduce a custom backend or expose privileged Supabase keys. Run lint, typecheck, tests, and production build, fixing issues before finishing. If Supabase credentials are not configured, implement migrations and mocked tests, then document exact manual setup and any unverified integration steps. Provide a concise final report of files changed, checks run, remaining configuration, and any deviations.

## 17. Collections extension

Collections are private, user-owned alternatives to books for personal lines, overheard words, lyrics and other quotations. The Add quote picker has three mutually exclusive panels: Choose from your library, Find a new book and Create a collection. Existing entries default to the library panel; an empty library defaults to book discovery. New collections persist only with their first quote.

Each quote belongs to exactly one owned book association or collection, enforced by a database check and composite ownership foreign keys. Collection names trim whitespace, have 1–120 characters and are unique per owner ignoring case. Collection routes use `/collections/:id`; book routes remain unchanged. Collections support renaming, local library filtering, cached detail navigation and quote CRUD. Empty entries are removed after their final quote moves or is deleted.

Optional quote-level author/speaker and source credits are independent of the private collection name. Book quotes initially derive attribution from immutable book metadata. Moving snapshots those credits; users can review or clear them. Blank credits remain blank. Moves retain quote IDs, creation dates, content, notes and references, and can create a collection atomically. Source changes clear publication years. All mutations share the per-user library transaction lock before existing book locks.

The public homepage uses three static editorial entries. The historical public sampler is retired; quotation text and credits are owner-only under RLS, along with collection names, notes and other private fields. The separate authenticated hero samples only the caller's books and collections and includes the private destination needed for navigation. RPCs restrict execution and enforce caller ownership; direct collection/quote-parent writes remain denied. Collection tables use RLS. User-scoped caches update from canonical mutation results, with targeted background reconciliation.

Collection appearance: thumbnails display the collection name with a single-line ellipsis for long names. Background, icon, text and border colours are editable at creation (including creation during a move) and from Edit collection alongside the name. Existing collections receive paper/forest/gold defaults. Store colours on the private collection as validated six-digit hex values; reject invalid values atomically and preserve caller ownership checks. Library, picker and detail views reuse saved appearance and existing thumbnail dimensions.

Colour selection uses a fixed, coordinated palette of 12 named swatches for each appearance field, rather than native free-form colour pickers. Swatches provide at least 44 × 44 px tap targets, labelled native radio controls, keyboard focus and a selected checkmark. Previously saved colours outside the palette remain unchanged until a user selects a swatch.

Each appearance field uses a compact dropdown showing its current colour chip and name. Only one palette opens at a time; choosing a swatch closes it and returns focus to the trigger. Escape or clicking outside closes the palette. The panel expands within the form so it remains usable inside scrolling mobile dialogs.

Collection icons use a compact dropdown with labelled icon previews, native radio choices, 44 px tap targets and the same close/focus behaviour as colour dropdowns. Persist one allowlisted icon ID on each private collection: layers (default), music, tv, book, speech, paw-print, user, face-grinning, face-slightly-frowning, star or brush. Creation, edit and move-to-new-collection support the icon choice. Preserve icons on colour-only/name-only edits and preserve the existing icon colour. Existing collections default to layers. The historical public quote projection remains retired.

Temporary UI scope: hide the four colour dropdowns on every collection appearance form while retaining the icon picker, colour UI code, validation, storage and rendering. Preserve saved colours when editing names/icons or adding quotes.

## 18. Optional Google Books provider

Retain Open Library as the default and offer a Book catalogue selector when `VITE_GOOGLE_BOOKS_API_KEY` is configured. Google uses volume IDs and a separate cancellable request path; Open Library keeps its work IDs, request spacing and description-on-selection flow. Debounce, labelled loading/error/retry states and provider-scoped caches apply to both. Switching catalogues must hide stale results and cancel old requests. Do not combine results, silently fall back, or relabel existing books.

Google searches request up to 12 relevant books with compact volume metadata, including descriptions, ISBNs and available dates. Treat all data as untrusted, bound fields, render descriptions as plain text, validate IDs/dates/ISBNs, and upgrade safe cover URLs to HTTPS. Selection must not issue a redundant description request. Include Google attribution and prominent per-result/detail source links. Saved metadata continues to use Supabase independently of the active discovery provider.

The Google browser key is optional and public in the static bundle. Keep real values out of source control and restrict the key to Books API and approved website origins. Pass its repository variable into the production build. Migration 010 enables new Google catalogue records without changing quote ownership, canonical metadata immutability or transaction lock ordering. Preserve all Open Library and existing Google records. Automated tests use fake credentials and fixture network responses; live latency requires verification with the configured key and deployed origin.

Google Books resilience: retry transient connection failures and HTTP 408/500/502/503/504 up to three total attempts, using exponential backoff and jitter, respecting Retry-After and a 20-second overall search budget. Cancellation must stop active requests and delay timers. Do not retry permanent key/permission failures or quota errors embedded in a 503 response. Keep query-library retries disabled to prevent layered retry loops. Retain the loading indicator throughout the attempt sequence and offer an explicit Open Library fallback action that preserves the search term and keeps source identity clear.

Current discovery UI scope: expose only Open Library and suppress the catalogue selector even if a Google Books key is configured. Retain Google integration, retry logic, metadata and database compatibility behind a disabled discovery visibility flag for future trials. Existing Google-sourced library records remain usable.

### Responsive collection UI

Valid 120-character unbroken collection names must fit 320, 390, 768 and 1440 px widths without horizontal page scrolling. Clamp library titles to three lines but wrap full detail titles. Keep mobile primary navigation and quote actions at least 44×44 px, with Delete visually separated. Collapse optional collection appearance under “Customise collection”, use a compact mobile selected summary, and focus/scroll to the quotation field after selection. Edit/move dialog actions stay outside the scrolling form body; use a compact edit preview. Escape closes an open nested appearance chooser before dismissing its enclosing dialog and preserves the draft. Colour controls remain hidden; palette contrast changes are deferred. Validate real mobile keyboards and assistive technologies separately from viewport emulation.
