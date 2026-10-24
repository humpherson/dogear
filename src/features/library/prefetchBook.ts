import type { QueryClient } from '@tanstack/react-query';
import { loadBookPage } from '../../app/pageLoaders';
import { bookQueryOptions, quotesQueryOptions } from './libraryQuery';
export function prefetchBook(
  client: QueryClient,
  userId: string | undefined,
  id: string,
) {
  if (!userId) return;
  void loadBookPage().catch(() => undefined);
  void client.prefetchQuery(bookQueryOptions(userId, id));
  void client.prefetchQuery(quotesQueryOptions(userId, id));
}
