import { LoadingIndicator } from '../components/ui/LoadingIndicator';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getBook, getQuotes } from '../services/libraryService';
import { useAuth } from '../features/auth/AuthProvider';
import { BookDetails } from '../components/books/BookDetails';
import { QuoteCard } from '../components/quotes/QuoteCard';
import { message } from '../lib/validation';
export function BookPage() {
  const { userBookId = '' } = useParams(),
    { session } = useAuth(),
    navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const book = useQuery({
    queryKey: ['private', session?.user.id, 'book', userBookId],
    queryFn: () => getBook(userBookId),
  });
  const quotes = useQuery({
    queryKey: ['private', session?.user.id, 'quotes', userBookId],
    queryFn: () => getQuotes(userBookId),
  });
  if (book.isPending || quotes.isPending)
    return <LoadingIndicator>Opening your book…</LoadingIndicator>;
  if (book.isError || quotes.isError)
    return (
      <div role="alert">
        {message(book.error || quotes.error)}{' '}
        <button
          onClick={() => {
            void book.refetch();
            void quotes.refetch();
          }}
        >
          Try again
        </button>
      </div>
    );
  if (!book.data)
    return (
      <section className="empty">
        <h1>Book not found</h1>
        <p>This book isn’t in your library.</p>
        <Link to="/library">Return to your library</Link>
      </section>
    );
  const visible = quotes.data.filter((q) =>
    q.text.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <>
      <Link className="back-link" to="/library">
        ← Your library
      </Link>
      <BookDetails book={book.data.books} />
      <div className="page-heading">
        <h1 className="section-title">
          Your quotes <span className="muted">({quotes.data.length})</span>
        </h1>
        <Link
          className="button"
          to="/quotes/new"
          state={{ book: book.data.books }}
        >
          Add another quote
        </Link>
      </div>
      <label htmlFor="quote-filter">Filter your quotes</label>
      <input
        id="quote-filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Find a word or phrase…"
      />
      {visible.length ? (
        visible.map((quote) => (
          <QuoteCard
            key={quote.id}
            quote={quote}
            onDeleted={() => {
              if (quotes.data.length <= 1)
                navigate('/library', { replace: true });
            }}
          />
        ))
      ) : (
        <p>No quotes match your filter.</p>
      )}
    </>
  );
}
