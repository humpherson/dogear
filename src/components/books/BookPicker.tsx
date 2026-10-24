import { LoadingIndicator } from '../ui/LoadingIndicator';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../features/auth/AuthProvider';
import { libraryQueryOptions } from '../../features/library/libraryQuery';
import { message, collectionNameSchema } from '../../lib/validation';
import {
  type SelectedBook,
  type CollectionEntry,
  type CollectionDraft,
  type CollectionAppearance,
  isCollection,
} from '../../types';
import { Cover } from './BookDetails';
import { CollectionAppearanceFields } from '../collections/CollectionAppearanceFields';
import { CollectionCover } from '../collections/CollectionDetails';
import { BookSearch } from './BookSearch';
import { Accordion } from '../ui/Accordion';
export function BookPicker({
  onSelect,
  onSelectCollection,
}: {
  onSelect: (book: SelectedBook, userBookId?: string) => void;
  onSelectCollection?: (collection: CollectionEntry | CollectionDraft) => void;
}) {
  const { session } = useAuth();
  const [filter, setFilter] = useState(''),
    [chosenSection, setChosenSection] = useState<string | null>(null),
    [name, setName] = useState(''),
    [nameError, setNameError] = useState('');
  const id = useId(),
    library = useQuery(libraryQueryOptions(session?.user.id));
  const activeSection =
    chosenSection ?? (library.data?.length ? 'library' : 'new');
  const term = filter.trim().toLocaleLowerCase();
  const matches =
    library.data?.filter((entry) =>
      (isCollection(entry)
        ? entry.name
        : `${entry.books.title} ${entry.books.authors.join(' ')}`
      )
        .toLocaleLowerCase()
        .includes(term),
    ) || [];
  const [appearance, setAppearance] = useState<CollectionAppearance>({});
  return (
    <div className="book-picker">
      {activeSection === 'new' && library.isPending && (
        <LoadingIndicator>Loading your library…</LoadingIndicator>
      )}
      {activeSection === 'new' && library.isError && (
        <p role="status" className="hint">
          Your library couldn’t be loaded. You can still find a new book or
          create a collection.
        </p>
      )}
      <Accordion
        value={activeSection}
        onValueChange={setChosenSection}
        items={[
          {
            value: 'library',
            title: 'Choose from your library',
            content: (
              <>
                <p className="muted">
                  Keep another passage in a book or collection you’ve already
                  saved.
                </p>
                {library.isPending ? (
                  <LoadingIndicator>Loading your books…</LoadingIndicator>
                ) : library.isError ? (
                  <div role="alert">
                    {message(library.error)}{' '}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => void library.refetch()}
                    >
                      Retry library
                    </button>
                  </div>
                ) : !library.data.length ? (
                  <p className="hint">
                    Your library is empty. Find a new book or create a
                    collection to begin.
                  </p>
                ) : (
                  <>
                    <label htmlFor={`${id}-filter`}>Filter your library</label>
                    <input
                      id={`${id}-filter`}
                      type="search"
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                      placeholder="Title, author or collection…"
                    />
                    {matches.length ? (
                      <ul
                        className="library-picker-list"
                        aria-label="Books and collections in your library"
                      >
                        {matches.map((entry) => (
                          <li
                            key={`${isCollection(entry) ? 'collection' : 'book'}-${entry.id}`}
                          >
                            <button
                              type="button"
                              className="library-book-choice"
                              onClick={() =>
                                isCollection(entry)
                                  ? onSelectCollection?.(entry)
                                  : onSelect(entry.books, entry.id)
                              }
                            >
                              <span className="sr-only">Choose</span>{' '}
                              <span aria-hidden="true">
                                {isCollection(entry) ? (
                                  <CollectionCover {...entry} />
                                ) : (
                                  <Cover book={entry.books} />
                                )}
                              </span>
                              <span className="library-book-label">
                                <strong>
                                  {isCollection(entry)
                                    ? entry.name
                                    : entry.books.title}
                                </strong>{' '}
                                <span>
                                  {isCollection(entry)
                                    ? 'Collection'
                                    : entry.books.authors.join(', ') ||
                                      'Unknown author'}
                                </span>{' '}
                                <span className="muted">
                                  {entry.quotes[0]?.count || 0}{' '}
                                  {(entry.quotes[0]?.count || 0) === 1
                                    ? 'quote'
                                    : 'quotes'}{' '}
                                  kept
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p role="status" className="hint">
                        No saved books or collections match “{filter}”. Try
                        another title or author, find a new book, or create a
                        collection.
                      </p>
                    )}
                  </>
                )}
              </>
            ),
          },
          {
            value: 'new',
            title: 'Find a new book',
            content: <BookSearch onSelect={onSelect} />,
          },
          {
            value: 'collection',
            title: 'Create a collection',
            content: (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const parsed = collectionNameSchema.safeParse(name);
                  if (!parsed.success) {
                    setNameError(parsed.error.issues[0].message);
                    return;
                  }
                  setNameError('');
                  onSelectCollection?.({ name: parsed.data, ...appearance });
                }}
              >
                <p className="muted">
                  Keep original thoughts, lyrics and lines from anywhere. Your
                  collection appears when you save its first quote.
                </p>
                <label htmlFor={`${id}-collection`}>Collection name</label>
                <input
                  id={`${id}-collection`}
                  value={name}
                  maxLength={120}
                  onChange={(event) => {
                    setName(event.target.value);
                    setNameError('');
                  }}
                  aria-invalid={!!nameError}
                  aria-describedby={nameError ? `${id}-name-error` : undefined}
                  placeholder="e.g. Lines that stay with me"
                />
                {nameError && (
                  <p role="alert" id={`${id}-name-error`}>
                    {nameError}
                  </p>
                )}
                <details className="collection-customise">
                  <summary>Customise collection</summary>
                  <CollectionAppearanceFields
                    value={appearance}
                    onChange={setAppearance}
                  />
                </details>
                <button type="submit">Use this collection</button>
              </form>
            ),
          },
        ]}
      />
    </div>
  );
}
