import { savedFixture } from './fixtures';
import { beforeEach, expect, it, vi } from 'vitest';
const rpc = vi.fn(),
  from = vi.fn();
vi.mock('../lib/supabase', () => ({ db: () => ({ rpc, from }) }));
import { saveQuote, deleteQuote, editQuote } from '../services/quotesService';
const book = {
  source: 'open_library' as const,
  source_id: 'OL1W',
  title: 'One',
  authors: [],
  description: null,
  published_date: null,
  cover_url: null,
  isbn_10: null,
  isbn_13: null,
};
beforeEach(() => vi.resetAllMocks());
it('sends one validated atomic save and returns authoritative IDs', async () => {
  rpc.mockResolvedValue({
    data: [savedFixture(book)],
    error: null,
  });
  expect(
    await saveQuote(book, { text: ' hello ', page_number: 'xiv', note: '' }),
  ).toEqual(savedFixture(book));
  expect(rpc).toHaveBeenCalledWith('save_quote_with_book_result', {
    book,
    quote: { text: 'hello', page_number: 'xiv', note: '' },
  });
  expect(from).not.toHaveBeenCalled();
});
it('does not call the database for invalid quotes', async () => {
  await expect(
    saveQuote(book, { text: ' ', note: '', page_number: '' }),
  ).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
it('propagates save and delete failures', async () => {
  rpc.mockResolvedValue({ data: null, error: new Error('Offline') });
  await expect(
    saveQuote(book, { text: 'hello', note: '', page_number: '' }),
  ).rejects.toThrow('Offline');
  await expect(deleteQuote('q')).rejects.toThrow('Offline');
});
it('updates only editable quote fields', async () => {
  const single = vi.fn().mockResolvedValue({ data: { id: 'q' }, error: null });
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  from.mockReturnValue({ update });
  await editQuote('q', { text: ' Edited ', note: '', page_number: '' });
  expect(update).toHaveBeenCalledWith({
    text: 'Edited',
    note: null,
    page_number: null,
  });
  expect(eq).toHaveBeenCalledWith('id', 'q');
});

import { isPublishableKey, isSupabaseUrl } from '../lib/publicConfig';
it('rejects secret and service-role keys in public configuration', () => {
  expect(isPublishableKey('sb_publishable_example')).toBe(true);
  expect(isPublishableKey('sb_secret_example')).toBe(false);
  expect(isPublishableKey('invalid')).toBe(false);
  expect(
    isPublishableKey(
      `header.${btoa(JSON.stringify({ role: 'anon' }))}.signature`,
    ),
  ).toBe(true);
  expect(
    isPublishableKey(
      `header.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`,
    ),
  ).toBe(false);
});

it('rejects invalid and non-HTTP backend URLs', () => {
  expect(isSupabaseUrl('http://127.0.0.1:54321')).toBe(true);
  expect(isSupabaseUrl('https://project.supabase.co')).toBe(true);
  expect(isSupabaseUrl('ftp://project.supabase.co')).toBe(false);
  expect(isSupabaseUrl('https://user:password@project.supabase.co')).toBe(
    false,
  );
  expect(isSupabaseUrl('invalid')).toBe(false);
});

import { getRandomHomepageQuote } from '../services/homepageQuotesService';
it('requests one random public sample through the dedicated RPC', async () => {
  const sample = {
    text: 'A sample',
    author: 'Writer',
    book_title: 'Book',
    published_year: '1900',
  };
  rpc.mockResolvedValue({ data: [sample], error: null });
  expect(await getRandomHomepageQuote()).toEqual(sample);
  expect(rpc).toHaveBeenCalledWith('get_random_homepage_quote');
  expect(from).not.toHaveBeenCalled();
});
it('returns null for an empty sample pool and propagates database errors', async () => {
  rpc
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: null, error: new Error('Unavailable') });
  expect(await getRandomHomepageQuote()).toBeNull();
  await expect(getRandomHomepageQuote()).rejects.toThrow('Unavailable');
});

import { getRandomLibraryQuote } from '../services/libraryQuotesService';
it('requests an owner-only random quote while excluding the current quote ID', async () => {
  const quote = {
    quote_id: 'q2',
    user_book_id: 'ub',
    text: 'My next quote',
    author: 'Writer',
    book_title: 'Book',
    published_year: '2020',
  };
  rpc.mockResolvedValue({ data: [quote], error: null });
  expect(await getRandomLibraryQuote('q1')).toEqual(quote);
  expect(rpc).toHaveBeenCalledWith('get_random_library_quote', {
    exclude_quote_id: 'q1',
  });
  expect(from).not.toHaveBeenCalled();
});
it('handles an empty personal quote pool and database errors', async () => {
  rpc
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: null, error: new Error('Offline') });
  expect(await getRandomLibraryQuote()).toBeNull();
  await expect(getRandomLibraryQuote()).rejects.toThrow('Offline');
});
