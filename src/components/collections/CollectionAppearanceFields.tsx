import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { CollectionAppearance } from '../../types';
import { collectionIcons, findCollectionIcon } from './collectionIcons';
import { defaultAppearance } from './CollectionDetails';
// Temporarily hide colour controls; retain their UI and saved-colour behaviour.
const showColourControls = false;
const palette = [
  ['Paper', '#f5f0e6'],
  ['Sand', '#eee0d0'],
  ['Sage', '#d4e4d0'],
  ['Moss', '#64825a'],
  ['Forest', '#203b35'],
  ['Ink', '#342a20'],
  ['Gold', '#96713d'],
  ['Clay', '#b8775e'],
  ['Rose', '#d8a7a0'],
  ['Plum', '#73546b'],
  ['Slate', '#657887'],
  ['Mist', '#d7e3e8'],
] as const;
export function CollectionAppearanceFields({
  value,
  onChange,
  disabled = false,
}: {
  value: CollectionAppearance;
  onChange: (value: CollectionAppearance) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLFieldSetElement>(null);
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('click', closeOutside);
    return () => document.removeEventListener('click', closeOutside);
  }, [open]);
  const selectedIcon = findCollectionIcon(value.icon);
  const iconExpanded = open === 'icon' && !disabled;
  const closeIcon = () => {
    setOpen(null);
    triggers.current.icon?.focus();
  };
  return (
    <fieldset ref={root} className="collection-colours" disabled={disabled}>
      <legend>Collection appearance</legend>
      <fieldset
        className="colour-choice"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && iconExpanded) {
            event.preventDefault();
            event.stopPropagation();
            closeIcon();
          }
        }}
      >
        <legend>Collection icon</legend>
        <button
          type="button"
          className="colour-dropdown-trigger"
          ref={(node) => {
            triggers.current.icon = node;
          }}
          aria-label={`Collection icon: ${selectedIcon.name}`}
          aria-expanded={iconExpanded}
          aria-controls={`${id}-icons`}
          onClick={() => setOpen(iconExpanded ? null : 'icon')}
        >
          <selectedIcon.Icon size={24} aria-hidden="true" />
          <span>{selectedIcon.name}</span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        <div
          className="colour-dropdown-panel"
          id={`${id}-icons`}
          hidden={!iconExpanded}
        >
          <div className="collection-icon-options">
            {collectionIcons.map(({ id: iconId, name, Icon }) => (
              <label className="collection-icon-option" key={iconId}>
                <input
                  type="radio"
                  name={`${id}-icon`}
                  aria-label={name}
                  value={iconId}
                  checked={selectedIcon.id === iconId}
                  onClick={() => {
                    if (selectedIcon.id === iconId) closeIcon();
                  }}
                  onChange={() => {
                    onChange({ ...value, icon: iconId });
                    closeIcon();
                  }}
                />
                <Icon size={24} aria-hidden="true" />
                <span>{name}</span>
                <span className="collection-icon-check" aria-hidden="true">
                  ✓
                </span>
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      {(
        [
          ['background_colour', 'Background colour'],
          ['icon_colour', 'Icon colour'],
          ['text_colour', 'Text colour'],
          ['border_colour', 'Border colour'],
        ] as const
      ).map(([key, label]) => {
        const selected = value[key] || defaultAppearance[key];
        const selectedName =
          palette.find(
            ([, colour]) => colour === selected.toLowerCase(),
          )?.[0] || 'Saved colour';
        const expanded = open === key && !disabled;
        return (
          <fieldset
            hidden={!showColourControls}
            className="colour-choice"
            key={key}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && expanded) {
                event.preventDefault();
                event.stopPropagation();
                setOpen(null);
                triggers.current[key]?.focus();
              }
            }}
          >
            <legend>{label}</legend>
            <button
              type="button"
              className="colour-dropdown-trigger"
              ref={(node) => {
                triggers.current[key] = node;
              }}
              aria-label={`${label}: ${selectedName}`}
              aria-expanded={expanded}
              aria-controls={`${id}-${key}-swatches`}
              onClick={() => setOpen(expanded ? null : key)}
            >
              <span
                className="colour-dropdown-preview"
                style={{ backgroundColor: selected }}
                aria-hidden="true"
              />
              <span>{selectedName}</span>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
            <div
              id={`${id}-${key}-swatches`}
              className="colour-dropdown-panel"
              hidden={!expanded}
            >
              {selectedName === 'Saved colour' && (
                <p className="hint">
                  Your saved colour is kept until you choose a swatch.
                </p>
              )}
              <div className="colour-swatches">
                {palette.map(([name, colour]) => (
                  <label className="colour-swatch" key={colour} title={name}>
                    <input
                      type="radio"
                      aria-label={name}
                      name={`${id}-${key}`}
                      value={colour}
                      checked={selected.toLowerCase() === colour}
                      onClick={() => {
                        if (selected.toLowerCase() === colour) {
                          setOpen(null);
                          triggers.current[key]?.focus();
                        }
                      }}
                      onChange={() => {
                        onChange({ ...value, [key]: colour });
                        setOpen(null);
                        triggers.current[key]?.focus();
                      }}
                    />
                    <span
                      className="colour-swatch-fill"
                      style={{ backgroundColor: colour }}
                      aria-hidden="true"
                    />
                    <span className="colour-swatch-check" aria-hidden="true">
                      ✓
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </fieldset>
        );
      })}
    </fieldset>
  );
}
