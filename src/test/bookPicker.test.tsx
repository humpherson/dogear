import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthContext } from '../features/auth/AuthProvider';
import { BookPicker } from '../components/books/BookPicker';
import * as library from '../services/libraryService';
import * as booksApi from '../services/booksApi';
import type { LibraryBook } from '../types';
const entry: LibraryBook = {
  id: 'ub',
  user_id: 'reader',
  book_id: 'b',
  created_at: '',
  books: {
    id: 'b',
    source: 'google_books',
    source_id: 'legacy-book',
    title: 'A Book Already Kept',
    authors: ['A. Writer'],
    description: 'Stored description',
    published_date: '2020',
    cover_url: null,
    isbn_10: null,
    isbn_13: null,
    created_at: '',
    updated_at: '',
  },
  quotes: [{ count: 2 }],
};
afterEach(() => vi.restoreAllMocks());
function renderPicker(onSelect = vi.fn()) {
  return render(
    <AuthContext.Provider
      value={{
        session: { user: { id: 'reader' } } as Session,
        loading: false,
        recovery: false,
        error: null,
      }}
    >
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <BookPicker onSelect={onSelect} />
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
}
it('filters saved books locally and selects a legacy book with its catalog ID intact', async () => {
  vi.spyOn(library, 'getLibrary').mockResolvedValue([entry]);
  const search = vi.spyOn(booksApi, 'searchBooks');
  const select = vi.fn();
  renderPicker(select);
  const user = userEvent.setup();
  const filter = await screen.findByLabelText('Filter your library');
  await user.type(filter, 'nothing matches');
  expect(
    screen.queryByRole('button', { name: /Choose A Book/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    'No saved books or collections match',
  );
  await user.clear(filter);
  await user.type(filter, 'a. writer');
  const choice = screen.getByRole('button', {
    name: /^Choose A Book Already Kept/,
  });
  expect(choice).toHaveTextContent('2 quotes kept');
  choice.focus();
  await user.keyboard('{Enter}');
  expect(select).toHaveBeenCalledWith(entry.books, entry.id);
  expect(search).not.toHaveBeenCalled();
});
it('keeps external search available for an empty library', async () => {
  vi.spyOn(library, 'getLibrary').mockResolvedValue([]);
  renderPicker();
  expect(
    screen.getByRole('button', { name: 'Find a new book' }),
  ).toHaveAttribute('aria-expanded', 'true');
  expect(
    screen.getByRole('button', { name: 'Choose from your library' }),
  ).toHaveAttribute('aria-expanded', 'false');
  expect(
    screen.queryByLabelText('Filter your library'),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Choose from your library' }),
  );
  expect(await screen.findByText(/Your library is empty/)).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Find a new book' }),
  );
  expect(
    screen.getByRole('combobox', { name: 'Find a book' }),
  ).toBeInTheDocument();
});
it('keeps external search available while library loading is pending', () => {
  vi.spyOn(library, 'getLibrary').mockImplementation(
    () => new Promise(() => {}),
  );
  renderPicker();
  expect(screen.getByRole('status')).toHaveTextContent('Loading your library');
  expect(screen.getByRole('combobox')).toBeInTheDocument();
});
it('can retry a failed library request without blocking discovery', async () => {
  const get = vi
    .spyOn(library, 'getLibrary')
    .mockRejectedValueOnce(new Error('Unable to load library'))
    .mockResolvedValue([entry]);
  renderPicker();
  await userEvent.click(
    screen.getByRole('button', { name: 'Choose from your library' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unable to load library',
  );
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retry library' }));
  expect(
    await screen.findByRole('button', { name: /Choose A Book Already Kept/ }),
  ).toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(2);
});

it('opens the library by default and switches panels with the keyboard', async () => {
  vi.spyOn(library, 'getLibrary').mockResolvedValue([entry]);
  renderPicker();
  const user = userEvent.setup();
  const filter = await screen.findByLabelText('Filter your library');
  const libraryTrigger = screen.getByRole('button', {
      name: 'Choose from your library',
    }),
    newTrigger = screen.getByRole('button', { name: 'Find a new book' });
  expect(libraryTrigger).toHaveAttribute('aria-expanded', 'true');
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  await user.type(filter, 'Writer');
  newTrigger.focus();
  await user.keyboard('{Enter}');
  expect(newTrigger).toHaveAttribute('aria-expanded', 'true');
  expect(libraryTrigger).toHaveAttribute('aria-expanded', 'false');
  expect(
    screen.queryByLabelText('Filter your library'),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('combobox')).toBeInTheDocument();
  await user.keyboard('{ArrowUp}');
  expect(libraryTrigger).toHaveFocus();
  await user.keyboard(' ');
  expect(screen.getByLabelText('Filter your library')).toHaveValue('Writer');
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  await user.click(libraryTrigger);
  expect(libraryTrigger).toHaveAttribute('aria-expanded', 'true');
});
it('keeps the user’s active search open when the library finishes loading', async () => {
  let resolve!: (books: LibraryBook[]) => void;
  vi.spyOn(library, 'getLibrary').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  renderPicker();
  await userEvent.click(screen.getByRole('combobox'));
  await act(async () => resolve([entry]));
  expect(
    screen.getByRole('button', { name: 'Find a new book' }),
  ).toHaveAttribute('aria-expanded', 'true');
  expect(
    screen.queryByLabelText('Filter your library'),
  ).not.toBeInTheDocument();
});

it('selects a saved collection locally and creates only a draft from the third panel', async () => {
  const collection = {
    kind: 'collection' as const,
    id: 'c',
    user_id: 'reader',
    name: 'Little observations',
    created_at: '',
    updated_at: '',
    quotes: [{ count: 1 }],
  };
  vi.spyOn(library, 'getLibrary').mockResolvedValue([collection]);
  const search = vi.spyOn(booksApi, 'searchBooks');
  const select = vi.fn();
  render(
    <AuthContext.Provider
      value={{
        session: { user: { id: 'reader' } } as Session,
        loading: false,
        recovery: false,
        error: null,
      }}
    >
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <BookPicker onSelect={vi.fn()} onSelectCollection={select} />
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: /Choose Little observations/ }),
  );
  expect(select).toHaveBeenCalledWith(collection);
  await user.click(screen.getByRole('button', { name: 'Create a collection' }));
  expect(
    screen.queryByLabelText('Filter your library'),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Use this collection' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Enter a collection name',
  );
  await user.type(
    screen.getByLabelText('Collection name'),
    '  Passing thoughts  ',
  );
  await user.click(screen.getByRole('button', { name: 'Use this collection' }));
  expect(select).toHaveBeenLastCalledWith({ name: 'Passing thoughts' });
  expect(search).not.toHaveBeenCalled();
});
