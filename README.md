# dogeard.

Keep the words that stay with you. A personal, responsive book quotation library built with React, TypeScript, Vite, and Supabase. The frontend deploys as static files to GitHub Pages; it needs no application server.

## Local setup

Prerequisites: Node 22 LTS (see `.nvmrc`), npm, Docker Desktop running, and enough disk space for the local Supabase containers. The Supabase CLI is a pinned project dependency. Initial container downloads can take several minutes.

```sh
nvm use
npm ci
npm run db:start
npm run db:reset
cp .env.example .env.local
npx supabase status
```

Set `VITE_SUPABASE_URL` to the local API URL (normally `http://127.0.0.1:54321`) and `VITE_SUPABASE_PUBLISHABLE_KEY` to the publishable key or legacy **anon** key shown by `supabase status`. Keep `VITE_BASE_PATH=/`. Never copy the secret/service-role key to a `VITE_*` variable. All `VITE_*` values are public in the browser.

```sh
npm run dev
```

Open the URL Vite prints (normally `http://127.0.0.1:5173`). Without configuration, development shows setup instructions; a production build fails with an actionable error. Restart Vite after changing `.env.local`.

Sign up using an invented email such as `reader@example.test`. Local confirmation and recovery emails are captured in Mailpit at `http://127.0.0.1:54324`; they are not delivered externally. Follow the link there to confirm your account. Local email confirmation is enabled, and passwords require at least eight characters. Studio is available at `http://127.0.0.1:54323`.

`npm run db:reset` recreates **local** data and reapplies migrations. Stop the local stack with `npx supabase stop`; do not use remote reset commands against a deployed project.

## Commands and verification

| Command                                   | Purpose                                                               |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `npm run dev`                             | Vite development server                                               |
| `npm run build`                           | Strict TypeScript check and static output in `dist/`                  |
| `npm run preview`                         | Serve production output locally                                       |
| `npm run lint` / `npm run typecheck`      | Static checks                                                         |
| `npm run test -- --run`                   | Vitest, Testing Library, and MSW tests                                |
| `npm run test:db`                         | Local Supabase RLS, integrity, rollback, and concurrency tests        |
| `npm run test:e2e`                        | Production project-path Playwright tests with real local auth/storage |
| `TEST_BASE_PATH=/ npm run test:e2e`       | Repeat browser checks at the domain root                              |
| `npm run format` / `npm run format:check` | Prettier                                                              |
| `npm run db:types`                        | Regenerate database TypeScript types from the running local schema    |

Install the browser once with `npx playwright install chromium` (`--with-deps` on Linux). Start and reset local Supabase before database/browser tests. Neither suite requires hosted credentials. Database tests refuse non-local URLs. Browser tests build with the local public key, exercise both desktop/mobile Chromium, capture local auth emails, and mock external book APIs for reproducibility. Test users are removed afterward. Failure traces may contain test session data; they stay in ignored local output and are not uploaded by CI.

## Product behavior and architecture

- Loading feedback starts in the initial HTML, before JavaScript or authentication completes. Shared spinners label database reads, Open Library searches/descriptions, saves, deletes, and authentication actions. A small activity badge also covers background query refetches and mutations. Page navigation retains the app header/footer while its code loads; existing content stays visible during background reads. The book-search icon becomes a rotating spinner while a search is pending, with status text that remains visible after focus leaves the field. Indicators respect reduced motion and never imply completion before a request succeeds.

- The sign-in, registration, and password-recovery screens are included in initial application code, so the header Sign in link opens without a separate page-code download.

- Signed-in navigation offers Library, Add quote, and Sign out. Every quote-adding control uses “Add quote” with a leading plus icon, including mobile navigation, empty/populated libraries and book/collection details. Settings is hidden for now; existing settings URLs redirect to the library. Successful sign-out returns to the sign-in screen from any page.

- The signed-out homepage immediately displays one of three owner-supplied static quotations, chosen randomly once per visit. It makes no quote database request. Notes, page references and account details remain private. Saved quotes and credits are owner-only after applying the endpoint retirement migration described below.

- Add quote is included in the initial application code so clicking it does not wait for an editor download. Library pages and the book picker share a 30-second, user-scoped cache to avoid redundant reads during navigation; confirmed quote mutations update it immediately.

- The top-bar Add quote page lets users choose an existing library book, filter saved books by title/author, or search Open Library for a new one. The choices sit in a single-open accordion: library selection opens by default when books are available; new-book search opens for an empty library. Choosing a saved book uses stored metadata and does not call Open Library.
- Signed-in libraries show a full-width personal quote hero above the library heading, Add quote button, and book grid. Refresh selects another of that user’s quotes and avoids the current quote when another is available. A single-quote library shows its quote with Refresh disabled; an empty library keeps its existing call to action. This owner-only RPC is separate from the static homepage entries and uses RLS plus `auth.uid()`.
- The library contains each book once. Selecting a search result writes nothing; saving the first quote atomically creates the library association.
- Deleting the last quote removes the book from that user's library. Shared catalog metadata remains available and cannot be overwritten by later client submissions.
- Book discovery supports Open Library work IDs and optionally Google Books volume IDs. Both providers can create catalogue entries and receive more quotes, with separate identities and caches. Manual entry, sharing, analytics, offline sync, and social features are deferred.
- Quote text is limited to 10,000 characters; notes to 5,000; page/location references to 100. Client and database validation enforce these limits.
- `src/services/` owns Supabase operations and external response normalization. TanStack Query owns server state; private query keys include the user ID and are cleared when accounts change.
- SQL migrations in `supabase/migrations/` define RLS, relational ownership, profile provisioning, and the `save_quote_with_book` / `delete_quote` RPCs. Create/delete operations use a transaction lock per user and catalog book, preventing races around the last quote. Direct library writes and quote inserts/deletes are denied; only quote content fields can be updated directly by the owner.
- RPCs run with explicitly restricted privileges and derive the caller from `auth.uid()`. They validate bounded metadata and HTTPS cover URLs. Metadata originates from a public browser API and is not a publisher-verified catalog.
- React renders descriptions and quotations as text. Open Library descriptions are normalized without raw HTML rendering. Cover failures use a placeholder.

## Navigation performance and mutation results

Library lists fetch compact book summaries rather than descriptions and ISBNs. Full metadata loads from Supabase only when opening or selecting a saved book; legacy Google records are supported and no Open Library call is needed for saved selections. Book views show cached summaries immediately while full details and quotes load independently. Fresh full details are reused for 60 seconds; library summaries, quote lists, and the personal hero use a 30-second freshness window. Private keys include the user ID and identity changes still clear caches.

The personal hero starts in parallel with the library read and retains its selection across short navigation trips. Refresh always requests another eligible personal quote. Book-card hover, focus, or touch preloads page code, book details, and quotes, with query deduplication and freshness checks. Library navigation also preloads its page code on intent. Cover images in grids/pickers use native lazy loading, asynchronous decoding, and explicit dimensions; the opened book’s main cover loads eagerly.

After sign-in, static Library, Book and Collection page modules preload during browser idle time (with a short timer fallback where idle callbacks are unavailable). Shared loaders retain the resolved component as well as the import promise, so a completed preload renders immediately without a first-use code spinner. This loads code only: it does not prefetch private records. Scheduled work is cancelled on sign-out/unmount and skipped when Save-Data is enabled. Existing hover/focus/touch data prefetching remains user-scoped.

Page loading boundaries reset for each destination and account, so a first-use module download shows “Opening this page…” immediately while the header stays usable. The request indicator continues to cover data reads and writes after code loads. Navigating away clears the page spinner; a late module cannot redirect the user back. Failed page loads show a Refresh app option while keeping navigation available. No artificial minimum spinner delay or server warm-up is introduced; Auth and Add quote remain in the initial bundle.

Confirmed quote mutations update the affected caches immediately. Edits return canonical quote rows. Additive RPCs `save_quote_with_book_result` and `delete_quote_result` return canonical saved records or the remaining count while invoking the existing ownership-checked, transaction-locked functions. Reconciliation runs in the background and does not delay navigation or closing editors/dialogs. Complete confirmed quote lists and full book metadata are reused without an immediate redundant read.

**Before deploying this frontend to an existing hosted project**, apply pending migrations, including `202610240006_quote_results.sql`:

```sh
npx supabase db push --dry-run
npx supabase db push
```

For an existing local database use `npx supabase migration up --local`, then regenerate types with `npm run db:types`. No data reset is required. Original save/delete RPCs remain available for compatibility with older clients; existing RLS remains unchanged; the retired public quote sampler is removed by the later migration.

## Public homepage quotes

The signed-out homepage uses the three editorial entries in `src/content/homepageQuotes.ts`. A lazy component state initializer selects one entry at random on each mount, keeping its text, author, book and year together. The choice stays stable during the visit and may repeat on later visits. Rendering requires no Supabase quote request, loading state or API retry. The first two entries deliberately retain the identical text and different attributions supplied by the site owner. The “A little quip” card displays the full quotation without an internal scroll area.

Migration `202610250001_retire_public_quote_sampler.sql` removes the legacy security-definer `get_random_homepage_quote()` function and reloads the REST schema cache. Apply it to local and hosted Supabase to close the historical anonymous/authenticated projection of saved quotes; frontend deployment alone cannot revoke database access. The obsolete client service has been removed. Raw-table RLS and owner-only mutations remain unchanged, and the signed-in personal quote hero continues to use its authenticated, caller-scoped sampler. No saved quotes, credits, notes or library entries are deleted. Existing clients that request the retired endpoint receive an error instead of saved quotation text.

## Hosted Supabase setup

1. Create a Supabase project. Keep its secret/service-role key outside this repository and frontend configuration.
2. Authenticate the CLI, link the intended project, inspect migrations, and apply them deliberately:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push --dry-run
   npx supabase db push
   ```

3. Enable email/password authentication and email confirmation. Set the minimum password length to eight or more. Configure SMTP suitable for actual users; the hosted default email service is limited and is not a production delivery guarantee.
4. Set the Auth Site URL to the full deployed root, including any repository path and trailing slash: `https://OWNER.github.io/REPOSITORY/`.
5. Allow these exact redirect destinations (replace the sample deployment URL):

   ```text
   http://127.0.0.1:5173/?auth=callback
   http://127.0.0.1:5173/?auth=callback&flow=recovery
   http://localhost:5173/?auth=callback
   http://localhost:5173/?auth=callback&flow=recovery
   https://OWNER.github.io/REPOSITORY/?auth=callback
   https://OWNER.github.io/REPOSITORY/?auth=callback&flow=recovery
   ```

6. Keep the standard confirmation/recovery email templates using Supabase's verification link (`{{ .ConfirmationURL }}`). Auth redirects go to the static application root, never a physical `/auth/callback` path. The SDK consumes its token fragment before `HashRouter` starts; the app removes auth URL material and navigates to `#/auth/callback` or `#/update-password`.
7. Add the project's URL and publishable key to `.env.local` for a manual hosted check. Verify confirmation, recovery, refresh, and the entire quote lifecycle before calling hosted integration complete.

See [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords) and [browser implicit redirects](https://supabase.com/docs/guides/auth/sessions/implicit-flow).

## Open Library

Book discovery uses [Open Library](https://openlibrary.org/developers/api#usage), with no API key. Search uses `search.json` with its default relevance ordering (no newest-first sort), requests only title/author/year/cover/ID fields, and starts after three characters with a 300 ms debounce. Search and selected-work requests share a queue with at least 1.1 seconds between request starts per browser tab. Within the 12 most relevant returned matches, exact title matches rank first (ignoring case, punctuation, spacing and a leading “the”, “a” or “an”), even when they have no cover. Within exact-title and other-match groups, valid covers are preferred; ties retain Open Library relevance order. Publication year does not affect ranking, so classics are not displaced by newer adaptations. Books without covers remain selectable. This ranking adds no API requests; a cover ID does not guarantee the image will load. Search responses are cached for 30 minutes; descriptions for an hour. Requests cancel when stale, time out after 20 seconds, and honor `Retry-After` on throttled responses. Transient HTTP 408/429/500/502/503/504 and connection failures get at most three total attempts with exponential equal jitter (0.5–1 second, then 1–2 seconds), respecting request spacing and longer Retry-After values within the same 20-second deadline. Permanent errors are not retried. The queue spaces request starts without waiting for previous responses, so a slow obsolete lookup cannot block newer requests. TanStack retries remain disabled to avoid multiplying attempts; existing loading feedback stays active throughout. There are no background metadata crawls.

Descriptions are fetched once a result is selected using `/works/OL…W.json`. Both string and object descriptions are normalized to plain text. Missing descriptions do not prevent saving a quote. Covers use direct `covers.openlibrary.org` Cover ID URLs with `?default=false`, allowing broken/missing images to fall back to a placeholder. The UI links back to Open Library.

A library book represents an Open Library **work**, not a specific edition. Publication dates are first-publication years; no edition ISBN is inferred from a work's mixed editions. Existing Google Books records are preserved as separate legacy records, rather than being silently merged or relabeled. The additive migration `202610240002_open_library.sql` enables Open Library saves and retains quote saving for existing Google catalog records. Apply pending migrations on an existing local stack using `npx supabase migration up --local` (no reset is required), then run `npm run db:types` after schema changes.

Open Library's default metadata limit is one request/second. Our browser queue is per tab, not a global limit across tabs, devices, or shared IPs. Browsers control the User-Agent, so this static client does not claim the higher identified-client allowance or send a fake contact email. Open Library requests application registration and identification for frequent use; register the deployed application through its developer page. If usage grows, arrange an identified server-side gateway with a real contact address and shared caching/rate limiting before scaling. This implementation remains a static, low-volume, human-driven discovery client; it does not introduce a proxy or bulk ingestion.

Open Library requires no Google Books key or Google Cloud setup. The optional Google Books integration below needs a restricted browser key. Manual book entry remains deferred.

For an optional live check, run `node scripts/live-openlibrary-check.mjs` with the dev server on port 5173 and local Supabase running. This makes a small number of real Open Library requests, verifies search/selection/save/delete in Chromium, and removes its temporary account and newly created catalog fixture. It is deliberately excluded from CI to avoid repeated public-API traffic.

## GitHub Pages

1. Create/configure the Git remote and push this project to `main`.
2. Under **Settings → Pages**, choose **GitHub Actions** as the source. Ensure the `github-pages` environment permits deployment from `main`.
3. Under **Settings → Secrets and variables → Actions → Variables**, configure:

   ```text
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   VITE_BASE_PATH=/REPOSITORY/
   ```

   Use `/` for an account site or custom-domain root. Repository names are not hard-coded. Public frontend values belong in Variables, not secret configuration intended to hide them.

4. The workflow checks formatting, lint, types, unit tests, real local database tests, and desktop/mobile browser flows at root/project paths. It then builds with the hosted public configuration and deploys `dist/` using the official Pages actions. Pull requests verify without deploying.
5. For a custom domain, configure Pages DNS/domain settings, set `VITE_BASE_PATH=/`, and update Supabase's Site URL and exact redirect allowlist to that domain before redeploying. All page navigation stays after `#`, so direct refresh does not require server rewrite rules.

Hosted migrations are intentionally separate from frontend deployment. Apply compatible database changes before deploying a frontend that needs them. [GitHub Pages custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) describes the hosting configuration.

## Verification status

See `VERIFICATION.md` for the commands actually run, outcomes, and outstanding hosted checks. Local integration passing does not establish hosted SMTP, deployed-domain callbacks, or GitHub Actions execution.

## Collections

Choose **Create a collection** on Add quote to keep words without a book. A collection is created atomically with its first quote; merely choosing a name does not save anything. Existing collections appear alongside books in the library and saved-entry picker. Names are private, trimmed, limited to 120 characters and unique per user without regard to case. Rename them from their detail page.

Collection quotes have optional **Author or speaker** and **Source** credits. Leaving these blank does not infer the user's identity. The homepage uses static editorial entries. Saved quote text, credits, collection names, notes, references and account details remain owner-only after the endpoint retirement migration. The private hero uses `book_title` as the legacy field name for a custom source.

Use **Move** on a quote to select an existing book or collection, or create a collection. Review/edit the credits before confirming. Moves preserve quote identity, creation date, text, note and reference. Original book attribution is retained even when moving into another book. Changing the source clears its publication year. Moving or deleting the final quote removes the empty library entry; immutable book catalogue records remain.

Apply `supabase/migrations/202610240007_collections.sql` before deploying this frontend. For hosted Supabase, review pending changes with `npx supabase db push --dry-run`, then apply with `npx supabase db push`. Local development uses `npx supabase migration up --local`; no reset is required. `npm run test:db` includes book compatibility, collection ownership, concurrency, credit preservation and denial of access to the retired public projection.

Collection thumbnails show their names, with long names truncated to fit. Creation and **Edit collection** offer compact dropdowns containing 12 coordinated colour swatches for each of the background, icon, text and border, with a preview. Existing collections retain the paper/forest/gold defaults until changed. Colour choices belong to the private collection and never enter public quote attribution. Apply `202610240008_collection_colours.sql` before deploying the colour controls; it keeps previous collection RPCs compatible and validates six-digit hex colours in atomic save/edit/move wrappers.

Collections also have a **Collection icon** dropdown with the original Layers icon plus Music, TV, Book, Speech, Paw print, User, Grinning face, Slightly frowning face, Star and Brush. Choose an icon during creation or Edit collection; existing collections default to Layers. The choice is saved privately and uses the chosen icon colour throughout the library. Apply `202610240009_collection_icons.sql` before deploying the icon picker.

Background, icon, text and border colour controls are temporarily hidden across collection creation, editing and moves. The icon picker stays available. Existing colours, persistence, palette code and styling remain intact; `showColourControls` in `CollectionAppearanceFields.tsx` controls visibility.

## Optional Google Books comparison

**Currently hidden:** discovery uses Open Library only, even when a Google key is configured. Google client, retries, storage compatibility and UI code remain available for a future trial. `showGoogleBooksDiscovery` in `src/services/booksApi.ts` controls visibility; the setup below applies when re-enabled. Open Library needs no book API repository variables.

Open Library remains the default. Set `VITE_GOOGLE_BOOKS_API_KEY` in `.env.local` and restart Vite to show the **Book catalogue** selector in Find a new book. Select Google Books to try the same title/author search without removing Open Library. The selector is hidden when no key is configured. Switching providers clears old results and cancels the old request; cache entries are separate by provider. There is no automatic fallback or mixing of results, so failures stay attributable to the selected service.

```text
VITE_GOOGLE_BOOKS_API_KEY=YOUR_RESTRICTED_BROWSER_KEY
```

For GitHub Pages, add the same name under **Settings → Secrets and variables → Actions → Variables**, then redeploy. The workflow passes it into the build. This is a public browser key: a GitHub Secret would not hide it in the generated JavaScript. Restrict the key to **Books API** and HTTP referrers for `https://dogeard.co.uk` and `https://dogeard.co.uk/*`; add only the local origins/ports you actually use for development. Keep the real value out of committed files. Enable Books API in the Google Cloud project. See [Google's API key restrictions](https://docs.cloud.google.com/docs/authentication/api-keys) and [Books API usage](https://developers.google.com/books/docs/v1/using).

Google requests use `https://www.googleapis.com/books/v1/volumes`, a three-character minimum, the existing 300 ms debounce and provider-specific search caching. They request up to 12 books with only relevant metadata, use a 20-second timeout, send the key in the Books API documented `key` query parameter, and avoid the Open Library rate-limit queue. The generic `X-Goog-Api-Key` header is not used: accepting CORS preflight did not establish correct Books API quota attribution. Quota/key/restriction errors offer retry or switching back to Open Library. Google descriptions arrive in search metadata and are normalised to text, so selecting a result does not require another metadata request. Cover URLs are upgraded to HTTPS. Saved-library selection always uses stored metadata rather than calling either provider.

Google results include source links and the official attribution graphic, following [Google Books branding guidance](https://developers.google.com/books/branding). Open Library and Google results are kept separate. The same physical book can appear under two provider identities; no automatic merging or migration of saved quotes occurs. Open Library identifies works and Google identifies volumes, so metadata/results may differ.

Apply `202610240010_google_books_discovery.sql` to hosted Supabase before deploying this frontend (`npx supabase db push --dry-run`, then `npx supabase db push`). It removes the previous new-Google-entry restriction while retaining metadata validation, caller ownership, shared locks and canonical immutable catalogue records. No new database credentials are required.

To compare live performance, use the same title/author in each catalogue. Compare both search response and selection-to-ready time; Google already includes a description while Open Library fetches it after selection. Fresh searches and cached searches are different measurements: use fresh sessions for cold comparisons and repeat each several times. The local automated checks use fixture responses and a fake test key; they do not establish which public API is faster with your actual key or network.

If Google returns HTTP 503 or 429 with a zero daily allowance, first verify request attribution: the request must include your configured `key` query parameter, and the consumer project in the error should match your Cloud project. A controlled local check showed that an anonymous request returned consumer project `624717413613` with zero quota, while the same configured browser key sent using the documented parameter returned HTTP 200. Do not infer your own project quota from the anonymous consumer error. If the error does refer to your project, inspect **APIs & Services → Books API → Quotas & System Limits → Queries per day**, check overrides, and request an adjustment only if your granted quota needs changing. Follow [Google's quota management instructions](https://docs.cloud.google.com/docs/quotas/view-manage). The app handles quota errors inside 503 responses and keeps Open Library available.

During diagnosis, one minimal ISBN request with the documented key parameter returned HTTP 200, while keyword searches returned Google `503 backendFailed` even without optional field filtering and from the local browser origin. This does not establish live keyword-search availability or improved performance. If your console shows remaining quota, a zero-quota response for an anonymous consumer is not evidence that you need to raise your project limits.

Google searches make at most **three total attempts** for transient HTTP 408/500/502/503/504 responses and connection failures. Delays use exponential backoff with equal jitter (0.5–1 second, then 1–2 seconds), honour a longer `Retry-After`, and remain within a 20-second overall deadline. Changing query/provider, leaving the screen or cancelling the query stops pending requests and backoff timers. Quota errors (including a 429 inside an HTTP 503) and key/permission errors fail immediately. TanStack Query retries stay disabled for discovery so retry layers do not multiply. Loading feedback remains active through the attempts. After failure, **Search Open Library instead** keeps the search text and explicitly switches providers; results are never silently mixed. Open Library's request-spacing rules are unchanged.

## Responsive collection editing

Library cards use shrinkable grid tracks and clamp long titles to three lines; detail screens wrap the full name. Mobile navigation and quote actions have targets of at least 44×44 px, with Delete separated from Edit and Move. Collection appearance is optional under “Customise collection”, while the colour controls remain hidden and saved colours are preserved. After selecting a collection, the quotation field receives focus and scrolls into view; its summary is compact on mobile. Existing metadata remains available for optional changes without repeating the initial setup step.

Edit collection and Move quote keep their actions outside the scrolling form body. Edit previews are compact. Escape closes an open icon chooser and returns focus to its trigger without discarding the dialog draft; a subsequent Escape dismisses the dialog. Browser regression checks cover 320×568, 390×844, 768×1024 and 1440×900. Real iOS/Android keyboard and screen-reader checks are still required; Chromium viewport emulation does not establish their behaviour. Palette contrast changes from UI review section 6 are deferred.

## Security review

See [the 25 October 2026 security review](spec/SECURITY-REVIEW.md) for local/live access checks, scope, a fixed account-switch/history disclosure, and remaining hardening recommendations. Private route state resets when the authenticated user changes. Incoming editor selections must belong to the current account; new collection navigation stores only owner/collection IDs and retrieves metadata through user-scoped RLS-protected queries. Shared bibliographic catalogue data remains readable to authenticated users, while personal library membership, quotations, notes and collection names are owner-only. Deploy the frontend to deliver the account-switch fix.

Book descriptions wrap without internal scrolling on both Add quote and book detail screens, displaying at most 320 characters including a trailing `...` when truncated. Full descriptions remain stored. The Add quote screen hides the Open Library source link and the privacy hint; book detail source links and edit-form guidance remain available.
