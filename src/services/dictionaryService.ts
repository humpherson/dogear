import type { LookupAttribution } from '../types';
import { toUkDictionarySpelling } from './dictionarySpelling';
export type DictionaryMeaning = {
  definition: string;
  partOfSpeech: string;
  attribution: LookupAttribution;
};
export function normaliseTerm(term: string) {
  return term
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFKC')
    .toLocaleLowerCase('en-GB');
}
function safeUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 2048 &&
    /^https:\/\/[^\s]+$/.test(value)
  );
}
export async function findMeanings(
  term: string,
  signal?: AbortSignal,
): Promise<DictionaryMeaning[]> {
  const deadline = AbortSignal.any([
    ...(signal ? [signal] : []),
    AbortSignal.timeout(10000),
  ]);
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normaliseTerm(term))}`,
        {
          signal: deadline,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        },
      );
    } catch (error) {
      deadline.throwIfAborted();
      if (attempt) throw error;
      await pause(400 + Math.random() * 400, deadline);
      continue;
    }
    if (response.status === 404) return [];
    if (!response.ok) {
      if (
        !attempt &&
        [408, 429, 500, 502, 503, 504].includes(response.status)
      ) {
        const retry = response.headers.get('Retry-After');
        const retryMs = retry
          ? Number.isFinite(Number(retry))
            ? Number(retry) * 1000
            : Date.parse(retry) - Date.now()
          : 0;
        await response.body?.cancel();
        await pause(
          Math.max(400 + Math.random() * 400, Math.min(9000, retryMs || 0)),
          deadline,
        );
        continue;
      }
      throw new Error(
        'The dictionary is unavailable. You can still write a meaning yourself.',
      );
    }
    const rows: unknown = await response.json();
    if (!Array.isArray(rows))
      throw new Error('The dictionary returned an unexpected response.');
    const results: DictionaryMeaning[] = [];
    for (const row of rows) {
      if (!row || typeof row !== 'object' || !Array.isArray(row.meanings))
        continue;
      const attribution: LookupAttribution = {
        provider: 'free-dictionary-api',
        source_urls: Array.isArray(row.sourceUrls)
          ? row.sourceUrls.filter(safeUrl).slice(0, 5)
          : [],
      };
      if (
        typeof row.license?.name === 'string' &&
        row.license.name.length <= 120 &&
        safeUrl(row.license?.url)
      ) {
        attribution.license_name = row.license.name;
        attribution.license_url = row.license.url;
      }
      for (const meaning of row.meanings) {
        if (!Array.isArray(meaning?.definitions)) continue;
        for (const entry of meaning.definitions) {
          if (
            typeof entry?.definition !== 'string' ||
            !entry.definition.trim() ||
            entry.definition.length > 10000
          )
            continue;
          const definition = toUkDictionarySpelling(entry.definition);
          if (definition.length > 10000) continue;
          results.push({
            definition,
            partOfSpeech:
              typeof meaning.partOfSpeech === 'string'
                ? meaning.partOfSpeech
                : '',
            attribution,
          });
        }
      }
    }
    return results;
  }
  throw new Error(
    'The dictionary could not be reached. Write a meaning yourself or try again.',
  );
}
function pause(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}
