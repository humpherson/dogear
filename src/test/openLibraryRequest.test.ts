import { afterEach, expect, it, vi } from 'vitest';
import {
  createOpenLibraryRequest,
  createRateLimitedFetch,
} from '../services/openLibraryRequest';
afterEach(() => {
  vi.restoreAllMocks();
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

it('starts a later request without waiting for a slow response', async () => {
  vi.useFakeTimers();
  let finish!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  const request = createRateLimitedFetch();
  const first = request('slow');
  const next = request('next');
  await vi.advanceTimersByTimeAsync(1100);
  await next;
  expect(fetcher).toHaveBeenCalledTimes(2);
  finish(new Response('{}'));
  await first;
});
it('recovers with exponential equal jitter and at most three attempts', async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockRejectedValueOnce(new TypeError('connection failed'))
    .mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  const pending = createOpenLibraryRequest(0)('search');
  await vi.advanceTimersByTimeAsync(749);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1499);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect((await pending).ok).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it.each([400, 401, 403, 404])(
  'does not retry permanent HTTP %i errors',
  async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status }));
    vi.stubGlobal('fetch', fetcher);
    expect((await createOpenLibraryRequest()('search')).status).toBe(status);
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it('stops after three transient failures and respects shared spacing', async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const starts: number[] = [];
  const fetcher = vi.fn(async () => {
    starts.push(Date.now());
    return new Response('', { status: 502 });
  });
  vi.stubGlobal('fetch', fetcher);
  const pending = createOpenLibraryRequest()('search');
  await vi.advanceTimersByTimeAsync(2200);
  expect((await pending).status).toBe(502);
  expect(starts).toHaveLength(3);
  expect(starts[1] - starts[0]).toBe(1100);
  expect(starts[2] - starts[1]).toBe(1100);
});
it('honours Retry-After before retrying a throttled request', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('', { status: 429, headers: { 'Retry-After': '3' } }),
    )
    .mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  const pending = createOpenLibraryRequest()('search');
  await vi.advanceTimersByTimeAsync(2999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect((await pending).ok).toBe(true);
});
it('cancels pending backoff without sending another attempt', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  const pending = createOpenLibraryRequest()('search', controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({
    name: 'AbortError',
  });
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  await rejected;
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('bounds a long Retry-After by the overall 20 second deadline', async () => {
  vi.useFakeTimers();
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
    .mockResolvedValue(
      new Response('', { status: 503, headers: { 'Retry-After': '3600' } }),
    );
  vi.stubGlobal('fetch', fetcher);
  const pending = createOpenLibraryRequest()('search');
  const rejected = expect(pending).rejects.toMatchObject({
    name: 'TimeoutError',
  });
  await vi.advanceTimersByTimeAsync(20000);
  await rejected;
  expect(fetcher).toHaveBeenCalledTimes(1);
});
