import type { QueryClient } from '@tanstack/react-query';
import {
  type LibraryBook,
  type LibrarySummary,
  type LibraryEntry,
  type FullLibraryEntry,
  type EntryKind,
  type Quote,
  isCollection,
  quoteParent,
  entryTitle,
} from '../../types';
import type {
  SavedQuote,
  CollectionSavedQuote,
  DeletedQuote,
  MovedQuote,
} from '../../services/quotesService';
import type { LibraryQuote } from '../../services/libraryQuotesService';
import { entryKey, quotesKey, libraryKey, heroKey } from './libraryQuery';
export function summarise(entry: LibraryBook): LibrarySummary {
  const { id, source, source_id, title, authors, published_date, cover_url } =
    entry.books;
  return {
    ...entry,
    books: { id, source, source_id, title, authors, published_date, cover_url },
  };
}
function summary(entry: FullLibraryEntry): LibraryEntry {
  return isCollection(entry) ? entry : summarise(entry);
}
async function cancelReads(
  client: QueryClient,
  userId: string,
  id: string,
  kind: EntryKind,
) {
  await Promise.all(
    [
      libraryKey(userId),
      entryKey(userId, id, kind),
      quotesKey(userId, id, kind),
      heroKey(userId),
    ].map((queryKey) => client.cancelQueries({ queryKey, exact: true })),
  );
}
function reconcile(
  client: QueryClient,
  userId: string,
  id: string,
  kind: EntryKind,
  count: number,
) {
  const quotes = client.getQueryData<Quote[]>(quotesKey(userId, id, kind));
  const keys =
    quotes && quotes.length === count
      ? [libraryKey(userId)]
      : [libraryKey(userId), quotesKey(userId, id, kind)];
  for (const queryKey of keys)
    void client
      .invalidateQueries({ queryKey, exact: true })
      .catch(() => undefined);
}
function updateEntry(
  client: QueryClient,
  userId: string,
  kind: EntryKind,
  id: string,
  entry: FullLibraryEntry | null,
) {
  client.setQueryData(entryKey(userId, id, kind), entry);
  client.setQueryData<LibraryEntry[]>(
    libraryKey(userId),
    (old) =>
      old &&
      (entry
        ? old.some(
            (item) =>
              item.id === id &&
              (isCollection(item) ? 'collection' : 'book') === kind,
          )
          ? old.map((item) =>
              item.id === id &&
              (isCollection(item) ? 'collection' : 'book') === kind
                ? summary(entry)
                : item,
            )
          : [summary(entry), ...old]
        : old.filter(
            (item) =>
              !(
                item.id === id &&
                (isCollection(item) ? 'collection' : 'book') === kind
              ),
          )),
  );
}
export async function cacheSavedQuote(
  client: QueryClient,
  userId: string,
  result: SavedQuote | CollectionSavedQuote,
) {
  const entry = result.library_entry,
    quote = result.quote_record,
    kind = isCollection(entry) ? 'collection' : 'book';
  if (entry.user_id !== userId || quote.user_id !== userId)
    throw new Error('Unexpected quote owner.');
  await cancelReads(client, userId, entry.id, kind);
  updateEntry(client, userId, kind, entry.id, entry);
  client.setQueryData<Quote[]>(quotesKey(userId, entry.id, kind), (old) =>
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
        entry_kind: kind,
        entry_title: entryTitle(entry),
        text: quote.text,
        item_type: quote.item_type || 'quote',
        term: quote.term,
        lookup_attribution: quote.lookup_attribution,
        author:
          quote.item_type === 'definition'
            ? ''
            : quote.credit_mode === 'custom'
              ? quote.credit_author || ''
              : isCollection(entry)
                ? ''
                : entry.books.authors.join(', ') || 'Unknown author',
        book_title:
          quote.credit_mode === 'custom'
            ? quote.credit_source || ''
            : isCollection(entry)
              ? ''
              : entry.books.title,
        published_year:
          quote.credit_mode === 'custom'
            ? quote.credit_year || ''
            : isCollection(entry)
              ? ''
              : entry.books.published_date?.slice(0, 4) || '',
      },
  );
  reconcile(client, userId, entry.id, kind, entry.quotes[0]?.count || 0);
}
export async function cacheEditedQuote(
  client: QueryClient,
  userId: string,
  quote: Quote,
) {
  if (quote.user_id !== userId) throw new Error('Unexpected quote owner.');
  const { kind, id } = quoteParent(quote);
  await client.cancelQueries({
    queryKey: quotesKey(userId, id, kind),
    exact: true,
  });
  client.setQueryData<Quote[]>(quotesKey(userId, id, kind), (old) =>
    old?.map((item) => (item.id === quote.id ? quote : item)),
  );
  client.setQueryData<LibraryQuote | null>(heroKey(userId), (old) =>
    old?.quote_id === quote.id
      ? {
          ...old,
          text: quote.text,
          item_type: quote.item_type || 'quote',
          term: quote.term,
          lookup_attribution: quote.lookup_attribution,
          ...(quote.credit_mode === 'custom'
            ? {
                author: quote.credit_author || '',
                book_title: quote.credit_source || '',
                published_year: quote.credit_year || '',
              }
            : {}),
        }
      : old,
  );
}
export async function cacheDeletedQuote(
  client: QueryClient,
  userId: string,
  quoteId: string,
  result: DeletedQuote,
) {
  const kind = result.collection_id ? 'collection' : 'book',
    id = result.collection_id || result.user_book_id!;
  await cancelReads(client, userId, id, kind);
  client.setQueryData<Quote[]>(quotesKey(userId, id, kind), (old) =>
    old?.filter((quote) => quote.id !== quoteId),
  );
  const old = client.getQueryData<FullLibraryEntry | null>(
    entryKey(userId, id, kind),
  );
  if ('library_entry' in result)
    updateEntry(client, userId, kind, id, result.library_entry ?? null);
  else if (old || result.remaining_count === 0)
    updateEntry(
      client,
      userId,
      kind,
      id,
      result.remaining_count === 0
        ? null
        : { ...old!, quotes: [{ count: result.remaining_count }] },
    );
  else
    client.setQueryData<LibraryEntry[]>(libraryKey(userId), (entries) =>
      entries?.map((entry) =>
        entry.id === id &&
        (isCollection(entry) ? 'collection' : 'book') === kind
          ? { ...entry, quotes: [{ count: result.remaining_count }] }
          : entry,
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
  reconcile(client, userId, id, kind, result.remaining_count);
}
export function cacheRenamedCollection(
  client: QueryClient,
  userId: string,
  entry: FullLibraryEntry,
) {
  if (entry.user_id !== userId)
    throw new Error('Collection ownership mismatch.');
  updateEntry(client, userId, 'collection', entry.id, entry);
  client.setQueryData<LibraryQuote | null>(heroKey(userId), (old) =>
    old?.entry_kind === 'collection' && old.user_book_id === entry.id
      ? { ...old, entry_title: entryTitle(entry) }
      : old,
  );
}
export async function cacheMovedQuote(
  client: QueryClient,
  userId: string,
  result: MovedQuote,
) {
  if (
    result.quote_record.user_id !== userId ||
    result.destination_entry.user_id !== userId ||
    (result.source_entry && result.source_entry.user_id !== userId)
  )
    throw new Error('Quote ownership mismatch.');
  const target = result.destination_entry,
    kind = isCollection(target) ? 'collection' : 'book';
  await cancelReads(client, userId, result.source_id, result.source_kind);
  await cancelReads(client, userId, target.id, kind);
  updateEntry(
    client,
    userId,
    result.source_kind,
    result.source_id,
    result.source_entry,
  );
  updateEntry(client, userId, kind, target.id, target);
  client.setQueryData<Quote[]>(
    quotesKey(userId, result.source_id, result.source_kind),
    (old) => old?.filter((q) => q.id !== result.quote_record.id),
  );
  client.setQueryData<Quote[]>(quotesKey(userId, target.id, kind), (old) =>
    old
      ? [
          ...old.filter((q) => q.id !== result.quote_record.id),
          result.quote_record,
        ].sort((a, b) => b.created_at.localeCompare(a.created_at))
      : target.quotes[0]?.count === 1
        ? [result.quote_record]
        : undefined,
  );
  client.setQueryData<LibraryQuote | null>(heroKey(userId), (old) =>
    old?.quote_id === result.quote_record.id
      ? {
          ...old,
          item_type: result.quote_record.item_type || 'quote',
          term: result.quote_record.term,
          lookup_attribution: result.quote_record.lookup_attribution,
          user_book_id: target.id,
          entry_kind: kind,
          entry_title: entryTitle(target),
          author: result.quote_record.credit_author || '',
          book_title: result.quote_record.credit_source || '',
          published_year: result.quote_record.credit_year || '',
        }
      : old,
  );
  reconcile(
    client,
    userId,
    result.source_id,
    result.source_kind,
    result.source_remaining_count,
  );
  reconcile(client, userId, target.id, kind, target.quotes[0]?.count || 0);
}
