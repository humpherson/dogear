# Live loading review — 25 October 2026

Tested https://dogeard.co.uk/ using the supplied account, with permission to create and retain test entries. Book and collection details reproduced a roughly 320 ms first-use delay even after their JavaScript had downloaded. Add quote responded promptly in the measured runs.

## Live observations

Measurements run from the click to expected DOM content and the following animation frame. They are interaction observations, not INP scores or guarantees that every background request has finished. Mobile tests use Chromium touch/viewport emulation, not a physical phone. The slower profile adds 150 ms network latency, 1.6 Mbps download, 750 kbps upload and 4× CPU slowdown.

| Action                                                           | Observed time               | Feedback                                   |
| ---------------------------------------------------------------- | --------------------------- | ------------------------------------------ |
| Header Sign in                                                   | 45 ms                       | Sign-in form rendered                      |
| Submit Sign in                                                   | 1,061 ms to library heading | Authentication POST took 736 ms            |
| Add quote, fresh-cache desktop/mobile and slower profile         | 27–80 ms                    | Editor rendered                            |
| First book details                                               | 326–342 ms                  | Code spinner appeared within 12–30 ms      |
| First collection details                                         | About 320–330 ms            | Code spinner appeared promptly             |
| Search Open Library for The Jungle Book                          | 3,343 ms including debounce | Search spinner appeared in 9 ms            |
| Create collection, save book quote, edit quote, save extra quote | 78–213 ms                   | Working indicator appeared within 12–13 ms |

No browser JavaScript or console errors were observed. Moving a quote also succeeded (HTTP 200, 85 ms request duration). Its UI timing was excluded because the expected quote text already existed on the source screen.

## Cause and local change

The detail modules were downloaded before the first detail click. Passing a fulfilled native import promise to `React.lazy` still suspends on its first render because React has not yet consumed that promise. React's fallback reveal scheduling produced the repeatable delay. This matches the documented [lazy loading lifecycle](https://react.dev/reference/react/lazy) and [Suspense reveal caveats](https://react.dev/reference/react/Suspense), and the installed production renderer's 300 ms fallback scheduling.

The shared loader now retains the resolved component as well as the import promise. A completed preload renders directly. A pending download still uses the existing accessible spinner, error boundary and navigation cancellation. Only static page code is cached here; private query scopes and account-change isolation remain intact.

This source change is local and requires frontend deployment. No live schema or hosting configuration was changed.

## Controlled production-build comparison

Compared baseline and patched local production builds using real local Supabase and identical synthetic fixtures. Each cell shows the median of three fresh authenticated contexts, followed by the range. Detail code had finished loading and evaluating before first navigation in both versions.

| Profile and first navigation            | Before           | Patched         |
| --------------------------------------- | ---------------- | --------------- |
| Desktop book                            | 343 ms (340–345) | 40 ms (38–43)   |
| Desktop collection                      | 327 ms (327–329) | 28 ms (28–30)   |
| Mobile with 4× CPU slowdown, book       | 353 ms (336–356) | 116 ms (31–136) |
| Mobile with 4× CPU slowdown, collection | 323 ms (321–335) | 26 ms (24–27)   |

All baseline first-use navigations mounted a code spinner; none of the patched, already-preloaded navigations did. These are local comparisons, not measurements of a newly deployed live version. Network-bound authentication, database reads and Open Library searches can still take time.

## Test data and validation

Three explicitly labelled loading-test quotes were retained: two in `Loading checks — 2026-10-25 08:26 UTC`, and one associated with The Jungle Book. Creation, editing, moving, library navigation and mobile navigation were exercised. Existing quotes were not edited or deleted. The test browser session was revoked successfully with local-scope logout, preserving other sessions. Credentials and authentication storage were not written into the report or test scripts.

120 unit tests and 30 desktop/mobile browser tests passed; four tests for hidden Google Books discovery remain skipped. Regression coverage verifies visible feedback for delayed downloads and no code fallback after completed preloads. Temporary local benchmark fixtures were removed after comparison.
