import { Plus } from 'lucide-react';
import { LoadingIndicator } from '../components/ui/LoadingIndicator';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import {
  bookQueryOptions,
  quotesQueryOptions,
  cachedBook,
} from '../features/library/libraryQuery';
import { BookDetails } from '../components/books/BookDetails';
import { QuoteCard } from '../components/quotes/QuoteCard';
import { message } from '../lib/validation';
export function BookPage() {
  const { userBookId = '' } = useParams(),
    { session } = useAuth(),
    navigate = useNavigate();
  const client = useQueryClient();
  const [filter, setFilter] = useState('');
  const book = useQuery(bookQueryOptions(session?.user.id, userBookId));
  const quotes = useQuery(quotesQueryOptions(session?.user.id, userBookId));
  const entry =
    book.isSuccess && !book.data
      ? null
      : (book.data ?? cachedBook(client, session?.user.id, userBookId));
  if (!entry && book.isPending)
    return <LoadingIndicator>Opening your book…</LoadingIndicator>;
  if (!entry && book.isError)
    return (
      <div role="alert">
        {message(book.error)}{' '}
        <button onClick={() => void book.refetch()}>Try again</button>
      </div>
    );
  if (!entry)
    return (
      <section className="empty">
        <h1>Book not found</h1>
        <p>This book isn’t in your library.</p>
        <Link to="/library">Return to your library</Link>
      </section>
    );
  const visible = quotes.data?.filter((quote) =>
    quote.text.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <>
      <Link className="back-link" to="/library">
        ← Your library
      </Link>
      <BookDetails book={entry.books} saved />
      {book.isPending && (
        <LoadingIndicator>Loading book details…</LoadingIndicator>
      )}
      {book.isError && (
        <p role="alert">
          {message(book.error)}{' '}
          <button className="text-button" onClick={() => void book.refetch()}>
            Retry details
          </button>
        </p>
      )}
      <div className="page-heading">
        <h2 className="section-title">
          Your quotes{' '}
          <span className="muted">
            ({entry.quotes[0]?.count ?? quotes.data?.length ?? 0})
          </span>
        </h2>
        <Link
          className="button"
          to="/quotes/new"
          state={{ ownerId: entry.user_id, book: entry.books, userBookId }}
        >
          <Plus size={18} aria-hidden="true" />
          Add quote
        </Link>
      </div>
      <label htmlFor="quote-filter">Filter your quotes</label>
      <input
        autoComplete="off"
        id="quote-filter"
        name="book-quote-filter"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Find a word or phrase…"
      />
      {quotes.isPending && (
        <LoadingIndicator>Loading your quotes…</LoadingIndicator>
      )}
      {quotes.isError && (
        <p role="alert">
          {message(quotes.error)}{' '}
          <button className="text-button" onClick={() => void quotes.refetch()}>
            Retry quotes
          </button>
        </p>
      )}
      {visible?.length ? (
        visible.map((quote) => (
          <QuoteCard
            key={quote.id}
            quote={quote}
            book={entry.books}
            onDeleted={(remaining) => {
              if (remaining === 0) navigate('/library', { replace: true });
            }}
          />
        ))
      ) : quotes.isSuccess ? (
        <p>No quotes match your filter.</p>
      ) : null}
    </>
  );
}
