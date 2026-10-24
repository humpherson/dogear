import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as booksApi from '../services/booksApi';
import { normalizeGoogleBooks, searchGoogleBooks } from '../services/booksApi';
import { BookSearch } from '../components/books/BookSearch';
const payload = {
  items: [
    {
      id: 'Google_1',
      volumeInfo: {
        title: 'A Google book',
        authors: ['Writer'],
        description: '<p>A description</p><script>bad()</script>',
        publishedDate: '2020-05',
        imageLinks: { thumbnail: 'http://books.google.com/cover.jpg' },
        industryIdentifiers: [
          { type: 'ISBN_10', identifier: '123456789X' },
          { type: 'ISBN_13', identifier: '9781234567890' },
        ],
      },
    },
  ],
};
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('normalises Google volumes without mixing provider identities or unsafe metadata', () => {
  const result = normalizeGoogleBooks(payload);
  expect(result[0]).toMatchObject({
    source: 'google_books',
    source_id: 'Google_1',
    title: 'A Google book',
    description: 'A description',
    published_date: '2020-05',
    cover_url: 'https://books.google.com/cover.jpg',
    isbn_10: '123456789X',
    isbn_13: '9781234567890',
  });
  expect(
    normalizeGoogleBooks({
      items: [
        ...payload.items,
        ...payload.items,
        null,
        { id: 'bad id', volumeInfo: { title: 'Bad' } },
        { id: 'empty' },
      ],
    }),
  ).toHaveLength(1);
  expect(
    normalizeGoogleBooks({
      items: [
        {
          id: 'minimal',
          volumeInfo: {
            title: 'Minimal',
            publishedDate: 'unknown',
            imageLinks: { thumbnail: 'javascript:bad()' },
            authors: [123],
            industryIdentifiers: [{ type: 'ISBN_13', identifier: 'bad' }],
          },
        },
      ],
    })[0],
  ).toMatchObject({
    authors: [],
    published_date: null,
    cover_url: null,
    isbn_13: null,
  });
  expect(normalizeGoogleBooks({})).toEqual([]);
});
it('uses the Books API documented key parameter and abort signal', async () => {
  vi.stubEnv('VITE_GOOGLE_BOOKS_API_KEY', 'test-key');
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => payload });
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  expect(
    await searchGoogleBooks('  Google book  ', controller.signal),
  ).toHaveLength(1);
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toContain('q=Google+book');
  expect(new URL(url).searchParams.get('key')).toBe('test-key');
  expect(options.headers).toBeUndefined();
  controller.abort();
  expect(options.signal.aborted).toBe(true);
});
it('rejects missing keys, quota and restriction errors with clear retry guidance', async () => {
  vi.stubEnv('VITE_GOOGLE_BOOKS_API_KEY', '');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  expect(await searchGoogleBooks('ab')).toEqual([]);
  await expect(searchGoogleBooks('book')).rejects.toThrow('not configured');
  expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv('VITE_GOOGLE_BOOKS_API_KEY', 'test-key');
  fetcher
    .mockResolvedValueOnce({ ok: false, status: 429 })
    .mockResolvedValueOnce({ ok: false, status: 403 });
  await expect(searchGoogleBooks('book')).rejects.toThrow('busy');
  await expect(searchGoogleBooks('book')).rejects.toThrow('restrictions');
});
it('switches providers without showing stale results and selects Google metadata without a second request', async () => {
  vi.stubEnv('VITE_GOOGLE_BOOKS_API_KEY', 'test-key');
  // Exercise retained provider UI code independently of its production visibility flag.
  vi.spyOn(booksApi, 'googleBooksEnabled').mockReturnValue(true);
  let abortSignal: AbortSignal | undefined;
  const fetcher = vi
    .fn()
    .mockImplementation((url: string, options: { signal: AbortSignal }) => {
      if (url.includes('openlibrary.org')) {
        abortSignal = options.signal;
        return new Promise((_resolve, reject) =>
          options.signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          ),
        );
      }
      return Promise.resolve({ ok: true, json: async () => payload });
    });
  vi.stubGlobal('fetch', fetcher);
  const select = vi.fn();
  const user = userEvent.setup();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <BookSearch onSelect={select} />
    </QueryClientProvider>,
  );
  await user.type(
    screen.getByRole('combobox', { name: 'Find a book' }),
    'book',
  );
  await waitFor(() => expect(abortSignal).toBeDefined());
  await user.selectOptions(
    screen.getByLabelText('Book catalogue'),
    'google_books',
  );
  const grid = await screen.findByRole('grid', {
    name: 'Google Books search results',
  });
  expect(abortSignal?.aborted).toBe(true);
  await user.click(
    await screen.findByRole('button', { name: /A Google book/ }),
  );
  expect(select).toHaveBeenCalledWith(
    expect.objectContaining({
      source: 'google_books',
      source_id: 'Google_1',
      description: 'A description',
    }),
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(grid).not.toBeVisible();
  expect(screen.getByAltText('Powered by Google')).toBeInTheDocument();
});
it('keeps Open Library available without Google configuration', () => {
  vi.stubEnv('VITE_GOOGLE_BOOKS_API_KEY', '');
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BookSearch onSelect={vi.fn()} />
    </QueryClientProvider>,
  );
  expect(screen.queryByLabelText('Book catalogue')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Find a book')).toBeInTheDocument();
});

it('recognises a zero daily quota inside a 503 response without exposing project details', async () => {
  vi.stubEnv('VITE_GOOGLE_BOOKS_API_KEY', 'test-key');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            message:
              'Quota exceeded for Queries per day for project_number:12345',
            details: [
              {
                metadata: {
                  quota_limit_value: '0',
                  quota_unit: '1/d/{project}',
                  quota_limit: 'defaultPerDayPerProject',
                  consumer: 'projects/12345',
                },
              },
            ],
          },
        }),
        { status: 503 },
      ),
    ),
  );
  await expect(searchGoogleBooks('mark')).rejects.toThrow(
    'Google Books has no daily search allowance. Choose Open Library.',
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('recognises an exhausted nonzero daily allowance without retrying', async () => {
  vi.stubEnv('VITE_GOOGLE_BOOKS_API_KEY', 'test-key');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            details: [
              {
                metadata: {
                  quota_limit_value: '1000',
                  quota_unit: '1/d/{project}',
                },
              },
            ],
          },
        }),
        { status: 503 },
      ),
    ),
  );
  await expect(searchGoogleBooks('mark')).rejects.toThrow(
    'daily search allowance has been reached',
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});

function serviceFailure(headers?: HeadersInit) {
  return new Response(
    JSON.stringify({
      error: { code: 503, errors: [{ reason: 'backendFailed' }] },
    }),
    { status: 503, headers },
  );
}
it('recovers on attempt three with exponential delays and jitter', async () => {
  vi.useFakeTimers();
  vi.stubEnv('VITE_GOOGLE_BOOKS_API_KEY', 'test-key');
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(serviceFailure())
    .mockResolvedValueOnce(serviceFailure())
    .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
  vi.stubGlobal('fetch', fetcher);
  const result = searchGoogleBooks('mark');
  await vi.advanceTimersByTimeAsync(749);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1499);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(await result).toHaveLength(1);
  expect(random).toHaveBeenCalledTimes(2);
});
it('stops after three transient failures, including non-JSON proxy responses', async () => {
  vi.useFakeTimers();
  vi.stubEnv('VITE_GOOGLE_BOOKS_API_KEY', 'test-key');
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const fetcher = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response('<html>Backend unavailable</html>', { status: 503 }),
    );
  vi.stubGlobal('fetch', fetcher);
  const result = expect(searchGoogleBooks('mark')).rejects.toThrow(
    'Google Books is unavailable',
  );
  await vi.advanceTimersByTimeAsync(10000);
  await result;
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('cancels a backoff delay without issuing another request', async () => {
  vi.useFakeTimers();
  vi.stubEnv('VITE_GOOGLE_BOOKS_API_KEY', 'test-key');
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const fetcher = vi.fn().mockResolvedValueOnce(serviceFailure());
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  const result = expect(
    searchGoogleBooks('mark', controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(100);
  controller.abort();
  await result;
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('honours Retry-After before the next attempt', async () => {
  vi.useFakeTimers();
  vi.stubEnv('VITE_GOOGLE_BOOKS_API_KEY', 'test-key');
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(serviceFailure({ 'Retry-After': '3' }))
    .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
  vi.stubGlobal('fetch', fetcher);
  const result = searchGoogleBooks('mark');
  await vi.advanceTimersByTimeAsync(2999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not retry an inner key error wrapped in HTTP 503', async () => {
  vi.stubEnv('VITE_GOOGLE_BOOKS_API_KEY', 'test-key');
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED' } }),
        { status: 503 },
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  await expect(searchGoogleBooks('mark')).rejects.toThrow(
    'Google Books rejected',
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('retries a transient connection failure and keeps the original cancellation signal', async () => {
  vi.useFakeTimers();
  vi.stubEnv('VITE_GOOGLE_BOOKS_API_KEY', 'test-key');
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('Connection lost'))
    .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  const result = searchGoogleBooks('mark', controller.signal);
  await vi.advanceTimersByTimeAsync(500);
  expect(await result).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  controller.abort();
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
});

it('keeps a long Retry-After within the overall 20-second search deadline', async () => {
  vi.useFakeTimers();
  vi.stubEnv('VITE_GOOGLE_BOOKS_API_KEY', 'test-key');
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException('Timed out', 'TimeoutError')),
      milliseconds,
    );
    return controller.signal;
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(serviceFailure({ 'Retry-After': '3600' }));
  vi.stubGlobal('fetch', fetcher);
  const result = expect(searchGoogleBooks('mark')).rejects.toThrow(
    'Google Books took too long',
  );
  await vi.advanceTimersByTimeAsync(19999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await result;
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('keeps Google discovery hidden even when its key is configured', () => {
  vi.stubEnv('VITE_GOOGLE_BOOKS_API_KEY', 'test-key');
  expect(booksApi.googleBooksEnabled()).toBe(false);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BookSearch onSelect={vi.fn()} />
    </QueryClientProvider>,
  );
  expect(screen.queryByLabelText('Book catalogue')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Find a book')).toBeInTheDocument();
  expect(screen.queryByAltText('Powered by Google')).not.toBeInTheDocument();
});
