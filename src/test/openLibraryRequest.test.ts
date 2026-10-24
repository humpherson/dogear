import { afterEach, expect, it, vi } from 'vitest';
import { createRateLimitedFetch } from '../services/openLibraryRequest';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('spaces search and detail request starts at least 1.1 seconds apart', async () => {
  vi.useFakeTimers();
  const starts: number[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      starts.push(Date.now());
      return new Response('{}');
    }),
  );
  const request = createRateLimitedFetch();
  const a = request('https://openlibrary.org/search.json');
  const b = request('https://openlibrary.org/works/OL1W.json');
  await vi.advanceTimersByTimeAsync(0);
  expect(starts).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1099);
  expect(starts).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  await Promise.all([a, b]);
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1100);
});
it('aborts a queued request without sending it or blocking later requests', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  const request = createRateLimitedFetch();
  await request('first');
  const controller = new AbortController();
  const cancelled = request('cancelled', controller.signal);
  const rejected = expect(cancelled).rejects.toMatchObject({
    name: 'AbortError',
  });
  controller.abort();
  await vi.advanceTimersByTimeAsync(1100);
  await rejected;
  const last = request('last');
  await vi.advanceTimersByTimeAsync(1100);
  await last;
  expect(fetch.mock.calls).toHaveLength(2);
});
it('honors Retry-After for subsequent requests', async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('{}', { status: 429, headers: { 'Retry-After': '3' } }),
    )
    .mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  const request = createRateLimitedFetch();
  await request('first');
  const next = request('next');
  await vi.advanceTimersByTimeAsync(2999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await next;
  expect(fetch).toHaveBeenCalledTimes(2);
});
