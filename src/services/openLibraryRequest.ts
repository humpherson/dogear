// Search and selected-work lookups share one queue per browser tab. Keep starts
// at least 1.1s apart, including retries, rather than claiming identified limits.
export function createRateLimitedFetch(interval = 1100) {
  let queue: Promise<unknown> = Promise.resolve();
  let nextStart = 0;
  return (url: string, signal?: AbortSignal): Promise<Response> => {
    const request = queue.then(async () => {
      signal?.throwIfAborted();
      const delay = Math.max(0, nextStart - Date.now());
      if (delay)
        await new Promise<void>((resolve, reject) => {
          const finish = () => {
            signal?.removeEventListener('abort', abort);
            resolve();
          };
          const timer = setTimeout(finish, delay);
          const abort = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            reject(signal?.reason || new DOMException('Aborted', 'AbortError'));
          };
          signal?.addEventListener('abort', abort, { once: true });
        });
      signal?.throwIfAborted();
      nextStart = Date.now() + interval;
      const response = await fetch(url, { signal });
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const seconds = Number(retryAfter);
        const until =
          retryAfter && !Number.isNaN(seconds)
            ? Date.now() + seconds * 1000
            : Date.parse(retryAfter || '');
        if (Number.isFinite(until)) nextStart = Math.max(nextStart, until);
      }
      return response;
    });
    queue = request.catch(() => undefined);
    return request;
  };
}
export const openLibraryRequest = createRateLimitedFetch();
