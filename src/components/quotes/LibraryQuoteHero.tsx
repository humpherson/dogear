import { heroQueryOptions, heroKey } from '../../features/library/libraryQuery';
import { LoadingIndicator, Spinner } from '../ui/LoadingIndicator';
import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { getRandomLibraryQuote } from '../../services/libraryQuotesService';

export function LibraryQuoteHero({ quoteCount }: { quoteCount: number }) {
  const { session } = useAuth();
  const client = useQueryClient();
  const id = useId();
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);
  const queryKey = heroKey(session?.user.id);
  const query = useQuery(heroQueryOptions(session?.user.id));
  const Passage = query.data?.item_type === 'definition' ? 'p' : 'blockquote';
  const fullText = query.data?.text || '';
  const characters = Array.from(fullText.split('\n').slice(0, 3).join('\n'));
  const shortened = characters.length > 160 || fullText.split('\n').length > 3;
  const excerpt = shortened
    ? `${characters.slice(0, 157).join('').trimEnd()}...`
    : fullText;
  const expanded = !!query.data && expandedQuote === query.data.quote_id;
  function refresh() {
    setExpandedQuote(null);
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
          From your library
        </p>
      </div>
      {query.data ? (
        <>
          {query.data.item_type === 'definition' && (
            <>
              <p className="item-kind">Definition</p>
              <h2 className="definition-term">{query.data.term}</h2>
            </>
          )}
          <Passage
            className="hero-passage"
            id={`${id}-passage`}
            aria-live="polite"
          >
            {expanded ? fullText : excerpt}
          </Passage>
          {shortened && (
            <button
              className="text-button hero-read-more"
              type="button"
              aria-expanded={expanded}
              aria-controls={`${id}-passage`}
              onClick={() =>
                setExpandedQuote(expanded ? null : query.data!.quote_id)
              }
            >
              {expanded ? 'Show less' : 'Read full quote'}
            </button>
          )}
          {query.data.item_type !== 'definition' && query.data.author && (
            <p className="library-quote-author">{query.data.author}</p>
          )}
          <p className="library-quote-book">
            {(query.data.entry_kind === 'collection' ||
              query.data.item_type === 'definition') &&
              query.data.book_title && <span>{query.data.book_title} · </span>}
            <Link
              to={`/${query.data.entry_kind === 'collection' ? 'collections' : 'books'}/${query.data.user_book_id}`}
            >
              {query.data.item_type === 'definition' ||
              query.data.entry_kind === 'collection'
                ? query.data.entry_title
                : query.data.book_title}
            </Link>
            {query.data.published_year ? ` · ${query.data.published_year}` : ''}
          </p>
        </>
      ) : query.isPending ? (
        <LoadingIndicator>Finding words from your library…</LoadingIndicator>
      ) : !query.isError ? (
        <p>Save words to give them a home.</p>
      ) : null}
      {query.isError && (
        <p role="alert">
          We couldn’t {query.data ? 'refresh' : 'load'} your words. Please try
          again.
        </p>
      )}
      <div className="library-quote-actions">
        <button
          type="button"
          className="secondary"
          aria-busy={query.isFetching}
          onClick={refresh}
          disabled={query.isFetching || (quoteCount === 1 && query.isSuccess)}
        >
          {query.isFetching ? (
            <Spinner />
          ) : (
            <RefreshCw size={16} aria-hidden="true" />
          )}
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
        {quoteCount === 1 && query.data && (
          <p className="hint">Save more words to refresh this selection.</p>
        )}
      </div>
    </section>
  );
}
