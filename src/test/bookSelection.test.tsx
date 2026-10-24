import { summarise } from '../features/library/quoteCache';
import { savedFixture } from './fixtures';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { AuthContext } from '../features/auth/AuthProvider';
import * as library from '../services/libraryService';
import { AddQuotePage } from '../pages/AddQuotePage';
import * as api from '../services/booksApi';
import * as quotes from '../services/quotesService';
import type { BookSearchResult, SelectedBook } from '../types';
const book: BookSearchResult = {
  source: 'open_library',
  source_id: 'OL1W',
  title: 'A selected work',
  authors: ['Writer'],
  description: null,
  published_date: '2020',
  cover_url: null,
  isbn_10: null,
  isbn_13: null,
};
afterEach(() => vi.restoreAllMocks());
function renderPage(selected: SelectedBook | null = book, userBookId?: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AuthContext.Provider
        value={{
          session: { user: { id: 'reader' } } as Session,
          loading: false,
          recovery: false,
          error: null,
        }}
      >
        <MemoryRouter
          initialEntries={[
            { pathname: '/quotes/new', state: { book: selected, userBookId } },
          ]}
        >
          <Routes>
            <Route path="/quotes/new" element={<AddQuotePage />} />
            <Route path="/books/:id" element={<p>Saved book</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
it('loads a selected description without erasing entered quote text', async () => {
  let resolve!: (value: string | null) => void;
  vi.spyOn(api, 'getBookDescription').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const save = vi
    .spyOn(quotes, 'saveQuote')
    .mockResolvedValue(savedFixture(book));
  renderPage();
  await waitFor(() => expect(api.getBookDescription).toHaveBeenCalled());
  await userEvent.type(
    screen.getByLabelText('The words you want to keep'),
    'A line already typed.',
  );
  expect(screen.getByRole('button', { name: 'Loading book…' })).toBeDisabled();
  await act(async () => resolve('A selected work description.'));
  expect(
    await screen.findByText('A selected work description.'),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('The words you want to keep')).toHaveValue(
    'A line already typed.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Keep this quote' }),
  );
  expect(await screen.findByText('Saved book')).toBeInTheDocument();
  expect(save).toHaveBeenCalledWith(
    { ...book, description: 'A selected work description.' },
    { text: 'A line already typed.', page_number: '', note: '' },
  );
});
it('allows saving search metadata when the optional description fails', async () => {
  vi.spyOn(api, 'getBookDescription').mockRejectedValue(
    new Error('Unavailable'),
  );
  const save = vi
    .spyOn(quotes, 'saveQuote')
    .mockResolvedValue(savedFixture(book));
  renderPage();
  expect(
    await screen.findByText(/The description couldn’t be loaded/),
  ).toBeInTheDocument();
  await userEvent.type(
    screen.getByLabelText('The words you want to keep'),
    'A line to keep.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Keep this quote' }),
  );
  expect(await screen.findByText('Saved book')).toBeInTheDocument();
  expect(save).toHaveBeenCalledWith(
    book,
    expect.objectContaining({ text: 'A line to keep.' }),
  );
});

it('saves against a selected library book without fetching external metadata', async () => {
  const savedBook = {
    ...book,
    id: 'catalog-id',
    created_at: '',
    updated_at: '',
    description: 'Already stored',
  };
  vi.spyOn(library, 'getLibrary').mockResolvedValue([
    {
      id: 'ub',
      user_id: 'reader',
      book_id: savedBook.id,
      created_at: '',
      books: savedBook,
      quotes: [{ count: 1 }],
    },
  ]);
  const description = vi.spyOn(api, 'getBookDescription');
  const search = vi.spyOn(api, 'searchBooks');
  const save = vi
    .spyOn(quotes, 'saveQuote')
    .mockResolvedValue(savedFixture(book, 'second'));
  renderPage(null);
  await userEvent.click(
    await screen.findByRole('button', {
      name: /^Choose A selected work/,
    }),
  );
  expect(screen.getByText('Already stored')).toBeInTheDocument();
  await userEvent.type(
    screen.getByLabelText('The words you want to keep'),
    'Another line.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Keep this quote' }),
  );
  expect(await screen.findByText('Saved book')).toBeInTheDocument();
  expect(save).toHaveBeenCalledWith(savedBook, {
    text: 'Another line.',
    page_number: '',
    note: '',
  });
  expect(description).not.toHaveBeenCalled();
  expect(search).not.toHaveBeenCalled();
});

it('loads canonical saved-book details on demand and retains typed text through retry', async () => {
  const response = savedFixture({
    ...book,
    description: 'Canonical stored description',
  });
  const get = vi
    .spyOn(library, 'getBook')
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue(response.library_entry);
  const external = vi.spyOn(api, 'getBookDescription');
  const save = vi.spyOn(quotes, 'saveQuote').mockResolvedValue(response);
  renderPage(summarise(response.library_entry).books, 'ub');
  await userEvent.type(
    screen.getByLabelText('The words you want to keep'),
    'Typed while details load.',
  );
  await screen.findByRole('alert');
  expect(
    screen.getByRole('button', { name: 'Keep this quote' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry book details' }),
  );
  await screen.findByText('Canonical stored description');
  expect(screen.getByLabelText('The words you want to keep')).toHaveValue(
    'Typed while details load.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Keep this quote' }),
  );
  await screen.findByText('Saved book');
  expect(get).toHaveBeenCalledTimes(2);
  expect(external).not.toHaveBeenCalled();
  expect(save).toHaveBeenCalledWith(
    response.library_entry.books,
    expect.objectContaining({ text: 'Typed while details load.' }),
  );
});

it('explains a stale saved-book selection without allowing an incomplete save', async () => {
  const response = savedFixture(book);
  vi.spyOn(library, 'getBook').mockResolvedValue(null);
  const save = vi.spyOn(quotes, 'saveQuote');
  renderPage(summarise(response.library_entry).books, 'ub');
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This book is no longer in your library',
  );
  expect(
    screen.getByRole('button', { name: 'Keep this quote' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Choose a different book' }),
  ).toBeEnabled();
  expect(save).not.toHaveBeenCalled();
});
