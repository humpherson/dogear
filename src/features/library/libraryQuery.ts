import { queryOptions, type QueryClient } from '@tanstack/react-query';
import {
  getBook,
  getLibrary,
  getQuotes,
  getCollection,
} from '../../services/libraryService';
import { getRandomLibraryQuote } from '../../services/libraryQuotesService';
import {
  type LibraryBook,
  type LibraryEntry,
  type CollectionEntry,
  type EntryKind,
  isCollection,
} from '../../types';
export const libraryKey = (userId: string | undefined) =>
  ['private', userId, 'library'] as const;
export const bookKey = (userId: string | undefined, id: string) =>
  ['private', userId, 'book', id] as const;
export const quotesKey = (
  userId: string | undefined,
  id: string,
  kind: EntryKind = 'book',
) =>
  [
    'private',
    userId,
    kind === 'book' ? 'quotes' : 'collection-quotes',
    id,
  ] as const;
export const collectionKey = (userId: string | undefined, id: string) =>
  ['private', userId, 'collection', id] as const;
export const entryKey = (
  userId: string | undefined,
  id: string,
  kind: EntryKind,
) => (kind === 'book' ? bookKey(userId, id) : collectionKey(userId, id));
export const heroKey = (userId: string | undefined) =>
  ['private', userId, 'library-hero'] as const;
export function libraryQueryOptions(userId: string | undefined) {
  return queryOptions({
    queryKey: libraryKey(userId),
    queryFn: ({ signal }) => getLibrary(signal),
    enabled: !!userId,
    staleTime: 30_000,
  });
}
export function bookQueryOptions(userId: string | undefined, id: string) {
  return queryOptions({
    queryKey: bookKey(userId, id),
    queryFn: ({ signal }) => getBook(id, signal),
    enabled: !!userId && !!id,
    staleTime: 60_000,
  });
}
export function quotesQueryOptions(
  userId: string | undefined,
  id: string,
  kind: EntryKind = 'book',
) {
  return queryOptions({
    queryKey: quotesKey(userId, id, kind),
    queryFn: ({ signal }) => getQuotes(id, signal, kind),
    enabled: !!userId && !!id,
    staleTime: 30_000,
  });
}
export function heroQueryOptions(userId: string | undefined) {
  return queryOptions({
    queryKey: heroKey(userId),
    queryFn: ({ signal }) => getRandomLibraryQuote(null, signal),
    enabled: !!userId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
export function cachedBook(
  client: QueryClient,
  userId: string | undefined,
  id: string,
) {
  return (
    client.getQueryData<LibraryBook | null>(bookKey(userId, id)) ??
    (client
      .getQueryData<LibraryEntry[]>(libraryKey(userId))
      ?.find((entry) => !isCollection(entry) && entry.id === id) as
      LibraryBook | undefined)
  );
}

export function collectionQueryOptions(userId: string | undefined, id: string) {
  return queryOptions({
    queryKey: collectionKey(userId, id),
    queryFn: ({ signal }) => getCollection(id, signal),
    enabled: !!userId && !!id,
    staleTime: 60000,
  });
}
export function cachedCollection(
  client: QueryClient,
  userId: string | undefined,
  id: string,
) {
  return (
    client.getQueryData<CollectionEntry | null>(collectionKey(userId, id)) ??
    client
      .getQueryData<LibraryEntry[]>(libraryKey(userId))
      ?.find(
        (entry): entry is CollectionEntry =>
          isCollection(entry) && entry.id === id,
      )
  );
}
