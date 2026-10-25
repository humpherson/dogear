import { afterEach, expect, it, vi } from 'vitest';
import { searchBooks } from '../services/booksApi';
import { openLibraryRequest } from '../services/openLibraryRequest';
vi.mock('../services/openLibraryRequest', () => ({
  openLibraryRequest: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
function respond(docs: unknown[]) {
  vi.mocked(openLibraryRequest).mockResolvedValue(
    new Response(JSON.stringify({ docs })),
  );
}
it('requests relevant works of any age and keeps provider relevance within cover groups', async () => {
  respond([
    {
      key: 'OL1W',
      title: 'Older relevant work',
      first_publish_year: 1894,
      cover_i: 1,
    },
    {
      key: 'OL2W',
      title: 'Newest relevant work',
      first_publish_year: 2025,
      cover_i: 2,
    },
    { key: 'OL3W', title: 'No cover' },
    { key: 'OL4W', title: 'Unknown year with cover', cover_i: 4 },
    {
      key: 'OL5W',
      title: 'Invalid cover',
      first_publish_year: 2020,
      cover_i: -1,
    },
  ]);
  const results = await searchBooks('a title');
  expect(results.map((book) => book.source_id)).toEqual([
    'OL1W',
    'OL2W',
    'OL4W',
    'OL3W',
    'OL5W',
  ]);
  expect(openLibraryRequest).toHaveBeenCalledTimes(1);
  const params = new URL(vi.mocked(openLibraryRequest).mock.calls[0][0])
    .searchParams;
  expect(params.get('q')).toBe('a title');
  expect(params.has('sort')).toBe(false);
  expect(params.get('limit')).toBe('12');
  expect(params.get('fields')).toBe(
    'key,title,author_name,first_publish_year,cover_i',
  );
});
it('keeps an old exact title ahead of newer related books even without a cover', async () => {
  respond([
    {
      key: 'OL1W',
      title: 'The Jungle Book: New Adventures',
      first_publish_year: 2025,
      cover_i: 1,
    },
    {
      key: 'OL2W',
      title: 'The Jungle Book',
      author_name: ['Rudyard Kipling'],
      first_publish_year: 1894,
    },
    {
      key: 'OL3W',
      title: 'Jungle stories',
      first_publish_year: 2024,
      cover_i: 3,
    },
  ]);
  const results = await searchBooks('The Jungle Book');
  expect(results.map((book) => book.source_id)).toEqual([
    'OL2W',
    'OL1W',
    'OL3W',
  ]);
  expect(results[0]).toMatchObject({
    title: 'The Jungle Book',
    published_date: '1894',
    cover_url: null,
  });
});
it('matches title casing, punctuation, spacing and optional leading articles before favouring covers', async () => {
  respond([
    { key: 'OL1W', title: 'A guide to the Jungle Book', cover_i: 1 },
    { key: 'OL2W', title: 'The Jungle Book' },
    { key: 'OL3W', title: 'Jungle Book', cover_i: 3 },
  ]);
  expect(
    (await searchBooks('  JUNGLE   BOOK!  ')).map((book) => book.source_id),
  ).toEqual(['OL3W', 'OL2W', 'OL1W']);
});
