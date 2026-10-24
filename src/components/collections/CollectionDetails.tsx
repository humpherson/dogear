import { findCollectionIcon } from './collectionIcons';
import type { CollectionDraft } from '../../types';
export const defaultAppearance = {
  icon: 'layers' as const,
  background_colour: '#f5f0e6',
  text_colour: '#203b35',
  icon_colour: '#203b35',
  border_colour: '#96713d',
};
export function CollectionCover({
  large = false,
  name,
  ...appearance
}: CollectionDraft & { large?: boolean }) {
  const colours = { ...defaultAppearance, ...appearance };
  const { Icon } = findCollectionIcon(appearance.icon);
  return (
    <div
      className={`collection-cover ${large ? 'large' : ''}`}
      aria-hidden="true"
      style={{
        backgroundColor: colours.background_colour,
        color: colours.text_colour,
        borderColor: colours.border_colour,
      }}
    >
      <Icon
        data-collection-icon={findCollectionIcon(appearance.icon).id}
        size={large ? 54 : 24}
        style={{ color: colours.icon_colour }}
      />
      <span title={name}>{name}</span>
    </div>
  );
}
export function CollectionDetails(collection: CollectionDraft) {
  return (
    <section className="book-details">
      <CollectionCover {...collection} large />
      <div>
        <p className="eyebrow">Collection</p>
        <h2>{collection.name}</h2>
        <p className="muted">A place for words from anywhere.</p>
      </div>
    </section>
  );
}
