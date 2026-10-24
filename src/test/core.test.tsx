import { AppShell } from '../components/layout/AppShell';
import * as auth from '../services/authService';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Session } from '@supabase/supabase-js';
import { normalizeBooks, normalizeDescription } from '../services/booksApi';
import { quoteSchema } from '../lib/validation';
import { readCallback, safeDestination } from '../features/auth/callback';
import { AuthContext, type AuthState } from '../features/auth/AuthProvider';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { QuoteForm } from '../components/quotes/QuoteForm';
import { BookSearch } from '../components/books/BookSearch';
import { LibraryPage } from '../pages/LibraryPage';
import { QuoteCard } from '../components/quotes/QuoteCard';
import type { Quote } from '../types';
import * as library from '../services/libraryService';
import * as quotes from '../services/quotesService';
import * as libraryQuotes from '../services/libraryQuotesService';
const server = setupServer();
beforeEach(() =>
  vi.spyOn(libraryQuotes, 'getRandomLibraryQuote').mockResolvedValue(null),
);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
afterAll(() => server.close());
function providers(ui: React.ReactNode, state: Partial<AuthState> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider
        value={{
          session: { user: { id: 'a' } } as Session,
          loading: false,
          recovery: false,
          error: null,
          ...state,
        }}
      >
        <MemoryRouter>{ui}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
describe('Open Library normalization', () => {
  it('handles missing fields, bare work IDs, malformed records, and duplicates', () => {
    const books = normalizeBooks({
      docs: [
        { key: '/works/OL1W', title: 'A book' },
        { key: 'OL1W', title: 'Duplicate' },
        {
          key: 'OL2W',
          title: 'Other',
          author_name: [5, 'Writer'],
          first_publish_year: 'unknown',
          cover_i: -1,
        },
        null,
        { key: '/books/OL3M', title: 'An edition' },
        { key: 'OL4W' },
      ],
    });
    expect(books).toHaveLength(2);
    expect(books[0]).toMatchObject({
      source: 'open_library',
      source_id: 'OL1W',
      authors: [],
      cover_url: null,
      published_date: null,
      description: null,
      isbn_10: null,
      isbn_13: null,
    });
    expect(books[1].authors).toEqual(['Writer']);
    expect(books[1].cover_url).toBeNull();
  });
  it('uses cover IDs and first-publication years without mixing edition ISBNs', () => {
    expect(
      normalizeBooks({
        docs: [
          {
            key: '/works/OL1W',
            title: 'Title',
            first_publish_year: 1813,
            cover_i: 14348537,
            isbn: ['9780000000000'],
          },
        ],
      })[0],
    ).toMatchObject({
      published_date: '1813',
      cover_url:
        'https://covers.openlibrary.org/b/id/14348537-M.jpg?default=false',
      isbn_13: null,
    });
  });
  it('normalizes string and object descriptions as text', () => {
    expect(
      normalizeDescription({
        description: {
          value: '<p>Hello <b>reader</b></p><script>bad()</script>',
        },
      }),
    ).toBe('Hello reader');
    expect(normalizeDescription({ description: 'A plain description' })).toBe(
      'A plain description',
    );
    expect(normalizeDescription({})).toBeNull();
  });
});
describe('validation and redirects', () => {
  it('rejects blank and oversized quotes, notes and page references', () => {
    for (const value of [
      { text: ' \n ', note: '', page_number: '' },
      { text: 'x'.repeat(10001), note: '', page_number: '' },
      { text: 'a', note: 'x'.repeat(5001), page_number: '' },
      { text: 'a', note: '', page_number: 'x'.repeat(101) },
    ])
      expect(quoteSchema.safeParse(value).success).toBe(false);
    expect(
      quoteSchema.parse({ text: '  hello  ', note: '', page_number: 'xiv' })
        .text,
    ).toBe('hello');
  });
  it('recognizes auth fragments before hash routing', () => {
    expect(
      readCallback({
        hash: '#access_token=abc&type=recovery',
        search: '?auth=callback',
      }),
    ).toEqual({ active: true, recovery: true, error: null });
    expect(readCallback({ hash: '#/library', search: '' }).active).toBe(false);
    expect(
      readCallback({ hash: '#error_description=Expired+link', search: '' })
        .error,
    ).toBe('Expired link');
    expect(safeDestination('//evil.test')).toBe('/library');
    expect(safeDestination('/\\evil.test')).toBe('/library');
    expect(safeDestination('/books/123')).toBe('/books/123');
  });
  it('shows field errors without submitting', async () => {
    const submit = vi.fn();
    render(<QuoteForm onSubmit={submit} pending={false} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Keep this quote' }),
    );
    expect(await screen.findByText('Enter a quotation.')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });
});
it('gives simultaneous quote editors separate labels and error targets', () => {
  render(
    <>
      <QuoteForm onSubmit={vi.fn()} pending={false} />
      <QuoteForm onSubmit={vi.fn()} pending={false} />
    </>,
  );
  const fields = screen.getAllByLabelText('The words you want to keep');
  expect(fields[0].id).not.toBe(fields[1].id);
  expect(fields[0].getAttribute('aria-describedby')).not.toBe(
    fields[1].getAttribute('aria-describedby'),
  );
});
describe('route guards', () => {
  const routes = (
    <Routes>
      <Route path="/" element={<ProtectedRoute />}>
        <Route index element={<p>Private page</p>} />
      </Route>
      <Route path="/login" element={<p>Login page</p>} />
    </Routes>
  );
  it('waits for initial auth resolution', () => {
    providers(routes, { loading: true, session: null });
    expect(screen.getByRole('status')).toHaveTextContent('Opening');
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });
  it('redirects signed-out users', () => {
    providers(routes, { session: null });
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });
  it('admits signed-in users', () => {
    providers(routes);
    expect(screen.getByText('Private page')).toBeInTheDocument();
  });
});
describe('book autocomplete', () => {
  it('debounces, hides stale results, and selects with the keyboard', async () => {
    const requests: string[] = [];
    server.use(
      http.get('https://openlibrary.org/search.json', ({ request }) => {
        expect(new URL(request.url).searchParams.get('sort')).toBe('new');
        requests.push(new URL(request.url).searchParams.get('q')!);
        return HttpResponse.json({
          docs: [{ key: '/works/OL1W', title: 'Reading slowly' }],
        });
      }),
    );
    const select = vi.fn();
    providers(<BookSearch onSelect={select} />);
    const user = userEvent.setup();
    const input = screen.getByRole('combobox');
    await user.type(input, 're');
    await new Promise((resolve) => setTimeout(resolve, 340));
    expect(requests).toHaveLength(0);
    await user.type(input, 'ading');
    expect(requests).toHaveLength(0);
    expect(
      await screen.findByRole('option', {}, { timeout: 4000 }),
    ).toHaveTextContent('Reading slowly');
    expect(requests).toEqual(['reading']);
    await user.type(input, 'x');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    await screen.findByRole('option', {}, { timeout: 4000 });
    await user.keyboard('{ArrowDown}{Enter}');
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ source_id: 'OL1W' }),
    );
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });
  it('aborts the previous in-flight request when the debounced query changes', async () => {
    let aborted = false;
    let started = false;
    server.use(
      http.get('https://openlibrary.org/search.json', async ({ request }) => {
        if (new URL(request.url).searchParams.get('q') === 'old') {
          started = true;
          await new Promise<void>((resolve) => {
            request.signal.addEventListener('abort', () => {
              aborted = true;
              resolve();
            });
          });
          return HttpResponse.json({
            docs: [{ key: '/works/OL2W', title: 'Old result' }],
          });
        }
        return HttpResponse.json({
          docs: [{ key: '/works/OL3W', title: 'New result' }],
        });
      }),
    );
    providers(<BookSearch onSelect={vi.fn()} />);
    const user = userEvent.setup();
    const input = screen.getByRole('combobox');
    await user.type(input, 'old');
    await waitFor(() => expect(started).toBe(true), { timeout: 4000 });
    await user.clear(input);
    await user.type(input, 'new');
    expect(
      await screen.findByRole('option', {}, { timeout: 4000 }),
    ).toHaveTextContent('New result');
    await waitFor(() => expect(aborted).toBe(true));
    expect(screen.queryByText('Old result')).not.toBeInTheDocument();
  });
  it('offers retry after an API error', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    server.use(
      http.get(
        'https://openlibrary.org/search.json',
        () => new HttpResponse(null, { status: 429 }),
      ),
    );
    providers(<BookSearch onSelect={vi.fn()} />);
    await userEvent.type(screen.getByRole('combobox'), 'books');
    expect(
      await screen.findByRole('alert', {}, { timeout: 8000 }),
    ).toHaveTextContent('Open Library is busy');
    expect(
      screen.getByRole('button', { name: 'Retry search' }),
    ).toBeInTheDocument();
  }, 10000);
});
describe('library and quote interactions', () => {
  it('renders a real empty state', async () => {
    vi.spyOn(library, 'getLibrary').mockResolvedValue([]);
    providers(<LibraryPage />);
    expect(
      await screen.findByText('Your first dogeard is waiting.'),
    ).toBeInTheDocument();
  });
  it('renders one card per association and the server quote count', async () => {
    vi.spyOn(libraryQuotes, 'getRandomLibraryQuote').mockResolvedValue(null);
    vi.spyOn(library, 'getLibrary').mockResolvedValue([
      {
        id: 'ub',
        user_id: 'a',
        book_id: 'b',
        created_at: '',
        books: {
          id: 'b',
          source: 'open_library',
          source_id: 'OL1W',
          title: 'A book',
          authors: ['Writer'],
          description: null,
          published_date: null,
          cover_url: null,
          isbn_10: null,
          isbn_13: null,
          created_at: '',
          updated_at: '',
        },
        quotes: [{ count: 2 }],
      },
    ]);
    providers(<LibraryPage />);
    expect(
      await screen.findByRole('heading', { name: 'A book' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 quotes kept')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /A book/ })).toHaveLength(1);
  });
  const quote: Quote = {
    id: 'q',
    user_id: 'a',
    user_book_id: 'ub',
    text: 'Original words',
    note: null,
    page_number: '42',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
  it('persists an edit before closing the form', async () => {
    const edit = vi
      .spyOn(quotes, 'editQuote')
      .mockResolvedValue({ ...quote, text: 'Updated words' });
    providers(<QuoteCard quote={quote} onDeleted={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const input = screen.getByLabelText('The words you want to keep');
    await user.clear(input);
    await user.type(input, 'Updated words');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(edit).toHaveBeenCalledWith('q', {
        text: 'Updated words',
        note: '',
        page_number: '42',
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: 'The words you want to keep' }),
      ).not.toBeInTheDocument(),
    );
  });
  it('confirms deletion and retains the dialog on failure', async () => {
    const remove = vi
      .spyOn(quotes, 'deleteQuote')
      .mockRejectedValue(new Error('Could not delete'));
    const deleted = vi.fn();
    providers(<QuoteCard quote={quote} onDeleted={deleted} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete quote' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete',
    );
    expect(deleted).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
  it('notifies the page only after a confirmed deletion', async () => {
    vi.spyOn(quotes, 'deleteQuote').mockResolvedValue({
      user_book_id: 'ub',
      remaining_count: 0,
    });
    const deleted = vi.fn();
    providers(<QuoteCard quote={quote} onDeleted={deleted} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete quote' }));
    await waitFor(() => expect(deleted).toHaveBeenCalledOnce());
  });
});

it('offers navigation sign-out with pending feedback and retryable errors', async () => {
  let reject!: (error: Error) => void;
  const signOut = vi
    .spyOn(auth, 'signOut')
    .mockImplementationOnce(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValue(undefined);
  providers(<AppShell />);
  expect(
    screen.queryByRole('link', { name: 'Settings' }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
  reject(new Error('Connection lost'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() =>
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
  );
  expect(signOut).toHaveBeenCalledTimes(2);
});
