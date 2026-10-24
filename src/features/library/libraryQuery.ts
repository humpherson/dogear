import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { getBook, getLibrary, getQuotes } from '../../services/libraryService';
import { getRandomLibraryQuote } from '../../services/libraryQuotesService';
import type { LibraryBook, LibrarySummary } from '../../types';
export const libraryKey = (userId: string | undefined) =>
  ['private', userId, 'library'] as const;
export const bookKey = (userId: string | undefined, id: string) =>
  ['private', userId, 'book', id] as const;
export const quotesKey = (userId: string | undefined, id: string) =>
  ['private', userId, 'quotes', id] as const;
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
export function quotesQueryOptions(userId: string | undefined, id: string) {
  return queryOptions({
    queryKey: quotesKey(userId, id),
    queryFn: ({ signal }) => getQuotes(id, signal),
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
    client
      .getQueryData<LibrarySummary[]>(libraryKey(userId))
      ?.find((entry) => entry.id === id)
  );
}
