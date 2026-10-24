import { useId, useRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

type AccordionItem = { value: string; title: string; content: ReactNode };

// One panel stays open. Native buttons provide Enter/Space; arrow keys and
// Home/End move between headings without changing the user's selection.
export function Accordion({
  items,
  value,
  onValueChange,
}: {
  items: AccordionItem[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  const id = useId();
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="accordion">
      {items.map((item, index) => {
        const expanded = item.value === value;
        const triggerId = `${id}-${item.value}-trigger`,
          panelId = `${id}-${item.value}-panel`;
        return (
          <section className="accordion-item" key={item.value}>
            <h2 className="accordion-heading">
              <button
                ref={(node) => {
                  triggers.current[index] = node;
                }}
                id={triggerId}
                type="button"
                className="accordion-trigger"
                aria-expanded={expanded}
                aria-disabled={expanded || undefined}
                aria-controls={panelId}
                onClick={() => onValueChange(item.value)}
                onKeyDown={(event) => {
                  const next =
                    event.key === 'ArrowDown'
                      ? (index + 1) % items.length
                      : event.key === 'ArrowUp'
                        ? (index - 1 + items.length) % items.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? items.length - 1
                            : null;
                  if (next !== null) {
                    event.preventDefault();
                    triggers.current[next]?.focus();
                  }
                }}
              >
                <span>{item.title}</span>
                <ChevronDown size={20} aria-hidden="true" />
              </button>
            </h2>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              hidden={!expanded}
              className="accordion-panel"
              onFocusCapture={() => onValueChange(item.value)}
            >
              {expanded ? item.content : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
