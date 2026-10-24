import { useId } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { getRandomLibraryQuote } from '../../services/libraryQuotesService';

export function LibraryQuoteHero({ quoteCount }: { quoteCount: number }) {
  const { session } = useAuth();
  const client = useQueryClient();
  const id = useId();
  const queryKey = ['private', session?.user.id, 'library-hero'];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getRandomLibraryQuote(null, signal),
    enabled: !!session,
    refetchOnWindowFocus: false,
    retry: false,
  });
  function refresh() {
    void client
      .fetchQuery({
        queryKey,
        queryFn: ({ signal }) =>
          getRandomLibraryQuote(query.data?.quote_id || null, signal),
        staleTime: 0,
        retry: false,
      })
      .catch(() => undefined);
  }
  return (
    <section
      className="library-quote-hero"
      aria-labelledby={id}
      aria-busy={query.isFetching}
    >
      <div className="library-quote-heading">
        <Bookmark size={22} aria-hidden="true" />
        <p id={id} className="eyebrow">
          A little quip from your library
        </p>
      </div>
      {query.data ? (
        <>
          <blockquote aria-live="polite">{query.data.text}</blockquote>
          <p className="library-quote-author">{query.data.author}</p>
          <p className="library-quote-book">
            <Link to={`/books/${query.data.user_book_id}`}>
              {query.data.book_title}
            </Link>
            {query.data.published_year ? ` · ${query.data.published_year}` : ''}
          </p>
        </>
      ) : query.isPending ? (
        <p role="status">Finding a quote from your library…</p>
      ) : !query.isError ? (
        <p>Save a quote to give these words a home.</p>
      ) : null}
      {query.isError && (
        <p role="alert">
          We couldn’t {query.data ? 'refresh' : 'load'} your quote. Please try
          again.
        </p>
      )}
      <div className="library-quote-actions">
        <button
          type="button"
          className="secondary"
          onClick={refresh}
          disabled={query.isFetching || (quoteCount === 1 && query.isSuccess)}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
        {quoteCount === 1 && query.data && (
          <p className="hint">Save another quote to refresh this selection.</p>
        )}
      </div>
    </section>
  );
}
