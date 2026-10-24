import type { QueryClient } from '@tanstack/react-query';
import type { LibraryBook, LibrarySummary, Quote } from '../../types';
import type { SavedQuote, DeletedQuote } from '../../services/quotesService';
import type { LibraryQuote } from '../../services/libraryQuotesService';
import { bookKey, quotesKey, libraryKey, heroKey } from './libraryQuery';
export function summarise(entry: LibraryBook): LibrarySummary {
  const { id, source, source_id, title, authors, published_date, cover_url } =
    entry.books;
  return {
    ...entry,
    books: { id, source, source_id, title, authors, published_date, cover_url },
  };
}
async function cancelReads(client: QueryClient, userId: string, id: string) {
  await Promise.all(
    [
      libraryKey(userId),
      bookKey(userId, id),
      quotesKey(userId, id),
      heroKey(userId),
    ].map((queryKey) => client.cancelQueries({ queryKey, exact: true })),
  );
}
function reconcile(
  client: QueryClient,
  userId: string,
  id: string,
  remainingCount: number,
) {
  // The mutation response already contains canonical book metadata/counts.
  // Re-read quotes only if the local list is incomplete; do not throw away a
  // complete, confirmed list just to fetch it again on the next navigation.
  const quotes = client.getQueryData<Quote[]>(quotesKey(userId, id));
  const keys =
    quotes && quotes.length === remainingCount
      ? [libraryKey(userId)]
      : [libraryKey(userId), quotesKey(userId, id)];
  for (const queryKey of keys) {
    void client
      .invalidateQueries({ queryKey, exact: true })
      .catch(() => undefined);
  }
}
export async function cacheSavedQuote(
  client: QueryClient,
  userId: string,
  result: SavedQuote,
) {
  const entry = result.library_entry,
    quote = result.quote_record;
  if (entry.user_id !== userId || quote.user_id !== userId)
    throw new Error('Unexpected quote owner.');
  await cancelReads(client, userId, entry.id);
  client.setQueryData(bookKey(userId, entry.id), entry);
  client.setQueryData<LibrarySummary[]>(
    libraryKey(userId),
    (old) =>
      old &&
      (old.some((item) => item.id === entry.id)
        ? old.map((item) => (item.id === entry.id ? summarise(entry) : item))
        : [summarise(entry), ...old]),
  );
  client.setQueryData<Quote[]>(quotesKey(userId, entry.id), (old) =>
    old
      ? [quote, ...old.filter((item) => item.id !== quote.id)]
      : entry.quotes[0]?.count === 1
        ? [quote]
        : undefined,
  );
  client.setQueryData<LibraryQuote | null>(
    heroKey(userId),
    (old) =>
      old ?? {
        quote_id: quote.id,
        user_book_id: entry.id,
        text: quote.text,
        author: entry.books.authors.join(', ') || 'Unknown author',
        book_title: entry.books.title,
        published_year: entry.books.published_date?.slice(0, 4) || '',
      },
  );
  reconcile(client, userId, entry.id, entry.quotes[0]?.count || 0);
}
export async function cacheEditedQuote(
  client: QueryClient,
  userId: string,
  quote: Quote,
) {
  if (quote.user_id !== userId) throw new Error('Unexpected quote owner.');
  await client.cancelQueries({
    queryKey: quotesKey(userId, quote.user_book_id),
    exact: true,
  });
  client.setQueryData<Quote[]>(quotesKey(userId, quote.user_book_id), (old) =>
    old?.map((item) => (item.id === quote.id ? quote : item)),
  );
  client.setQueryData<LibraryQuote | null>(heroKey(userId), (old) =>
    old?.quote_id === quote.id ? { ...old, text: quote.text } : old,
  );
}
export async function cacheDeletedQuote(
  client: QueryClient,
  userId: string,
  quoteId: string,
  result: DeletedQuote,
) {
  const id = result.user_book_id;
  await cancelReads(client, userId, id);
  client.setQueryData<Quote[]>(quotesKey(userId, id), (old) =>
    old?.filter((quote) => quote.id !== quoteId),
  );
  client.setQueryData<LibraryBook | null>(bookKey(userId, id), (old) =>
    result.remaining_count === 0
      ? null
      : old
        ? { ...old, quotes: [{ count: result.remaining_count }] }
        : old,
  );
  client.setQueryData<LibrarySummary[]>(libraryKey(userId), (old) =>
    old?.flatMap((item) =>
      item.id !== id
        ? [item]
        : result.remaining_count === 0
          ? []
          : [{ ...item, quotes: [{ count: result.remaining_count }] }],
    ),
  );
  if (
    client.getQueryData<LibraryQuote | null>(heroKey(userId))?.quote_id ===
    quoteId
  ) {
    client.setQueryData(heroKey(userId), null);
    void client
      .invalidateQueries({ queryKey: heroKey(userId), exact: true })
      .catch(() => undefined);
  }
  reconcile(client, userId, id, result.remaining_count);
}
