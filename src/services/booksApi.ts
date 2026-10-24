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
  });
  return normalizeBooks(
    await requestJson(`https://openlibrary.org/search.json?${params}`, signal),
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
