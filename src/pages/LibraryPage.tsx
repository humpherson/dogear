import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, BookOpen } from 'lucide-react';
import { getLibrary } from '../services/libraryService';
import { Cover } from '../components/books/BookDetails';
import { useAuth } from '../features/auth/AuthProvider';
import { message } from '../lib/validation';
import { LibraryQuoteHero } from '../components/quotes/LibraryQuoteHero';
export function LibraryPage() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ['private', session?.user.id, 'library'],
    queryFn: getLibrary,
  });
  return (
    <div className="library-page">
      {!!query.data?.length && (
        <LibraryQuoteHero
          key={session?.user.id}
          quoteCount={query.data.reduce(
            (total, book) => total + (book.quotes[0]?.count || 0),
            0,
          )}
        />
      )}
      <div className="library-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Words to come back to</p>
            <h1>
              Your library<span className="gold">.</span>
            </h1>
            <p className="muted">A little of every book that stays with you.</p>
          </div>
          <Link className="button" to="/quotes/new">
            <Plus size={18} />
            Add a quote
          </Link>
        </div>

        {query.isPending ? (
          <p role="status">Gathering your books…</p>
        ) : query.isError ? (
          <div role="alert">
            {message(query.error)}{' '}
            <button onClick={() => void query.refetch()}>Try again</button>
          </div>
        ) : !query.data.length ? (
          <section className="empty">
            <BookOpen size={42} />
            <h2>Your first dogear is waiting.</h2>
            <p>
              Save a quote from a book you love. Your library grows one passage
              at a time.
            </p>
            <Link className="button" to="/quotes/new">
              Find a book
            </Link>
          </section>
        ) : (
          <div className="library-grid">
            {query.data.map((entry) => (
              <Link
                className="book-card"
                key={entry.id}
                to={`/books/${entry.id}`}
              >
                <div className="book-stage">
                  <Cover book={entry.books} large />
                </div>
                <h2>{entry.books.title}</h2>
                <p>{entry.books.authors.join(', ') || 'Unknown author'}</p>
                <span className="quote-count">
                  {entry.quotes[0]?.count || 0}{' '}
                  {(entry.quotes[0]?.count || 0) === 1 ? 'quote' : 'quotes'}{' '}
                  kept
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
