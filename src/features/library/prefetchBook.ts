import type { EntryKind } from '../../types';
import type { QueryClient } from '@tanstack/react-query';
import { loadBookPage, loadCollectionPage } from '../../app/pageLoaders';
import {
  bookQueryOptions,
  collectionQueryOptions,
  quotesQueryOptions,
} from './libraryQuery';
export function prefetchBook(
  client: QueryClient,
  userId: string | undefined,
  id: string,
  kind: EntryKind = 'book',
) {
  if (!userId) return;
  void (kind === 'book' ? loadBookPage() : loadCollectionPage()).catch(
    () => undefined,
  );
  if (kind === 'book') void client.prefetchQuery(bookQueryOptions(userId, id));
  else void client.prefetchQuery(collectionQueryOptions(userId, id));
  void client.prefetchQuery(quotesQueryOptions(userId, id, kind));
}
