import { isCollection, entryTitle, entryPath, countLabel } from '../types';
import { CollectionCover } from '../components/collections/CollectionDetails';
import { prefetchBook } from '../features/library/prefetchBook';
import { LoadingIndicator } from '../components/ui/LoadingIndicator';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, BookOpen } from 'lucide-react';
import {
  libraryQueryOptions,
  heroQueryOptions,
} from '../features/library/libraryQuery';
import { Cover } from '../components/books/BookDetails';
import { useAuth } from '../features/auth/AuthProvider';
import { message } from '../lib/validation';
import { LibraryQuoteHero } from '../components/quotes/LibraryQuoteHero';
export function LibraryPage() {
  const { session } = useAuth();
  const client = useQueryClient();
  const query = useQuery(libraryQueryOptions(session?.user.id));
  useQuery(heroQueryOptions(session?.user.id));
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
            <p className="muted">Words worth keeping, from books and beyond.</p>
          </div>
          <Link className="button" to="/words/new">
            <Plus size={18} aria-hidden="true" />
            Add words
          </Link>
        </div>

        {query.isPending ? (
          <LoadingIndicator>Gathering your books…</LoadingIndicator>
        ) : query.isError && !query.data ? (
          <div role="alert">
            {message(query.error)}{' '}
            <button onClick={() => void query.refetch()}>Try again</button>
          </div>
        ) : !query.data?.length ? (
          <section className="empty">
            <BookOpen size={42} />
            <h2>Your first dog-eared is waiting.</h2>
            <p>
              Keep a quote or definition from a book, a conversation or your own
              thoughts. Your library grows one passage at a time.
            </p>
            <Link className="button" to="/words/new">
              <Plus size={18} aria-hidden="true" />
              Add words
            </Link>
          </section>
        ) : (
          <div className="library-grid">
            {query.data.map((entry) => (
              <Link
                className="book-card"
                key={`${isCollection(entry) ? 'collection' : 'book'}-${entry.id}`}
                to={entryPath(entry)}
                onMouseEnter={() =>
                  prefetchBook(
                    client,
                    session?.user.id,
                    entry.id,
                    isCollection(entry) ? 'collection' : 'book',
                  )
                }
                onFocus={() =>
                  prefetchBook(
                    client,
                    session?.user.id,
                    entry.id,
                    isCollection(entry) ? 'collection' : 'book',
                  )
                }
                onTouchStart={() =>
                  prefetchBook(
                    client,
                    session?.user.id,
                    entry.id,
                    isCollection(entry) ? 'collection' : 'book',
                  )
                }
              >
                <div className="book-stage">
                  {isCollection(entry) ? (
                    <CollectionCover {...entry} large />
                  ) : (
                    <Cover book={entry.books} large />
                  )}
                </div>
                <h2>{entryTitle(entry)}</h2>
                <p>
                  {isCollection(entry)
                    ? 'Collection'
                    : entry.books.authors.join(', ') || 'Unknown author'}
                </p>
                <span className="quote-count">{countLabel(entry)} kept</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
