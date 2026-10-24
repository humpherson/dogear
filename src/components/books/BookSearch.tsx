import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { searchBooks } from '../../services/booksApi';
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
  useEffect(() => {
    const timer = setTimeout(() => setTerm(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);
  const query = useQuery({
    queryKey: ['book-search', 'open_library', term],
    queryFn: ({ signal }) => searchBooks(term, signal),
    enabled: term.length >= 3,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
  const current = input.trim() === term;
  const results = current ? query.data || [] : [];
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
      <label htmlFor={id}>Find a book</label>
      <div className="search-field">
        <Search size={20} aria-hidden="true" />
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
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
      {open && (
        <>
          <p className="muted" role="status">
            {input.trim().length < 3
              ? 'Enter at least 3 characters.'
              : !current || query.isFetching
                ? 'Searching books…'
                : !query.isError && !results.length
                  ? 'No books found. Try another title or author.'
                  : `${results.length} books found.`}
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
            </div>
          )}
        </>
      )}
      <ul
        id={`${id}-results`}
        role="listbox"
        aria-label="Book results"
        hidden={!open || !results.length}
      >
        {results.map((book, i) => (
          <li
            id={`${id}-${i}`}
            role="option"
            aria-selected={active === i}
            key={book.source_id}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(book)}
            className={active === i ? 'selected' : ''}
          >
            <Cover book={book} />
            <div>
              <strong>{book.title}</strong>
              <span>
                {book.authors.join(', ') || 'Unknown author'}
                {book.published_date
                  ? ` · ${book.published_date.slice(0, 4)}`
                  : ''}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="hint">
        Books supplied by{' '}
        <a href="https://openlibrary.org" target="_blank" rel="noreferrer">
          Open Library
        </a>
        . Manual book entry is not available yet.
      </p>
    </div>
  );
}
