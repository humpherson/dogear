import { useState } from 'react';
import { Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../features/auth/AuthProvider';
import {
  findMeanings,
  normaliseTerm,
  type DictionaryMeaning,
} from '../../services/dictionaryService';
import { LoadingIndicator } from '../ui/LoadingIndicator';
import { message } from '../../lib/validation';
export function DictionaryLookup({
  term,
  hasMeaning,
  onChoose,
}: {
  term: string;
  hasMeaning: boolean;
  onChoose: (meaning: DictionaryMeaning) => void;
}) {
  const { session } = useAuth();
  const [requested, setRequested] = useState('');
  const word = normaliseTerm(term);
  const query = useQuery({
    queryKey: ['private', session?.user.id, 'dictionary', 'en-GB', word],
    queryFn: ({ signal }) => findMeanings(word, signal),
    enabled: !!session && !!word && word === requested,
    staleTime: 10 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return (
    <div className="dictionary-lookup">
      <button
        className="secondary"
        type="button"
        disabled={!word || word.length > 120 || query.isFetching}
        onClick={() =>
          requested !== word
            ? setRequested(word)
            : query.isError || query.isStale
              ? void query.refetch()
              : undefined
        }
      >
        <Search size={16} aria-hidden="true" />
        Find meaning
      </button>
      {requested === word && (
        <>
          {query.isFetching && (
            <LoadingIndicator>Finding meanings…</LoadingIndicator>
          )}
          {query.isError && (
            <p role="status">
              {message(query.error)}{' '}
              <button
                className="text-button"
                type="button"
                onClick={() => void query.refetch()}
              >
                Try again
              </button>
            </p>
          )}
          {query.isSuccess &&
            !query.isFetching &&
            (!query.data.length ? (
              <p role="status">
                No definition found. You can write a meaning yourself.
              </p>
            ) : (
              <Results
                key={word}
                meanings={query.data}
                hasMeaning={hasMeaning}
                onChoose={onChoose}
              />
            ))}
        </>
      )}
    </div>
  );
}
function Results({
  meanings,
  hasMeaning,
  onChoose,
}: {
  meanings: DictionaryMeaning[];
  hasMeaning: boolean;
  onChoose: (meaning: DictionaryMeaning) => void;
}) {
  const [limit, setLimit] = useState(5);
  return (
    <div className="dictionary-results">
      <p className="hint">
        Choose one meaning, then adapt it if you like.
        {hasMeaning ? ' Choosing a result replaces your current meaning.' : ''}
      </p>
      <ul aria-label="Dictionary meanings">
        {meanings.slice(0, limit).map((meaning, index) => (
          <li key={index}>
            {meaning.partOfSpeech && (
              <p className="eyebrow">{meaning.partOfSpeech}</p>
            )}
            <p>{meaning.definition}</p>
            <button
              type="button"
              className="secondary"
              onClick={() => onChoose(meaning)}
            >
              {hasMeaning ? 'Replace meaning' : 'Use this meaning'}
            </button>
          </li>
        ))}
      </ul>
      {limit < meanings.length && (
        <button
          type="button"
          className="text-button"
          onClick={() => setLimit(limit + 5)}
        >
          Show more meanings
        </button>
      )}
    </div>
  );
}
