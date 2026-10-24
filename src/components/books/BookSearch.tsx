import { Spinner } from '../ui/LoadingIndicator';
import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import {
  searchCatalogue,
  googleBooksEnabled,
  providerNames,
  type BookProvider,
} from '../../services/booksApi';
import type { BookSearchResult } from '../../types';
import { Cover } from './BookDetails';
import { message } from '../../lib/validation';
export function BookSearch({
  onSelect,
}: {
  onSelect: (book: BookSearchResult) => void;
}) {
  const [input, setInput] = useState(''),
    [term, setTerm] = useState(''),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const id = useId();
  const googleAvailable = googleBooksEnabled();
  const [selectedProvider, setProvider] =
    useState<BookProvider>('open_library');
  const provider = googleAvailable ? selectedProvider : 'open_library';
  const google = provider === 'google_books';
  const Results = google ? 'div' : 'ul';
  useEffect(() => {
    const timer = setTimeout(() => setTerm(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);
  const query = useQuery({
    queryKey: ['book-search', provider, term],
    queryFn: ({ signal }) => searchCatalogue(term, provider, signal),
    enabled: term.length >= 3,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
  const current = input.trim() === term;
  const searching = input.trim().length >= 3 && (!current || query.isFetching);
  const showStatus =
    open ||
    searching ||
    (current && term.length >= 3 && (query.isSuccess || query.isError));
  const results = current ? query.data || [] : [];
  function changeProvider(next: BookProvider) {
    setProvider(next);
    setActive(-1);
    setOpen(true);
  }
  function choose(book: BookSearchResult) {
    onSelect(book);
    setOpen(false);
    setActive(-1);
  }
  return (
    <div
      className="search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      {googleAvailable && (
        <>
          <label htmlFor={`${id}-catalogue`}>Book catalogue</label>
          <select
            id={`${id}-catalogue`}
            value={provider}
            onChange={(event) => {
              changeProvider(event.target.value as BookProvider);
            }}
          >
            <option value="open_library">Open Library</option>
            <option value="google_books">Google Books</option>
          </select>
        </>
      )}
      <label htmlFor={id}>Find a book</label>
      <div className="search-field">
        <span className="search-field-icon" aria-hidden="true">
          {searching ? <Spinner /> : <Search size={20} />}
        </span>
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup={google ? 'grid' : 'listbox'}
          aria-busy={searching}
          aria-describedby={showStatus ? `${id}-status` : undefined}
          aria-expanded={open && results.length > 0}
          aria-controls={`${id}-results`}
          aria-activedescendant={
            open && active >= 0 && results[active]
              ? `${id}-${active}`
              : undefined
          }
          autoComplete="off"
          placeholder="Search by title or author…"
          value={input}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setInput(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (
              (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
              results.length
            ) {
              e.preventDefault();
              setOpen(true);
              setActive((i) =>
                e.key === 'ArrowDown'
                  ? (i + 1) % results.length
                  : (i - 1 + results.length) % results.length,
              );
            }
            if (e.key === 'Enter' && open && active >= 0 && results[active]) {
              e.preventDefault();
              choose(results[active]);
            }
          }}
        />
      </div>
      {showStatus && (
        <>
          <p id={`${id}-status`} className="muted" role="status">
            {input.trim().length < 3
              ? 'Enter at least 3 characters.'
              : searching
                ? `Searching ${providerNames[provider]}…`
                : query.isError
                  ? 'Search couldn’t be completed.'
                  : !results.length
                    ? 'No books found. Try another title or author.'
                    : `${results.length} ${results.length === 1 ? 'book' : 'books'} found.`}
          </p>
          {query.isError && current && (
            <div role="alert">
              {message(query.error)}{' '}
              <button
                type="button"
                className="text-button"
                onClick={() => void query.refetch()}
              >
                Retry search
              </button>
              {google && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => changeProvider('open_library')}
                >
                  Search Open Library instead
                </button>
              )}
            </div>
          )}
        </>
      )}
      <Results
        className="book-search-results"
        id={`${id}-results`}
        role={google ? 'grid' : 'listbox'}
        aria-label={google ? 'Google Books search results' : 'Book results'}
        hidden={!open || !results.length}
      >
        {results.map((book, i) => {
          const content = (
            <>
              <Cover book={book} />
              <div className="book-result-text">
                <strong>{book.title}</strong>
                <span>
                  {book.authors.join(', ') || 'Unknown author'}
                  {book.published_date
                    ? ` · ${book.published_date.slice(0, 4)}`
                    : ''}
                </span>
              </div>
            </>
          );
          return google ? (
            <div
              role="row"
              aria-selected={active === i}
              key={book.source_id}
              className={`google-book-result ${active === i ? 'selected' : ''}`}
            >
              <div role="gridcell" id={`${id}-${i}`}>
                <button
                  className="book-result-choice"
                  type="button"
                  onClick={() => choose(book)}
                >
                  {content}
                </button>
              </div>
              <div role="gridcell">
                <a
                  className="google-result-link"
                  href={`https://books.google.com/books?id=${encodeURIComponent(book.source_id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View {book.title} on Google Books
                </a>
              </div>
            </div>
          ) : (
            <li
              id={`${id}-${i}`}
              role="option"
              aria-selected={active === i}
              key={book.source_id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(book)}
              className={active === i ? 'selected' : ''}
            >
              {content}
            </li>
          );
        })}
      </Results>
      {google && (
        <a
          className="google-attribution"
          href="https://books.google.com/"
          target="_blank"
          rel="noreferrer"
        >
          <img
            src={`${import.meta.env.BASE_URL}powered-by-google.png`}
            alt="Powered by Google"
            width="62"
            height="30"
          />
        </a>
      )}
    </div>
  );
}
