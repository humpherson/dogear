# Dogeard UI review — 24 October 2026

Reviewed the current local app at 320×568, 390×844, 768×1024 and 1440×900 in Chromium. Used temporary local accounts, books and collections; all fixtures were removed. No repository files were changed. The existing production desktop/mobile browser suite passed all 22 tests, including its accessibility checks. Visual/manual measurements add findings not covered by that suite.

## Implementation follow-up — 25 October 2026

Findings 1–5 have implementation changes and browser regression coverage in `tests/app.spec.ts`:

- Shrinkable library/editor grids, wrapping detail titles and three-line card titles handle valid 120-character unbroken names.
- The dialog Escape guard lets an open icon chooser close first, preserving the draft and restoring trigger focus.
- Optional appearance is collapsed under “Customise collection”; the mobile selected-collection summary is compact and selecting a collection focuses and scrolls to the quote input.
- Navigation and quote actions have at least 44×44 px targets, with a deliberate mobile action row and separated Delete action.
- Edit/move dialogs have scrolling form bodies and persistent action footers; edit previews are compact.

The original findings below remain as the review record. Section 6 is explicitly excluded from this work: colour controls remain hidden, saved colours and palette behaviour are unchanged. Real on-screen keyboard, iOS/Android and assistive-technology verification remains outstanding as described under Coverage limits.

## 1. High: valid long names cause horizontal overflow

A 110-character collection name without spaces is accepted. At a 320 px viewport its detail page becomes 1,544 px wide. At 768 px the library grid becomes 1,679 px wide; at 1440 px it becomes 1,799 px wide and pushes other cards off screen. Mobile library cards wrap the name, but the full collection heading does not; desktop grid tracks also retain their minimum content width.

Relevant code: `src/index.css:437`, `src/index.css:507`, `src/index.css:887`.

Fix: use shrinkable grid tracks and flex children, wrap full titles at all breakpoints, and constrain card titles to a small number of lines while keeping the full title available on the detail screen. Do not rely on the existing thumbnail ellipsis to constrain surrounding text.

Evidence: [mobile detail](320-long-name.png), [tablet library](768-library.png), [desktop library](1440-library.png).

Acceptance: a valid 120-character unbroken name must not create horizontal scrolling on any tested screen.

## 2. High: Escape in the icon menu discards the edit draft

Open Edit collection, change its name without saving, open Collection icon, then press Escape. The whole dialog closes, rather than only the icon menu. Reopening restores the saved name and loses the draft. Reproduced at every screen width; the focused element before Escape was the icon trigger. The dropdown's bubbling key handler does not prevent the enclosing Radix dialog from dismissing.

Relevant code: `src/components/collections/CollectionAppearanceFields.tsx:52`, `src/pages/CollectionPage.tsx:88`.

Fix: make the open dropdown consume Escape at the dialog dismissal layer; only a subsequent Escape should dismiss the collection dialog. Preserve the in-progress form when closing a nested chooser.

Evidence: [verification measurements](verification.json).

Acceptance: Escape closes the nested menu, preserves the dialog and draft, and returns focus to the trigger.

## 3. Medium: appearance precedes the main quote-writing task on mobile

After choosing a new collection, the quote form begins 1,213 px down the page at 390×844 and 1,244 px at 320×568. The name and appearance controls are repeated after the initial collection-selection step. Users must pass the preview, name and five appearance dropdowns before writing. The existing desktop side-by-side layout avoids this problem.

Relevant code: `src/pages/AddQuotePage.tsx:97`, `src/pages/AddQuotePage.tsx:200`, `src/index.css:870`.

Fix: place the quotation input directly after a compact selected-collection summary on mobile. Collapse optional appearance customisation behind “Customise collection”, and avoid asking for the same metadata twice. Focus/scroll to the quote input after selecting the collection.

Evidence: [390 px quote creation](390-write-quote.png), [320 px quote creation](320-write-quote.png).

Acceptance: selecting a collection brings the writing field into view without navigating past the expanded appearance form.

## 4. Medium: frequent actions have small mobile touch targets

At 390 px the Library, Add quote and Sign out header controls are about 20 px high, with 12 px text. Quote Edit, Move and Delete controls are about 30 px high. The 44 px swatches are more comfortable than these frequently used controls. At 320 px Delete wraps onto a second row.

Relevant code: `src/index.css:159`, `src/index.css:167`, `src/index.css:730`, `src/index.css:812`.

Fix: provide at least 44×44 px comfortable target areas for these controls, with a deliberate compact mobile navigation/action layout. Preserve visible labels and separate Delete from routine actions.

Evidence: [mobile library](390-library.png), [small-phone quote actions](320-collection.png), [measurements](measurements.json).

Acceptance: primary navigation and quote actions retain usable targets at 320 px without collisions or accidental activation.

## 5. Medium: Save and Cancel disappear below long dialog content

At 320×568, Edit collection contains 1,140 px of content inside a 528 px-tall dialog. Save and Cancel sit below its initial visible area. Opening icons increases content height to 1,552 px. This also affects move-to-new-collection, which combines destination, appearance and credits. The large thumbnail preview adds height before the actions. At desktop 1440×900, the edit dialog still has 1,054 px of content inside 860 px.

Relevant code: `src/pages/CollectionPage.tsx:132`, `src/pages/CollectionPage.tsx:139`, `src/components/quotes/MoveQuoteDialog.tsx`, `src/index.css:751`, `src/index.css:1017`.

Fix: keep dialog actions in a sticky footer outside the scrolling content, use a compact preview, and collapse appearance options. A mobile sheet layout can use the available screen more efficiently.

Evidence: [320 px edit dialog](320-edit-collection.png), [390 px edit dialog](390-edit-collection.png), [move dialog](390-move-quote.png).

Acceptance: users can reach Save/Cancel while editing or choosing appearance, with the focused field remaining visible. Verify again with a real on-screen keyboard.

## 6. Low: palette choices can hide the thumbnail's content

Paper can be selected for background, icon, text and border simultaneously. All four then resolve to rgb(245, 240, 230), making the icon/name/border indistinguishable from their background. The separate collection title remains readable, but the personalised thumbnail loses its visual identity.

Relevant code: `src/components/collections/CollectionDetails.tsx:21`, `src/components/collections/CollectionAppearanceFields.tsx`.

Fix: offer contrast-safe combinations/defaults or help users keep readable text and icon colours when changing the background. Retain the live preview.

Evidence: [preview](390-low-contrast.png), [computed colours](verification.json).

## What is working

- Core book/collection creation, editing, moving and deletion flows pass the existing browser suite.
- Standard-length content fits the tested viewports without page-wide overflow.
- Book and collection thumbnails share dimensions.
- Colour swatches and icon choices have comfortable targets and accessible labels.
- Dropdowns close after selection and preserve the chosen value after reload.
- Forms use 16 px input text, and show loading, validation and error states.
- The modal itself fits within the viewport and allows internal scrolling.

## Coverage limits

This review used local fixture data and Chromium desktop/mobile emulation. It does not establish behaviour on real iOS Safari, Android browsers, virtual keyboards, VoiceOver or TalkBack. Those device checks should follow the layout fixes. The four-screen visual audit and two focused reproduction checks are recorded in `measurements.json` and `verification.json`.
