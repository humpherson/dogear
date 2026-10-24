// Radix's document capture listener may run before the chooser's listener.
// Prevent dialog dismissal there; the chooser then closes and restores focus.
export function protectCollectionChooserEscape(event: KeyboardEvent) {
  if (
    (event.target as Element | null)
      ?.closest('.dialog')
      ?.querySelector('.colour-dropdown-trigger[aria-expanded="true"]')
  )
    event.preventDefault();
}
