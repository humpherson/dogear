function wait(delay: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
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
}
function retryAfter(response: Response) {
  const value = response.headers.get('Retry-After');
  if (!value) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}
// Serialize start slots, not response completion: a slow obsolete search must
// not hold newer searches behind it. Every attempt still shares the same gate.
export function createRateLimitedFetch(interval = 1100) {
  let queue: Promise<unknown> = Promise.resolve();
  let nextStart = 0;
  return async (url: string, signal?: AbortSignal): Promise<Response> => {
    const slot = queue.then(async () => {
      signal?.throwIfAborted();
      // A response arriving while this slot waits may extend the shared cooldown.
      while (nextStart > Date.now()) await wait(nextStart - Date.now(), signal);
      signal?.throwIfAborted();
      nextStart = Date.now() + interval;
    });
    queue = slot.catch(() => undefined);
    await slot;
    signal?.throwIfAborted();
    const response = await fetch(url, { signal });
    if (response.status === 429 || response.status === 503)
      nextStart = Math.max(nextStart, Date.now() + retryAfter(response));
    return response;
  };
}
export function createOpenLibraryRequest(interval = 1100) {
  const request = createRateLimitedFetch(interval);
  return async (url: string, signal?: AbortSignal): Promise<Response> => {
    const deadline = AbortSignal.any([
      ...(signal ? [signal] : []),
      AbortSignal.timeout(20000),
    ]);
    for (let attempt = 0; ; attempt++) {
      deadline.throwIfAborted();
      let response: Response | undefined;
      try {
        response = await request(url, deadline);
      } catch (error) {
        deadline.throwIfAborted();
        if (attempt === 2) throw error;
      }
      deadline.throwIfAborted();
      if (
        response &&
        (![408, 429, 500, 502, 503, 504].includes(response.status) ||
          attempt === 2)
      )
        return response;
      const delay = Math.max(
        1000 * 2 ** attempt * (0.5 + Math.random() * 0.5),
        response ? retryAfter(response) : 0,
      );
      // Release failed response bodies before retrying (often HTML error pages).
      await response?.body?.cancel();
      await wait(Math.min(20000, delay), deadline);
    }
  };
}
export const openLibraryRequest = createOpenLibraryRequest();
