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

Install the browser once with `npx playwright install chromium` (`--with-deps` on Linux). Start and reset local Supabase before database/browser tests. Neither suite requires hosted credentials. Database tests refuse non-local URLs. Browser tests build with the local public key, exercise both desktop/mobile Chromium, capture local auth emails, and mock only Open Library for reproducibility. Test users are removed afterward. Failure traces may contain test session data; they stay in ignored local output and are not uploaded by CI.

## Product behavior and architecture

- Loading feedback starts in the initial HTML, before JavaScript or authentication completes. Shared spinners label database reads, Open Library searches/descriptions, saves, deletes, and authentication actions. A small activity badge also covers background query refetches and mutations. Page navigation retains the app header/footer while its code loads; existing content stays visible during background reads. The book-search icon becomes a rotating spinner while a search is pending, with status text that remains visible after focus leaves the field. Indicators respect reduced motion and never imply completion before a request succeeds.

- The sign-in, registration, and password-recovery screens are included in initial application code, so the header Sign in link opens without a separate page-code download.

- Signed-in navigation offers Library, Add quote, and Sign out. Settings is hidden for now; existing settings URLs redirect to the library. Successful sign-out returns to the sign-in screen from any page.

- The signed-out homepage requests one random, attributed quote from **all user-added quotations**, including existing and future saves. Quote text and book attribution can be public. Notes, page references, account details, and library membership remain private. Random selections may repeat; there is no separate editorial pool or opt-in flag.

- Add quote is included in the initial application code so clicking it does not wait for an editor download. Library pages and the book picker share a 30-second, user-scoped cache to avoid redundant reads during navigation; confirmed quote mutations update it immediately.

- The top-bar Add quote page lets users choose an existing library book, filter saved books by title/author, or search Open Library for a new one. The choices sit in a single-open accordion: library selection opens by default when books are available; new-book search opens for an empty library. Choosing a saved book uses stored metadata and does not call Open Library.
- Signed-in libraries show a full-width personal quote hero above the library heading, Add quote button, and book grid. Refresh selects another of that user’s quotes and avoids the current quote when another is available. A single-quote library shows its quote with Refresh disabled; an empty library keeps its existing call to action. This owner-only RPC is separate from the public homepage sampler and uses RLS plus `auth.uid()`.
- The library contains each book once. Selecting a search result writes nothing; saving the first quote atomically creates the library association.
- Deleting the last quote removes the book from that user's library. Shared catalog metadata remains available and cannot be overwritten by later client submissions.
- New catalog entries use Open Library work IDs. Existing Google Books records remain readable and can receive more quotes; no Google API calls are made. Manual entry, sharing, analytics, offline sync, and social features are deferred.
- Quote text is limited to 10,000 characters; notes to 5,000; page/location references to 100. Client and database validation enforce these limits.
- `src/services/` owns Supabase operations and external response normalization. TanStack Query owns server state; private query keys include the user ID and are cleared when accounts change.
- SQL migrations in `supabase/migrations/` define RLS, relational ownership, profile provisioning, and the `save_quote_with_book` / `delete_quote` RPCs. Create/delete operations use a transaction lock per user and catalog book, preventing races around the last quote. Direct library writes and quote inserts/deletes are denied; only quote content fields can be updated directly by the owner.
- RPCs run with explicitly restricted privileges and derive the caller from `auth.uid()`. They validate bounded metadata and HTTPS cover URLs. Metadata originates from a public browser API and is not a publisher-verified catalog.
- React renders descriptions and quotations as text. Open Library descriptions are normalized without raw HTML rendering. Cover failures use a placeholder.

## Navigation performance and mutation results

Library lists fetch compact book summaries rather than descriptions and ISBNs. Full metadata loads from Supabase only when opening or selecting a saved book; legacy Google records are supported and no Open Library call is needed for saved selections. Book views show cached summaries immediately while full details and quotes load independently. Fresh full details are reused for 60 seconds; library summaries, quote lists, and the personal hero use a 30-second freshness window. Private keys include the user ID and identity changes still clear caches.

The personal hero starts in parallel with the library read and retains its selection across short navigation trips. Refresh always requests another eligible personal quote. Book-card hover, focus, or touch preloads page code, book details, and quotes, with query deduplication and freshness checks. Library navigation also preloads its page code on intent. Cover images in grids/pickers use native lazy loading, asynchronous decoding, and explicit dimensions; the opened book’s main cover loads eagerly.

Confirmed quote mutations update the affected caches immediately. Edits return canonical quote rows. Additive RPCs `save_quote_with_book_result` and `delete_quote_result` return canonical saved records or the remaining count while invoking the existing ownership-checked, transaction-locked functions. Reconciliation runs in the background and does not delay navigation or closing editors/dialogs. Complete confirmed quote lists and full book metadata are reused without an immediate redundant read.

**Before deploying this frontend to an existing hosted project**, apply pending migrations, including `202610240006_quote_results.sql`:

```sh
npx supabase db push --dry-run
npx supabase db push
```

For an existing local database use `npx supabase migration up --local`, then regenerate types with `npm run db:types`. No data reset is required. Original save/delete RPCs remain available for compatibility with older clients; public homepage sampling and existing RLS remain unchanged.

## Public homepage quotes

Apply pending migrations with `npx supabase migration up --local` for an existing local database; use the hosted migration steps below for deployment. Migration `202610240004_personal_homepage_quotes.sql` replaces the temporary editorial pool with `get_random_homepage_quote()`, which selects from actual saved quotations joined to their book metadata. It does not modify saved quotes or notes.

The RPC uses a fixed empty search path, a read-only query, explicit execution grants, and a four-field return type: `text`, `author`, `book_title`, and `published_year`. Its narrowly scoped definer privileges permit that public projection while raw `quotes`, profiles, and library rows remain protected by their existing grants and RLS. Notes, page numbers, account/owner identifiers, and timestamps are never returned. Existing saved quote text becomes eligible immediately; updating or deleting a quote changes the available pool directly.

The homepage loads a fresh random record when mounted and stays on that selection during the visit. It does not rotate on focus or a timer. Randomness allows repeats. Loading, empty-database, and retryable-error states are explicit; there is no hard-coded or editorial fallback. The “A little quip” card expands to show the full quotation without an internal scroll area. No privileged key is exposed to the frontend.

The landing page and quote form explain that quote text/book attribution may appear on the public homepage and that notes/account details stay private. This public-text behavior is intentional; it supersedes the original private-only quotation wording.

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

Book discovery uses [Open Library](https://openlibrary.org/developers/api#usage), with no API key. Search uses `search.json`, requests only title/author/year/cover/ID fields, and starts after three characters with a 300 ms debounce. Search and selected-work requests share a queue with at least 1.1 seconds between request starts per browser tab. Search responses are cached for 30 minutes; descriptions for an hour. Requests cancel when stale, time out after 20 seconds, and honor `Retry-After` on throttled responses. There are no automatic retry loops or background metadata crawls.

Descriptions are fetched once a result is selected using `/works/OL…W.json`. Both string and object descriptions are normalized to plain text. Missing descriptions do not prevent saving a quote. Covers use direct `covers.openlibrary.org` Cover ID URLs with `?default=false`, allowing broken/missing images to fall back to a placeholder. The UI links back to Open Library.

A library book represents an Open Library **work**, not a specific edition. Publication dates are first-publication years; no edition ISBN is inferred from a work's mixed editions. Existing Google Books records are preserved as separate legacy records, rather than being silently merged or relabeled. The additive migration `202610240002_open_library.sql` enables Open Library saves and retains quote saving for existing Google catalog records. Apply pending migrations on an existing local stack using `npx supabase migration up --local` (no reset is required), then run `npm run db:types` after schema changes.

Open Library's default metadata limit is one request/second. Our browser queue is per tab, not a global limit across tabs, devices, or shared IPs. Browsers control the User-Agent, so this static client does not claim the higher identified-client allowance or send a fake contact email. Open Library requests application registration and identification for frequent use; register the deployed application through its developer page. If usage grows, arrange an identified server-side gateway with a real contact address and shared caching/rate limiting before scaling. This implementation remains a static, low-volume, human-driven discovery client; it does not introduce a proxy or bulk ingestion.

No Google Books key or Google Cloud setup is required. Manual book entry remains deferred.

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

Collection quotes have optional **Author or speaker** and **Source** credits. Leaving these blank does not infer the user's identity. Quote text and credits can appear on the public homepage; collection names, notes, references and account details remain private. The public RPC retains its four-field response; `book_title` is also the legacy field name for a custom source.

Use **Move** on a quote to select an existing book or collection, or create a collection. Review/edit the credits before confirming. Moves preserve quote identity, creation date, text, note and reference. Original book attribution is retained even when moving into another book. Changing the source clears its publication year. Moving or deleting the final quote removes the empty library entry; immutable book catalogue records remain.

Apply `supabase/migrations/202610240007_collections.sql` before deploying this frontend. For hosted Supabase, review pending changes with `npx supabase db push --dry-run`, then apply with `npx supabase db push`. Local development uses `npx supabase migration up --local`; no reset is required. `npm run test:db` includes book compatibility, collection ownership, concurrency, credit preservation and public projection checks.

Collection thumbnails show their names, with long names truncated to fit. Creation and **Edit collection** offer compact dropdowns containing 12 coordinated colour swatches for each of the background, icon, text and border, with a preview. Existing collections retain the paper/forest/gold defaults until changed. Colour choices belong to the private collection and never enter public quote attribution. Apply `202610240008_collection_colours.sql` before deploying the colour controls; it keeps previous collection RPCs compatible and validates six-digit hex colours in atomic save/edit/move wrappers.

Collections also have a **Collection icon** dropdown with the original Layers icon plus Music, TV, Book, Speech, Paw print, User, Grinning face, Slightly frowning face, Star and Brush. Choose an icon during creation or Edit collection; existing collections default to Layers. The choice is saved privately and uses the chosen icon colour throughout the library. Apply `202610240009_collection_icons.sql` before deploying the icon picker.

Background, icon, text and border colour controls are temporarily hidden across collection creation, editing and moves. The icon picker stays available. Existing colours, persistence, palette code and styling remain intact; `showColourControls` in `CollectionAppearanceFields.tsx` controls visibility.
