import { LoadingIndicator } from '../ui/LoadingIndicator';
import { useQuery } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import { getRandomHomepageQuote } from '../../services/homepageQuotesService';

export function LandingQuote() {
  const query = useQuery({
    queryKey: ['public', 'homepage-quote'],
    queryFn: getRandomHomepageQuote,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: false,
  });
  return (
    <div
      aria-busy={query.isFetching}
      className={
        query.data && query.data.text.length > 600
          ? 'literary-card long-quote'
          : 'literary-card'
      }
    >
      <Bookmark size={30} strokeWidth={1} aria-hidden="true" />
      <p className="eyebrow">A little quip</p>
      {query.isPending ? (
        <LoadingIndicator>Finding a little quip…</LoadingIndicator>
      ) : query.isError ? (
        <div role="alert">
          <p>We couldn’t load a sample quote.</p>
          <button
            type="button"
            className="text-button"
            onClick={() => void query.refetch()}
          >
            Try another quote
          </button>
        </div>
      ) : query.data ? (
        <>
          <blockquote>{query.data.text}</blockquote>
          <div className="rule" />
          {query.data.author && <p>{query.data.author}</p>}
          {(query.data.book_title || query.data.published_year) && (
            <span className="muted">
              {query.data.book_title}
              {query.data.published_year
                ? ` · ${query.data.published_year}`
                : ''}
            </span>
          )}
        </>
      ) : (
        <p>A little quip will be here soon.</p>
      )}
      <div className="card-corner" aria-hidden="true" />
    </div>
  );
}
