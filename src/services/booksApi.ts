import type { BookSearchResult } from '../types';
import { openLibraryRequest } from './openLibraryRequest';
function text(v: unknown) {
  return typeof v === 'string' ? v : '';
}
function record(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
export function plainText(value: unknown) {
  const doc = new DOMParser().parseFromString(text(value), 'text/html');
  doc.querySelectorAll('script,style').forEach((node) => node.remove());
  return (doc.body.textContent || '').trim();
}
export function normalizeDescription(payload: unknown): string | null {
  const raw = record(payload).description;
  return (
    plainText(typeof raw === 'string' ? raw : record(raw).value).slice(
      0,
      20000,
    ) || null
  );
}
export function normalizeBooks(payload: unknown): BookSearchResult[] {
  const docs = record(payload).docs;
  if (!Array.isArray(docs)) return [];
  const seen = new Set<string>();
  return docs.flatMap((item) => {
    const raw = record(item),
      id = text(raw.key).replace(/^\/works\//, ''),
      title = text(raw.title).trim();
    if (!/^OL\d+W$/.test(id) || !title || seen.has(id)) return [];
    seen.add(id);
    const year = raw.first_publish_year;
    const cover = raw.cover_i;
    return [
      {
        source: 'open_library' as const,
        source_id: id,
        title: title.slice(0, 1000),
        authors: Array.isArray(raw.author_name)
          ? raw.author_name
              .filter((a): a is string => typeof a === 'string')
              .slice(0, 30)
              .map((a) => a.slice(0, 300))
          : [],
        description: null,
        published_date:
          Number.isInteger(year) && Number(year) >= 1000 && Number(year) <= 9999
            ? String(year)
            : null,
        cover_url:
          Number.isSafeInteger(cover) && Number(cover) > 0
            ? `https://covers.openlibrary.org/b/id/${cover}-M.jpg?default=false`
            : null,
        isbn_10: null,
        isbn_13: null,
      },
    ];
  });
}
async function requestJson(url: string, signal?: AbortSignal) {
  const requestSignal = AbortSignal.any([
    ...(signal ? [signal] : []),
    AbortSignal.timeout(20000),
  ]);
  const response = await openLibraryRequest(url, requestSignal);
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? 'Open Library is busy. Please try again shortly.'
        : 'Open Library is unavailable. Please try again.',
    );
  return response.json() as Promise<unknown>;
}
export async function searchBooks(term: string, signal?: AbortSignal) {
  if (term.trim().length < 3) return [];
  const params = new URLSearchParams({
    q: term.trim(),
    fields: 'key,title,author_name,first_publish_year,cover_i',
    limit: '12',
    sort: 'new',
  });
  const books = normalizeBooks(
    await requestJson(`https://openlibrary.org/search.json?${params}`, signal),
  );
  // Keep all matches, favouring known covers within the newest API results.
  // Stable ties preserve the provider's ordering; unknown years come last.
  return books.sort(
    (a, b) =>
      Number(!!b.cover_url) - Number(!!a.cover_url) ||
      Number(b.published_date || 0) - Number(a.published_date || 0),
  );
}
export async function getBookDescription(
  sourceId: string,
  signal?: AbortSignal,
) {
  if (!/^OL\d+W$/.test(sourceId))
    throw new Error('Invalid Open Library work identifier.');
  return normalizeDescription(
    await requestJson(`https://openlibrary.org/works/${sourceId}.json`, signal),
  );
}

// Retain Google discovery for future trials, but expose only Open Library for now.
const showGoogleBooksDiscovery = false;
export type BookProvider = BookSearchResult['source'];
export function googleBooksEnabled() {
  return (
    showGoogleBooksDiscovery &&
    !!import.meta.env.VITE_GOOGLE_BOOKS_API_KEY?.trim()
  );
}
export const providerNames = {
  open_library: 'Open Library',
  google_books: 'Google Books',
};
export async function searchCatalogue(
  term: string,
  provider: BookProvider,
  signal?: AbortSignal,
) {
  if (provider === 'open_library') return searchBooks(term, signal);
  return searchGoogleBooks(term, signal);
}
export function normalizeGoogleBooks(payload: unknown): BookSearchResult[] {
  const items = record(payload).items;
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const raw = record(item),
      info = record(raw.volumeInfo),
      id = text(raw.id),
      title = text(info.title).trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !title || seen.has(id)) return [];
    seen.add(id);
    const identifiers = Array.isArray(info.industryIdentifiers)
      ? info.industryIdentifiers.map(record)
      : [];
    const isbn = (type: string, pattern: RegExp) =>
      identifiers.find(
        (v) => v.type === type && pattern.test(text(v.identifier)),
      )?.identifier as string | undefined;
    const images = record(info.imageLinks),
      cover = text(images.thumbnail || images.smallThumbnail);
    let coverUrl: string | null = null;
    try {
      const url = new URL(cover);
      if (
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        !url.username &&
        !url.password
      ) {
        url.protocol = 'https:';
        if (url.href.length <= 2048) coverUrl = url.href;
      }
    } catch {
      /* Missing or malformed cover. */
    }
    const date = text(info.publishedDate);
    return [
      {
        source: 'google_books' as const,
        source_id: id,
        title: title.slice(0, 1000),
        authors: Array.isArray(info.authors)
          ? info.authors
              .filter((a): a is string => typeof a === 'string')
              .slice(0, 30)
              .map((a) => a.slice(0, 300))
          : [],
        description: plainText(info.description).slice(0, 20000) || null,
        published_date: /^\d{4}(-\d{2})?(-\d{2})?$/.test(date) ? date : null,
        cover_url: coverUrl,
        isbn_10: isbn('ISBN_10', /^[0-9Xx]{10}$/) || null,
        isbn_13: isbn('ISBN_13', /^\d{13}$/) || null,
      },
    ];
  });
}
class GoogleBooksRequestError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GoogleBooksRequestError';
  }
}
async function googleBooksFailure(
  response: Response,
): Promise<GoogleBooksRequestError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // Proxies can return HTML or an empty body instead of Google's JSON error.
  }
  const error = record(record(payload).error);
  const details = Array.isArray(error.details) ? error.details.map(record) : [];
  const quotas = details.map((detail) => record(detail.metadata));
  const daily =
    quotas.some(
      (quota) =>
        /perday/i.test(text(quota.quota_limit)) ||
        text(quota.quota_unit).startsWith('1/d/'),
    ) || /queries per day|daily/i.test(text(error.message));
  const reasons = Array.isArray(error.errors) ? error.errors.map(record) : [];
  const quotaExceeded =
    response.status === 429 ||
    Number(error.code) === 429 ||
    error.status === 'RESOURCE_EXHAUSTED' ||
    reasons.some(
      (reason) =>
        reason.reason === 'rateLimitExceeded' ||
        reason.reason === 'dailyLimitExceeded',
    );
  if (quotaExceeded && daily) {
    return new GoogleBooksRequestError(
      quotas.some((quota) => String(quota.quota_limit_value) === '0')
        ? 'Google Books has no daily search allowance. Choose Open Library.'
        : 'Google Books’ daily search allowance has been reached. Choose Open Library for now.',
    );
  }
  if (quotaExceeded)
    return new GoogleBooksRequestError(
      'Google Books is busy. Please try again shortly.',
    );
  const rejected =
    [400, 401, 403].includes(response.status) ||
    [400, 401, 403].includes(Number(error.code)) ||
    error.status === 'PERMISSION_DENIED' ||
    error.status === 'UNAUTHENTICATED';
  return new GoogleBooksRequestError(
    rejected
      ? 'Google Books rejected this request. Check the API key, website restrictions and quota, or choose Open Library.'
      : 'Google Books is unavailable. Please try again or choose Open Library.',
    !rejected && [408, 500, 502, 503, 504].includes(response.status),
  );
}
function waitForGoogleRetry(delay: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, delay);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}
function googleRetryAfter(response?: Response) {
  const value = response?.headers?.get('Retry-After');
  if (!value) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}
async function requestGoogleBooks(
  url: string,
  signal: AbortSignal,
): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    let response: Response | undefined;
    let failure: GoogleBooksRequestError | undefined;
    try {
      response = await fetch(url, { signal });
    } catch (error) {
      signal.throwIfAborted();
      failure = new GoogleBooksRequestError(
        'Google Books could not be reached. Try again or choose Open Library.',
        true,
        { cause: error },
      );
    }
    signal.throwIfAborted();
    if (response?.ok) return response.json();
    if (response) failure = await googleBooksFailure(response);
    signal.throwIfAborted();
    if (!failure)
      throw new GoogleBooksRequestError(
        'Google Books returned an invalid response. Choose Open Library.',
      );
    if (!failure.retryable || attempt === 2) throw failure;
    // Equal jitter keeps each delay non-zero: 0.5–1s, then 1–2s.
    const backoff = 1000 * 2 ** attempt * (0.5 + Math.random() * 0.5);
    await waitForGoogleRetry(
      Math.min(20000, Math.max(backoff, googleRetryAfter(response))),
      signal,
    );
  }
  throw new GoogleBooksRequestError(
    'Google Books is unavailable. Choose Open Library.',
  );
}
export async function searchGoogleBooks(term: string, signal?: AbortSignal) {
  if (term.trim().length < 3) return [];
  const key = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY?.trim();
  if (!key)
    throw new Error('Google Books is not configured. Choose Open Library.');
  const params = new URLSearchParams({
    q: term.trim(),
    key,
    maxResults: '12',
    printType: 'books',
    fields:
      'items(id,volumeInfo(title,authors,description,publishedDate,imageLinks,industryIdentifiers))',
  });
  const requestSignal = AbortSignal.any([
    ...(signal ? [signal] : []),
    AbortSignal.timeout(20000),
  ]);
  try {
    return normalizeGoogleBooks(
      await requestGoogleBooks(
        `https://www.googleapis.com/books/v1/volumes?${params}`,
        requestSignal,
      ),
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    if (requestSignal.aborted)
      throw new GoogleBooksRequestError(
        'Google Books took too long. Try again or choose Open Library.',
        false,
        { cause: error },
      );
    throw error;
  }
}
