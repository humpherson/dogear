# Dogeard security review — 25 October 2026

The tested paths did not expose saved user records to unauthenticated callers or other users. The live database enforces ownership for profiles, library associations, collections, quotations, credits and notes. One client-side account-switch/history disclosure was reproduced and fixed locally; deploy the frontend changes to deliver that fix to the live UI.

This is a point-in-time review of application authorization and user isolation, not a guarantee against every possible attack. Privileged Supabase project operators and service-role credentials remain trusted administrators. No existing users' records were inspected during live probes.

## Confirmed finding and fix

**Medium — private editor state could survive an account switch.** Query caches were scoped correctly, but mounted editor component state could retain the previous account's selected collection and unsaved quote. Returning to an older Add quote history entry could also initialise the editor with another account's collection metadata. Database RLS continued to deny cross-user reads and writes; this was a browser-state disclosure on a shared browser.

Two regression tests reproduced both failures before the change. The fix:

- Keys the protected route outlet by authenticated user ID, resetting private component state on an identity change.
- Associates incoming editor selections with their owner and ignores selections for a different account.
- Passes only collection IDs and owner IDs in new navigation state. Collection metadata comes from a user-scoped cache/query protected by RLS, instead of being copied into browser history.
- Retains same-user selection, cached navigation and unsaved quote behaviour during ordinary reads.

Evidence: [ProtectedRoute](../src/features/auth/ProtectedRoute.tsx), [AddQuotePage](../src/pages/AddQuotePage.tsx), [CollectionPage](../src/pages/CollectionPage.tsx), [unit regression](../src/test/sessionIsolation.test.tsx), and the direct-account-change browser regression in [app.spec.ts](../tests/app.spec.ts).

## Database and RPC review

Exported local and hosted `public` schema definitions without exporting user rows. Their definitions, policies and grants match; the only difference is the order of collection appearance columns. The hosted public schema contains five application tables, no views, and no retired homepage/sample quote function.

- All five tables have RLS enabled. Anonymous callers have no table access.
- Profiles, library associations, collections and quotes use `auth.uid()` ownership rules. Update policies check ownership before and after updates; grants prevent ownership/parent reassignment and direct lifecycle writes.
- Composite foreign keys enforce that a quote's owner matches its book association or collection, even for privileged inserts. Every quote must have exactly one parent.
- Security-definer application functions pin an empty search path. Read helpers explicitly filter by caller; mutation functions derive the owner from `auth.uid()` and check source/destination ownership. Appearance wrappers delegate to ownership-checked operations in the same transaction.
- Client RPC execute grants are restricted to authenticated users. Internal payload/result helpers and trigger functions are not client-callable. The authenticated hero samplers are invoker-rights functions with an explicit caller filter.
- The legacy public quote sampler has been removed locally and on the live project. Direct requests return 404 rather than quotation data.

**Intentional shared data:** signed-in users can read shared bibliographic catalogue metadata in `books` (title, author, publication details, description and cover). It contains no owning user ID, personal quotations, notes or library membership. This does not grant access to another user's library associations. Anonymous catalogue reads are denied. Static homepage editorial entries are deliberately public.

## Live access verification

Confirmed that the linked database project matches the backend configured in the live dogeard.co.uk assets.

Fourteen anonymous/invalid-session probes passed:

- Profiles, quotes, collections, user_books and books: HTTP 401.
- Library listing, both personal samplers and internal helpers: HTTP 401.
- Retired homepage and sample samplers: HTTP 404.
- Invalid bearer session: HTTP 401.
- GraphQL private profile query: error response, with no private collection data. GraphQL is disabled on this project, as confirmed by the authenticated probes below.

Created two temporary, confirmed test accounts without sending signup emails. Used only synthetic collection/quote records and filtered direct-table probes to those accounts' IDs. All 24 checks passed, including cleanup:

- Each caller could read its own profile, collection and quotation, while the other test account's rows were absent.
- Library, hero and nested collection/quote reads remained owner-only. Supplying another account's quote ID to a sampler did not reveal it.
- Cross-user edit, delete, save-into-collection and move-source/destination requests were rejected.
- A direct cross-user quote update changed no rows; the owner's synthetic quote and note remained intact.
- Authenticated GraphQL returned no data because the extension is disabled.
- Both temporary accounts were deleted and their removal verified. Their related records are covered by the existing cascading ownership foreign keys. No shared catalogue fixture was created.

Public auth settings show anonymous sign-in disabled and email auto-confirmation disabled. The latter requires confirmation for ordinary email signup. HTTP redirects to HTTPS. These checks do not establish all hosted auth rate-limit, email delivery, administrator MFA or credential-rotation settings.

## Browser, rendering and credentials

- Private routes require a session. Private query keys include the user ID; identity changes clear the query client. Browser tests cover ordinary sign-out/sign-in and direct identity changes, retained history, forbidden collection URLs and resetting unsaved drafts.
- User quotations, names, credits and notes render as React text. No application use of raw HTML injection was found. Third-party descriptions are normalised to plain text, and cover images use no-referrer requests.
- Auth callback material is consumed and removed from the URL before routes render. Redirect destinations are constrained to internal paths.
- Scanned 92 tracked text files: no privileged Supabase credential literal found; `.env` and `.env.local` are not tracked. Five discovered live JavaScript assets contained no privileged JWT. The deployed Supabase browser key has the anonymous role.
- Production dependency audit reported zero known vulnerabilities. This is a registry result at review time, not a proof that dependencies contain no bugs.

## Follow-up hardening

These are remaining defence-in-depth findings, not a demonstrated bypass of current user ownership controls:

1. **Medium — permissive defaults for future schema objects.** The hosted schema still has Supabase's default automatic grants for newly created public tables, sequences and functions. Existing application objects explicitly revoke these grants and are protected, but a future migration could accidentally expose a new object. Harden default privileges and add a schema-permission regression check before introducing more data surfaces. Account for PostgreSQL's global default PUBLIC execute grant on new functions when designing that migration; a schema-local revoke alone does not remove it.
2. **Low — browser security policy headers.** The observed custom-domain response supplied no CSP, Referrer-Policy, X-Frame-Options, X-Content-Type-Options or HSTS header. No CSP meta policy is present in the app HTML. HTTPS redirection works. Add an appropriate policy through the hosting/CDN configuration and, where supported, HTML meta tags. Test auth redirects, external book APIs, cover images and inline collection styles before enforcing CSP.

## Verification and limits

- 104 unit tests passed, including the two new account/history regressions.
- 182 local database checks passed: 88 book/security checks and 94 collection checks. Added anonymous collection-table denial, internal-helper denial and forged/invalid session checks. GraphQL is disabled locally, so its tests verify closure rather than claiming an enabled-GraphQL ownership test.
- 26 desktop/mobile browser checks passed; four hidden Google discovery checks remain skipped. The new browser case switches directly to another valid test session, checks draft removal and retained history, then probes another account's collection route.
- Lint, typecheck, formatting and root/project builds passed. Results are also recorded in VERIFICATION.md.
- Live checks used synthetic accounts and public access probes. No destructive tests, existing-user account access, password attacks or denial-of-service testing were performed. Older browser history may already contain metadata from earlier app versions; new collection navigation avoids writing that metadata.
- The account-switch fix and the additional requested editor UI changes require frontend deployment. This review made no further hosted schema/configuration changes after the previously verified sampler retirement.

Reference guidance: [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [function security and privileges](https://supabase.com/docs/guides/database/functions), and [anonymous Auth users versus unauthenticated requests](https://supabase.com/docs/guides/auth/auth-anonymous).
