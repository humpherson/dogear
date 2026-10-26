import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthContext } from '../features/auth/AuthProvider';
import { QuoteForm } from '../components/quotes/QuoteForm';
import { LibraryQuoteHero } from '../components/quotes/LibraryQuoteHero';
import * as dictionary from '../services/dictionaryService';
import * as sampler from '../services/libraryQuotesService';
import { savedItemSchema } from '../lib/validation';
import { matchesItem } from '../components/quotes/ItemFilters';
import type { Quote } from '../types';
afterEach(() => vi.restoreAllMocks());
function view(child: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AuthContext.Provider
        value={{
          session: { user: { id: 'owner' } } as Session,
          loading: false,
          recovery: false,
          error: null,
        }}
      >
        <MemoryRouter>{child}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
it('lets a manually written meaning save without running dictionary lookup', async () => {
  const lookup = vi.spyOn(dictionary, 'findMeanings');
  const submit = vi.fn();
  view(<QuoteForm itemType="definition" onSubmit={submit} pending={false} />);
  await userEvent.type(screen.getByLabelText('Word or phrase'), 'déjà vu');
  await userEvent.type(
    screen.getByLabelText('Meaning'),
    'A feeling of prior experience.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Keep this definition' }),
  );
  await waitFor(() => expect(submit).toHaveBeenCalled());
  expect(submit.mock.calls[0][0]).toMatchObject({
    item_type: 'definition',
    term: 'déjà vu',
    text: 'A feeling of prior experience.',
  });
  expect(lookup).not.toHaveBeenCalled();
});
it('does not overwrite a manual draft when lookup finishes and applies a selected meaning explicitly', async () => {
  let resolve!: (value: dictionary.DictionaryMeaning[]) => void;
  vi.spyOn(dictionary, 'findMeanings').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const draft = vi.fn();
  view(
    <QuoteForm
      itemType="definition"
      onSubmit={vi.fn()}
      onDraftChange={draft}
      pending={false}
    />,
  );
  await userEvent.type(screen.getByLabelText('Word or phrase'), 'serendipity');
  await userEvent.click(screen.getByRole('button', { name: 'Find meaning' }));
  expect(screen.getByRole('status')).toHaveTextContent('Finding meanings');
  await userEvent.type(screen.getByLabelText('Meaning'), 'My own explanation.');
  expect(
    screen.getByRole('button', { name: 'Keep this definition' }),
  ).toBeEnabled();
  await act(async () =>
    resolve([
      {
        definition: 'A fortunate discovery.',
        partOfSpeech: 'noun',
        attribution: {
          provider: 'free-dictionary-api',
          source_urls: ['https://en.wiktionary.org/wiki/serendipity'],
        },
      },
    ]),
  );
  await screen.findByText('A fortunate discovery.');
  expect(screen.getByLabelText('Meaning')).toHaveValue('My own explanation.');
  await userEvent.click(
    screen.getByRole('button', { name: 'Replace meaning' }),
  );
  expect(screen.getByLabelText('Meaning')).toHaveValue(
    'A fortunate discovery.',
  );
  expect(draft.mock.calls.at(-1)?.[0].lookup_attribution.provider).toBe(
    'free-dictionary-api',
  );
  expect(draft.mock.calls.at(-1)?.[0].lookup_attribution.source_urls).toEqual([
    'https://en.wiktionary.org/wiki/serendipity',
  ]);
  expect(
    screen.queryByText(/Based on Free Dictionary API/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Source' }),
  ).not.toBeInTheDocument();
});
it('shows manual fallback for missing or unavailable words', async () => {
  vi.spyOn(dictionary, 'findMeanings').mockResolvedValue([]);
  view(<QuoteForm itemType="definition" onSubmit={vi.fn()} pending={false} />);
  await userEvent.type(screen.getByLabelText('Word or phrase'), 'unknown');
  await userEvent.click(screen.getByRole('button', { name: 'Find meaning' }));
  expect(await screen.findByText(/No definition found/)).toBeVisible();
  expect(screen.getByLabelText('Meaning')).toBeEnabled();
});
it('rejects invalid type/term combinations while supporting phrases', () => {
  expect(
    savedItemSchema.safeParse({
      item_type: 'definition',
      term: '',
      text: 'meaning',
      page_number: '',
      note: '',
    }).success,
  ).toBe(false);
  expect(
    savedItemSchema.safeParse({
      item_type: 'quote',
      term: 'word',
      text: 'quote',
      page_number: '',
      note: '',
    }).success,
  ).toBe(false);
  expect(
    savedItemSchema.safeParse({
      item_type: 'definition',
      term: 'déjà vu',
      text: 'meaning',
      page_number: '',
      note: '',
    }).success,
  ).toBe(true);
});
it('combines content-type and term/meaning filters', () => {
  const item = {
    item_type: 'definition',
    term: 'serendipity',
    text: 'A fortunate discovery.',
  } as Quote;
  expect(matchesItem(item, 'all', 'serendipity')).toBe(true);
  expect(matchesItem(item, 'definition', 'fortunate')).toBe(true);
  expect(matchesItem(item, 'quote', 'fortunate')).toBe(false);
});
it('displays a definition hero with its word and book context rather than an author credit', async () => {
  vi.spyOn(sampler, 'getRandomLibraryQuote').mockResolvedValue({
    quote_id: 'q',
    user_book_id: 'b',
    entry_kind: 'book',
    entry_title: 'A book',
    item_type: 'definition',
    term: 'serendipity',
    text: 'A fortunate discovery.',
    author: '',
    book_title: '',
    published_year: '',
  });
  view(<LibraryQuoteHero quoteCount={1} />);
  expect(
    await screen.findByRole('heading', { name: 'serendipity' }),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'A book' })).toHaveAttribute(
    'href',
    '/books/b',
  );
  expect(screen.queryByRole('blockquote')).not.toBeInTheDocument();
});
