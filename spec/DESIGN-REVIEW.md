# Dogeard design review — 25 October 2026

## Overall direction

The visual identity is coherent and worth retaining: warm paper, forest-green actions, restrained antique-gold details, serif editorial typography and quiet book-shaped objects. It feels like a personal commonplace book. The folded quote card, generous whitespace and understated quote cards give it more character than a generic dashboard.

The opportunity is to apply that direction more consistently as collections and editing flows grow. A redesign or new palette is unnecessary. The most useful next step is a small pass over mobile content hierarchy, page identity and repeated UI patterns.

## Scope and evidence

Inspected current source and a local production build at 320×568, 390×844, 768×1024 and 1440×900 in Chromium. Captured 68 screens covering the homepage, sign-in, populated library, book and collection details, long names, picker panels, collection creation/customisation, quotation entry, validation, inline editing, move and delete dialogs. Temporary local accounts, books and collections were removed afterwards. No live account data was used or changed.

The personal hero used a deterministic synthetic response; book fixtures used the no-cover state. Actual cover artwork, all possible hero lengths, real phone keyboards, Safari, Android and screen readers were not exhaustively reviewed. Measurements describe this fixture content, not every possible library. No horizontal page overflow occurred in the captured screens. Earlier functional findings are recorded separately in [UI-REVIEW.md](UI-REVIEW.md); hidden colour controls and the previously deferred palette changes remain outside this work.

Screenshots linked below show the review baseline, before the separately requested Add quote label/icon update. They contain synthetic data only.

## Findings and recommendations

### 1. Medium — mobile book metadata competes with the saved quotes

The book detail layout keeps the cover and all metadata side by side on mobile. At 390 px, a 320-character description is squeezed into a 235 px text column. The “Your quotes” heading starts around 705 px down the document; the first quote appears below the initial viewport. The comparable collection heading starts around 475 px. The description is now bounded and does not internally scroll, but the reading hierarchy still gives secondary bibliographic information substantial prominence.

Use a compact cover/title/author row on mobile, with the description spanning the available width below it. Consider a collapsed, optional description on saved-book pages so the user's quotations remain the main destination. Keep the existing 320-character cap and full stored metadata. Any expansion should occur in normal document flow, respecting the request to avoid internal description scrolling.

Evidence: [mobile book](design-review/390-book.png), [mobile collection](design-review/390-collection.png). Source: `src/components/books/BookDetails.tsx`, `.book-details` and its mobile rules in `src/index.css`.

Acceptance: at 390 px, a normal saved-book title/author and the quote-section heading should be visible together without a narrow description column dominating the page. Check both missing covers and real covers.

### 2. Medium — page identity and language vary between contexts

Saved book details still say “Your next dogeard”, reusing the discovery/selection component. This makes an existing library item sound prospective. The book/collection name is an `h2`, while the generic “Your quotes” label is the route's `h1`; on mobile the latter is larger (32 px versus 25.6 px). The collection page also has a standalone Edit collection button between its summary and the quote-section heading, producing a different action rhythm from books.

Give each detail page a shared header pattern: entry type, entry name as the primary heading, supporting attribution, then secondary metadata/actions. Use “Your quotes” as the next-level section heading. Make the discovery eyebrow contextual rather than reusing it for saved entries. Group Edit collection with the collection's metadata actions while preserving Add quote as the prominent creation action.

Evidence: [book](design-review/390-book.png), [collection](design-review/390-collection.png). Source: `src/pages/BookPage.tsx`, `src/pages/CollectionPage.tsx`, `BookDetails.tsx`, `CollectionDetails.tsx`.

Acceptance: book and collection pages should have the same visual and semantic heading hierarchy; saved items should not read as future selections.

### 3. Medium — the mobile writing flow has more supporting UI than it needs

Before selection, the editor's right-hand placeholder repeats “First, choose a book or collection” and explains choices already present in the accordion. On mobile it becomes a large separate card after the picker. Once a collection is selected, four optional fields follow the quotation textarea before Save: author/speaker, source, reference and note. The full writing page is about 1,538 px tall at 390 px with empty fields. The earlier compact collection summary and automatic focus are good improvements, but optional metadata still contributes heavily to the form's visual weight.

On mobile, replace the preselection placeholder card with a brief inline instruction or omit the duplicate instruction. Keep the quotation field and save action prominent. Consider an optional “Add attribution and details” disclosure for secondary fields; keep existing values discoverable when editing and preserve drafts when toggling it. Retain the expanded library list: this recommendation does not reintroduce its internal scrolling.

Evidence: [book discovery](design-review/390-find-book.png), [selected collection and writing form](design-review/390-write-quote.png), [desktop picker](design-review/1440-choose-library.png). Source: `src/pages/AddQuotePage.tsx`, `src/components/quotes/QuoteForm.tsx`.

Acceptance: a user should be able to write and save a simple quotation without navigating through every optional field, on both a short phone viewport and desktop.

### 4. Medium — the library hero has no content-height strategy

The full-width hero is an appropriate editorial feature and its alignment with the library content is consistent. However, `LibraryQuoteHero` renders the entire quote with preserved whitespace, while quote validation permits 10,000 characters. A long passage or many line breaks can push the library heading, creation button and grid far down the page. This is a source-confirmed content risk; the captured hero used a short fixture and does not visually reproduce the maximum-length case.

Retain the full-width hero, but define an excerpt treatment for long passages with an explicit way to read the complete quote. A modest line limit with a Read full quote action could preserve access while preventing a long passage from dominating every library visit. Avoid a nested scroll area, and do not shorten stored text. This recommendation concerns the signed-in library hero, not the public homepage's full static quote.

Source: `src/components/quotes/LibraryQuoteHero.tsx`, `.library-quote-hero blockquote` in `src/index.css`, `quoteSchema` in `src/lib/validation.ts`.

Acceptance: test a short line, a multi-paragraph passage and the valid maximum-length quote at 320, 390 and 1440 px. The library must remain easy to reach, with full text available deliberately.

### 5. Low — public onboarding still describes a predominantly book-only product

The homepage eyebrow says “A home for your reading life”, its first feature is “Find your book”, and sign-in says “Your reading space”. Collections support conversations, original thoughts and lyrics, but that breadth is mostly communicated later. Signup's “Begin your collection” also uses the same noun as a specific named collection inside the product.

Keep the literary tone while explicitly introducing both routes: keep words from a book or gather words from anywhere in a collection. Use “library” for the overall saved space and reserve “collection” for the named non-book entry. This is a copy-consistency improvement, not a request to replace all evocative language with literal labels.

Evidence: [desktop homepage](design-review/1440-home.png), [small-phone homepage](design-review/320-home.png). Source: `src/pages/LandingPage.tsx`, `src/pages/AuthPage.tsx`.

The owner-supplied homepage quotations also establish an adult, irreverent first impression through explicit language. That can be intentional, but it is a different emphasis from the calm visual styling. Treat the choice as an editorial brand decision; the supplied quote content was not changed in this review.

### 6. Low — small type and scattered style values weaken the system as it grows

The UI has a useful serif/sans distinction, but recurring supporting text uses several nearby sizes: 10.4 px eyebrows, 11.2 px quote counts/date metadata, 12 px hints and 12.8/13.6 px descriptions. Collection cover names shrink to 8.8 px on mobile. The repeated full collection title remains readable outside the thumbnail, so the thumbnail text is decorative rather than the only label. Nevertheless, the smallest type is difficult to read comfortably.

Define a small type scale for page titles, section titles, body, supporting text and decorative labels. Prefer at least 12–13 px for useful metadata while preserving 16 px form inputs. Consider icon-only small collection covers instead of very small truncated lettering. Use explicit tokens for muted text, borders, surfaces, spacing and corner radii; currently many near-equivalent values are repeated directly in `src/index.css`. Consolidate styles gradually rather than applying a broad restyle.

Acceptance: essential labels and metadata should remain comfortable at mobile sizes without zooming. Books, collections, pickers and dialogs should use the same supporting-text and surface rules.

## Requested action consistency — implemented locally

The review baseline used “Add a quote”, “Add another quote” and “Add quote”, and the mobile header hid the plus icon. At the user's request, quote-adding controls now consistently say **Add quote** with a leading decorative plus icon: header, library heading, empty library, book detail and collection detail. The header retains its icon on mobile. Existing destinations, selected-entry context and mutation behaviour are preserved.

Other recommendations above remain review findings, not implemented changes.

## What to preserve

- The paper/forest/gold/ink identity, serif editorial titles and wordmark.
- The homepage's folded-paper quote motif and restrained depth. Avoid extending decorative rotation to functional editor panels or dialogs.
- The shared book/collection thumbnail dimensions and comfortable card spacing.
- The full-width library hero, with a deliberate long-content treatment added separately.
- Strong, labelled primary actions; bordered secondary actions; separated destructive actions.
- The prior mobile fixes: 44 px navigation/actions, long-title wrapping, compact selected-collection summary, persistent dialog footers and draft-preserving nested chooser behaviour.
- Accessible focus styling, reduced-motion handling, visible request feedback and the library picker's single page scroll.

## Suggested order

1. Compact mobile book details and standardise book/collection page headers together.
2. Simplify the mobile writing form and duplicate preselection instructions.
3. Add the library hero's long-passage treatment and content-boundary checks.
4. Align onboarding copy, supporting typography and shared tokens.

Validate those changes with short and long real-world content, actual cover images and physical phones before considering a wider visual redesign.
