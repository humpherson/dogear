import { afterEach, expect, it, vi } from 'vitest';
import { findMeanings, normaliseTerm } from '../services/dictionaryService';
const entry = [
  {
    meanings: [
      {
        partOfSpeech: 'noun',
        definitions: [
          { definition: 'An unexpected discovery.' },
          { definition: '' },
        ],
      },
    ],
    sourceUrls: [
      'https://en.wiktionary.org/wiki/serendipity',
      'javascript:alert(1)',
    ],
    license: {
      name: 'CC BY-SA 3.0',
      url: 'https://creativecommons.org/licenses/by-sa/3.0/',
    },
  },
];
afterEach(() => vi.unstubAllGlobals());
it('encodes English phrases and keeps safe source and licence attribution', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(entry)));
  vi.stubGlobal('fetch', fetch);
  const values = await findMeanings('  Déjà  vu ');
  expect(normaliseTerm('  Déjà  vu ')).toBe('déjà vu');
  expect(fetch.mock.calls[0][0]).toContain('/en/d%C3%A9j%C3%A0%20vu');
  expect(fetch.mock.calls[0][1]).toMatchObject({
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  expect(values).toHaveLength(1);
  expect(values[0].attribution.source_urls).toEqual([
    'https://en.wiktionary.org/wiki/serendipity',
  ]);
  expect(values[0].attribution.license_name).toBe('CC BY-SA 3.0');
});
it('treats a missing word as an empty result without retrying', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }));
  vi.stubGlobal('fetch', fetch);
  expect(await findMeanings('unknown')).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('normalises suggested meanings without rewriting the lookup term or attribution', async () => {
  const response = structuredClone(entry);
  response[0].meanings[0].definitions[0].definition =
    'A colorful expression of organized behavior.';
  response[0].sourceUrls = ['https://en.wiktionary.org/wiki/color'];
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(response)));
  vi.stubGlobal('fetch', fetch);
  const values = await findMeanings('color');
  expect(fetch.mock.calls[0][0]).toContain('/en/color');
  expect(values[0].definition).toBe(
    'A colourful expression of organised behaviour.',
  );
  expect(values[0].attribution.source_urls).toEqual([
    'https://en.wiktionary.org/wiki/color',
  ]);
  expect(values[0].attribution.license_name).toBe('CC BY-SA 3.0');
});
it('omits meanings that exceed the saved text limit after spelling expansion', async () => {
  const response = structuredClone(entry);
  response[0].meanings[0].definitions[0].definition =
    'color ' + 'x'.repeat(9994);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(response))),
  );
  expect(await findMeanings('color')).toEqual([]);
});
it('retries a transient failure once before returning meanings', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(entry)));
  vi.stubGlobal('fetch', fetch);
  expect(await findMeanings('word')).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('cancels retry backoff without sending a second request', async () => {
  const controller = new AbortController();
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response('', { status: 429, headers: { 'Retry-After': '5' } }),
    );
  vi.stubGlobal('fetch', fetch);
  const pending = findMeanings('word', controller.signal);
  const rejected = expect(pending).rejects.toThrow();
  await new Promise((resolve) => setTimeout(resolve, 10));
  controller.abort();
  await rejected;
  expect(fetch).toHaveBeenCalledTimes(1);
});
