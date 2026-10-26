import { act, render, screen, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthContext } from '../features/auth/AuthProvider';
import { BookPage } from '../pages/BookPage';
import { LibraryPage } from '../pages/LibraryPage';
import {
  libraryKey,
  bookKey,
  quotesKey,
  heroKey,
  bookQueryOptions,
  quotesQueryOptions,
} from '../features/library/libraryQuery';
import {
  cacheSavedQuote,
  cacheEditedQuote,
  cacheDeletedQuote,
  summarise,
} from '../features/library/quoteCache';
import { prefetchBook } from '../features/library/prefetchBook';
import * as service from '../services/libraryService';
import * as hero from '../services/libraryQuotesService';
import { savedFixture } from './fixtures';
import type { LibraryBook, LibrarySummary, Quote } from '../types';
const result = savedFixture({
  source: 'open_library',
  source_id: 'OL1W',
  title: 'Cached book',
  authors: ['Writer'],
  description: 'Full stored description',
  published_date: '2020',
  cover_url: null,
  isbn_10: null,
  isbn_13: null,
});
afterEach(() => vi.restoreAllMocks());
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function view(client: QueryClient, page: 'book' | 'library' = 'book') {
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider
        value={{
          session: { user: { id: 'reader' } } as Session,
          loading: false,
          recovery: false,
          error: null,
        }}
      >
        <MemoryRouter initialEntries={['/books/ub']}>
          <Routes>
            <Route
              path="/books/:userBookId"
              element={page === 'book' ? <BookPage /> : <LibraryPage />}
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
it('renders a cached book summary before full details and quotes arrive', async () => {
  const details = deferred<LibraryBook | null>(),
    quotes = deferred<Quote[]>();
  vi.spyOn(service, 'getBook').mockReturnValue(details.promise);
  vi.spyOn(service, 'getQuotes').mockReturnValue(quotes.promise);
  const client = new QueryClient();
  client.setQueryData(libraryKey('reader'), [summarise(result.library_entry)]);
  view(client);
  expect(
    screen.getByRole('heading', { name: 'Cached book' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Loading your words…')).toBeInTheDocument();
  await act(async () => details.resolve(result.library_entry));
  expect(
    await screen.findByText('Full stored description'),
  ).toBeInTheDocument();
  expect(screen.getByText('Loading your words…')).toBeInTheDocument();
  await act(async () => quotes.resolve([result.quote_record]));
  expect(await screen.findByText('Saved words')).toBeInTheDocument();
});
it('reuses fresh full book details and quotes on return visits', async () => {
  const getBook = vi
    .spyOn(service, 'getBook')
    .mockResolvedValue(result.library_entry);
  const getQuotes = vi
    .spyOn(service, 'getQuotes')
    .mockResolvedValue([result.quote_record]);
  const client = new QueryClient();
  await client.fetchQuery(bookQueryOptions('reader', 'ub'));
  await client.fetchQuery(quotesQueryOptions('reader', 'ub'));
  view(client);
  expect(screen.getByText('Saved words')).toBeInTheDocument();
  expect(getBook).toHaveBeenCalledTimes(1);
  expect(getQuotes).toHaveBeenCalledTimes(1);
});
it('starts hero and library reads together and reuses the selection on remount', async () => {
  const pending = deferred<LibrarySummary[]>();
  const getLibrary = vi
    .spyOn(service, 'getLibrary')
    .mockReturnValue(pending.promise);
  const getHero = vi.spyOn(hero, 'getRandomLibraryQuote').mockResolvedValue({
    quote_id: 'q',
    user_book_id: 'ub',
    text: 'Personal hero',
    author: 'Writer',
    book_title: 'Cached book',
    published_year: '2020',
  });
  const client = new QueryClient();
  const first = view(client, 'library');
  await waitFor(() => expect(getLibrary).toHaveBeenCalledOnce());
  expect(getHero).toHaveBeenCalledOnce();
  await act(async () => pending.resolve([summarise(result.library_entry)]));
  await screen.findByText('Personal hero');
  first.unmount();
  view(client, 'library');
  await screen.findByText('Personal hero');
  expect(getHero).toHaveBeenCalledOnce();
});
it('uses server-confirmed save data without waiting for background reconciliation', async () => {
  const client = new QueryClient();
  const pending = deferred<LibrarySummary[]>();
  client.setQueryData(libraryKey('reader'), []);
  const observer = new QueryObserver(client, {
    queryKey: libraryKey('reader'),
    queryFn: () => pending.promise,
    staleTime: Infinity,
  });
  const stop = observer.subscribe(() => {});
  try {
    await cacheSavedQuote(client, 'reader', result);
    expect(client.getQueryData(bookKey('reader', 'ub'))).toEqual(
      result.library_entry,
    );
    const summary = client.getQueryData<LibrarySummary[]>(
      libraryKey('reader'),
    )![0];
    expect(summary.books.title).toBe('Cached book');
    expect(summary.books).not.toHaveProperty('description');
    expect(client.getQueryData(quotesKey('reader', 'ub'))).toEqual([
      result.quote_record,
    ]);
    expect(client.isFetching({ queryKey: libraryKey('reader') })).toBe(1);
  } finally {
    pending.resolve([summarise(result.library_entry)]);
    stop();
    client.clear();
  }
});
it('updates a confirmed edit and its hero without invalidating unrelated data', async () => {
  const client = new QueryClient();
  client.setQueryData(quotesKey('reader', 'ub'), [result.quote_record]);
  client.setQueryData(['private', 'reader', 'profile'], {
    display_name: 'Reader',
  });
  client.setQueryData(heroKey('reader'), { quote_id: 'q', text: 'Old text' });
  const updated = { ...result.quote_record, text: 'Confirmed edit' };
  await cacheEditedQuote(client, 'reader', updated);
  expect(client.getQueryData(quotesKey('reader', 'ub'))).toEqual([updated]);
  expect(client.getQueryData(heroKey('reader'))).toMatchObject({
    text: 'Confirmed edit',
  });
  expect(
    client.getQueryState(['private', 'reader', 'profile'])?.isInvalidated,
  ).toBe(false);
});
it('uses the server remaining count and leaves other accounts untouched after deletion', async () => {
  const client = new QueryClient();
  client.setQueryData(libraryKey('reader'), [summarise(result.library_entry)]);
  client.setQueryData(bookKey('reader', 'ub'), result.library_entry);
  client.setQueryData(quotesKey('reader', 'ub'), [result.quote_record]);
  client.setQueryData(libraryKey('other'), [{ id: 'other-book' }]);
  await cacheDeletedQuote(client, 'reader', 'q', {
    user_book_id: 'ub',
    remaining_count: 0,
  });
  expect(client.getQueryData(libraryKey('reader'))).toEqual([]);
  expect(client.getQueryData(bookKey('reader', 'ub'))).toBeNull();
  expect(client.getQueryData(quotesKey('reader', 'ub'))).toEqual([]);
  expect(client.getQueryData(libraryKey('other'))).toEqual([
    { id: 'other-book' },
  ]);
});
it('deduplicates book prefetches and shares their results with navigation', async () => {
  const getBook = vi
    .spyOn(service, 'getBook')
    .mockResolvedValue(result.library_entry);
  const getQuotes = vi
    .spyOn(service, 'getQuotes')
    .mockResolvedValue([result.quote_record]);
  const client = new QueryClient();
  prefetchBook(client, 'reader', 'ub');
  prefetchBook(client, 'reader', 'ub');
  await client.fetchQuery(bookQueryOptions('reader', 'ub'));
  await client.fetchQuery(quotesQueryOptions('reader', 'ub'));
  expect(getBook).toHaveBeenCalledOnce();
  expect(getQuotes).toHaveBeenCalledOnce();
});
it('rejects a mismatched owner before changing cached data', async () => {
  const client = new QueryClient();
  await expect(cacheSavedQuote(client, 'other', result)).rejects.toThrow(
    'Unexpected quote owner',
  );
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});
