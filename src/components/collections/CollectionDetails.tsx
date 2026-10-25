import type { ReactNode } from 'react';
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
export function CollectionDetails({
  primary = false,
  actions,
  ...collection
}: CollectionDraft & { primary?: boolean; actions?: ReactNode }) {
  const Heading = primary ? 'h1' : 'h2';
  return (
    <section
      className={`book-details entry-details ${primary ? 'saved-entry' : 'selected-entry'}`}
    >
      <CollectionCover {...collection} large />
      <div className="entry-identity">
        <p className="eyebrow">Collection</p>
        <Heading>{collection.name}</Heading>
        <p className="muted">A place for words from anywhere.</p>
        {actions && <div className="entry-actions">{actions}</div>}
      </div>
    </section>
  );
}
