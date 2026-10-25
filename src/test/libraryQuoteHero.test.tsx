import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthContext } from '../features/auth/AuthProvider';
import { LibraryQuoteHero } from '../components/quotes/LibraryQuoteHero';
import * as service from '../services/libraryQuotesService';
const quote = {
  quote_id: 'q1',
  user_book_id: 'ub1',
  text: 'Words from my own library.',
  author: 'A Writer',
  book_title: 'My Book',
  published_year: '2020',
};
afterEach(() => vi.restoreAllMocks());
function view(
  count = 2,
  user = 'reader',
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return (
    <QueryClientProvider client={client}>
      <AuthContext.Provider
        value={{
          session: { user: { id: user } } as Session,
          loading: false,
          recovery: false,
          error: null,
        }}
      >
        <MemoryRouter>
          <LibraryQuoteHero quoteCount={count} />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
it('shows a personal quote, attribution and a link to its book', async () => {
  vi.spyOn(service, 'getRandomLibraryQuote').mockResolvedValue(quote);
  render(view());
  expect(await screen.findByRole('blockquote')).toHaveTextContent(quote.text);
  expect(screen.getByText(quote.author)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'My Book' })).toHaveAttribute(
    'href',
    '/books/ub1',
  );
});
it('refreshes using the current quote ID and displays the next quote', async () => {
  const get = vi
    .spyOn(service, 'getRandomLibraryQuote')
    .mockResolvedValueOnce(quote)
    .mockResolvedValue({
      ...quote,
      quote_id: 'q2',
      text: 'Another personal quotation.',
    });
  render(view());
  await screen.findByText(quote.text);
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(
    await screen.findByText('Another personal quotation.'),
  ).toBeInTheDocument();
  expect(get).toHaveBeenLastCalledWith('q1', expect.anything());
  expect(screen.queryByText(quote.text)).not.toBeInTheDocument();
});
it('explains a single-quote library and disables unnecessary refreshes', async () => {
  const get = vi
    .spyOn(service, 'getRandomLibraryQuote')
    .mockResolvedValue(quote);
  render(view(1));
  await screen.findByText(quote.text);
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  expect(
    screen.getByText('Save another quote to refresh this selection.'),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(get).toHaveBeenCalledOnce();
});
it('shows loading feedback and prevents concurrent refreshes', () => {
  vi.spyOn(service, 'getRandomLibraryQuote').mockImplementation(
    () => new Promise(() => {}),
  );
  render(view());
  expect(screen.getByRole('status')).toHaveTextContent('Finding a quote');
  expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled();
});
it('allows retrying an initial load error, including a single-quote library', async () => {
  vi.spyOn(service, 'getRandomLibraryQuote')
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue(quote);
  render(view(1));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We couldn’t load your quote',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText(quote.text)).toBeInTheDocument();
});
it('retains the displayed quote if refresh fails', async () => {
  vi.spyOn(service, 'getRandomLibraryQuote')
    .mockResolvedValueOnce(quote)
    .mockRejectedValue(new Error('Offline'));
  render(view());
  await screen.findByText(quote.text);
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We couldn’t refresh your quote',
  );
  expect(screen.getByText(quote.text)).toBeInTheDocument();
});
it('does not show the previous account’s quote while another account loads', async () => {
  vi.spyOn(service, 'getRandomLibraryQuote')
    .mockResolvedValueOnce(quote)
    .mockImplementation(() => new Promise(() => {}));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rendered = render(view(2, 'reader-a', client));
  await screen.findByText(quote.text);
  rendered.rerender(view(2, 'reader-b', client));
  await waitFor(() =>
    expect(screen.queryByText(quote.text)).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('status')).toHaveTextContent('Finding a quote');
});
it.each([
  ['maximum length', 'A'.repeat(10000)],
  [
    'many lines',
    Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`).join('\n'),
  ],
  ['Unicode', '📚'.repeat(200)],
])(
  'keeps a %s passage compact, reveals its full text, and resets after refresh',
  async (_, text) => {
    const next = { ...quote, quote_id: 'q2', text: 'A fresh thought.' };
    vi.spyOn(service, 'getRandomLibraryQuote')
      .mockResolvedValueOnce({ ...quote, text })
      .mockResolvedValue(next);
    render(view());
    const expand = await screen.findByRole('button', {
      name: 'Read full quote',
    });
    const passage = screen.getByRole('blockquote');
    expect(Array.from(passage.textContent || '').length).toBeLessThanOrEqual(
      160,
    );
    expect(passage.textContent).not.toContain('\uFFFD');
    await userEvent.click(expand);
    expect(passage.textContent).toBe(text);
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(Array.from(passage.textContent || '').length).toBeLessThanOrEqual(
      160,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Read full quote' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText(next.text);
    expect(
      screen.queryByRole('button', { name: 'Show less' }),
    ).not.toBeInTheDocument();
  },
);
