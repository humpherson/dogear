import type { Quote } from '../../types';
export type ItemFilter = 'all' | 'quote' | 'definition';
export function matchesItem(item: Quote, type: ItemFilter, query: string) {
  return (
    (type === 'all' || (item.item_type || 'quote') === type) &&
    `${item.term || ''} ${item.text}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase())
  );
}
export function ItemFilters({
  value,
  onChange,
}: {
  value: ItemFilter;
  onChange: (type: ItemFilter) => void;
}) {
  return (
    <div role="group" aria-label="Filter by type" className="item-type-switch">
      {(['all', 'quote', 'definition'] as const).map((type) => (
        <button
          key={type}
          type="button"
          aria-pressed={value === type}
          onClick={() => onChange(type)}
        >
          {type === 'all' ? 'All' : type === 'quote' ? 'Quotes' : 'Definitions'}
        </button>
      ))}
    </div>
  );
}
