import { afterEach, expect, it, vi } from 'vitest';
import { searchBooks } from '../services/booksApi';
import { openLibraryRequest } from '../services/openLibraryRequest';
vi.mock('../services/openLibraryRequest', () => ({
  openLibraryRequest: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
it('requests newest works and prioritises covers without discarding other matches', async () => {
  const docs = [
    { key: 'OL1W', title: 'Newest without cover', first_publish_year: 2025 },
    { key: 'OL2W', title: 'Older cover', first_publish_year: 2010, cover_i: 2 },
    { key: 'OL3W', title: 'Newer cover', first_publish_year: 2024, cover_i: 3 },
    { key: 'OL4W', title: 'Unknown year with cover', cover_i: 4 },
    { key: 'OL5W', title: 'Unknown year' },
    {
      key: 'OL6W',
      title: 'Invalid cover',
      first_publish_year: 2020,
      cover_i: -1,
    },
    {
      key: 'OL7W',
      title: 'Same year cover',
      first_publish_year: 2024,
      cover_i: 7,
    },
  ];
  vi.mocked(openLibraryRequest).mockResolvedValue(
    new Response(JSON.stringify({ docs })),
  );
  const results = await searchBooks('a title');
  expect(results.map((book) => book.source_id)).toEqual([
    'OL3W',
    'OL7W',
    'OL2W',
    'OL4W',
    'OL1W',
    'OL6W',
    'OL5W',
  ]);
  expect(openLibraryRequest).toHaveBeenCalledTimes(1);
  const [url] = vi.mocked(openLibraryRequest).mock.calls[0];
  const params = new URL(url).searchParams;
  expect(params.get('q')).toBe('a title');
  expect(params.get('sort')).toBe('new');
  expect(params.get('limit')).toBe('12');
  expect(params.get('fields')).toBe(
    'key,title,author_name,first_publish_year,cover_i',
  );
});
