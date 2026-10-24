import { LoadingIndicator } from '../ui/LoadingIndicator';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../features/auth/AuthProvider';
import { libraryQueryOptions } from '../../features/library/libraryQuery';
import { message } from '../../lib/validation';
import type { SelectedBook } from '../../types';
import { Cover } from './BookDetails';
import { BookSearch } from './BookSearch';
import { Accordion } from '../ui/Accordion';

export function BookPicker({
  onSelect,
}: {
  onSelect: (book: SelectedBook, userBookId?: string) => void;
}) {
  const { session } = useAuth();
  const [filter, setFilter] = useState('');
  const [chosenSection, setChosenSection] = useState<string | null>(null);
  const id = useId();
  const library = useQuery(libraryQueryOptions(session?.user.id));
  const activeSection =
    chosenSection ?? (library.data?.length ? 'library' : 'new');
  const term = filter.trim().toLocaleLowerCase();
  const matches =
    library.data?.filter(({ books }) =>
      `${books.title} ${books.authors.join(' ')}`
        .toLocaleLowerCase()
        .includes(term),
    ) || [];
  return (
    <div className="book-picker">
      {activeSection === 'new' && library.isPending && (
        <LoadingIndicator>Loading your library…</LoadingIndicator>
      )}
      {activeSection === 'new' && library.isError && (
        <p role="status" className="hint">
          Your library couldn’t be loaded. You can still find a new book.
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
                  Keep another passage from a book you’ve already saved.
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
                    No books in your library yet. Open Find a new book to start
                    your collection.
                  </p>
                ) : (
                  <>
                    <label htmlFor={`${id}-filter`}>Filter your library</label>
                    <input
                      id={`${id}-filter`}
                      type="search"
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                      placeholder="Title or author…"
                    />
                    {matches.length ? (
                      <ul
                        className="library-picker-list"
                        aria-label="Books in your library"
                      >
                        {matches.map((entry) => (
                          <li key={entry.id}>
                            <button
                              type="button"
                              className="library-book-choice"
                              onClick={() => onSelect(entry.books, entry.id)}
                            >
                              <span className="sr-only">Choose</span>{' '}
                              <span aria-hidden="true">
                                <Cover book={entry.books} />
                              </span>
                              <span className="library-book-label">
                                <strong>{entry.books.title}</strong>{' '}
                                <span>
                                  {entry.books.authors.join(', ') ||
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
                        No saved books match “{filter}”. Try another title or
                        author, or open Find a new book.
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
        ]}
      />
    </div>
  );
}
