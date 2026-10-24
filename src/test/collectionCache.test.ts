import { expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  cacheMovedQuote,
  cacheRenamedCollection,
} from '../features/library/quoteCache';
import {
  libraryKey,
  quotesKey,
  collectionKey,
  heroKey,
} from '../features/library/libraryQuery';
import type { CollectionEntry, Quote } from '../types';
const entry: CollectionEntry = {
  kind: 'collection',
  id: 'c',
  user_id: 'reader',
  name: 'Thoughts',
  created_at: '',
  updated_at: '',
  quotes: [{ count: 1 }],
};
const quote: Quote = {
  id: 'q',
  user_id: 'reader',
  user_book_id: null,
  collection_id: 'c',
  text: 'Words',
  page_number: null,
  note: null,
  created_at: '2026-01-01',
  updated_at: '',
  credit_mode: 'custom',
  credit_author: '',
  credit_source: '',
  credit_year: null,
};
it('renaming updates cached titles without changing quote credits or another account', () => {
  const client = new QueryClient();
  client.setQueryData(libraryKey('reader'), [entry]);
  client.setQueryData(libraryKey('other'), []);
  client.setQueryData(quotesKey('reader', 'c', 'collection'), [quote]);
  client.setQueryData(heroKey('reader'), {
    quote_id: 'q',
    user_book_id: 'c',
    entry_kind: 'collection',
    entry_title: 'Thoughts',
    author: '',
    book_title: '',
  });
  cacheRenamedCollection(client, 'reader', { ...entry, name: 'New name' });
  expect(client.getQueryData(collectionKey('reader', 'c'))).toMatchObject({
    name: 'New name',
  });
  expect(client.getQueryData(heroKey('reader'))).toMatchObject({
    entry_title: 'New name',
    author: '',
    book_title: '',
  });
  expect(client.getQueryData(quotesKey('reader', 'c', 'collection'))).toEqual([
    quote,
  ]);
  expect(client.getQueryData(libraryKey('other'))).toEqual([]);
});
it('moving the last quote removes its source and seeds the destination from confirmed results', async () => {
  const client = new QueryClient();
  const destination = { ...entry, id: 'd', name: 'New place' };
  const moved = { ...quote, collection_id: 'd' };
  client.setQueryData(libraryKey('reader'), [entry]);
  client.setQueryData(collectionKey('reader', 'c'), entry);
  client.setQueryData(quotesKey('reader', 'c', 'collection'), [quote]);
  await cacheMovedQuote(client, 'reader', {
    quote_record: moved,
    source_kind: 'collection',
    source_id: 'c',
    source_remaining_count: 0,
    source_entry: null,
    destination_entry: destination,
  });
  expect(client.getQueryData(libraryKey('reader'))).toEqual([destination]);
  expect(client.getQueryData(quotesKey('reader', 'c', 'collection'))).toEqual(
    [],
  );
  expect(client.getQueryData(quotesKey('reader', 'd', 'collection'))).toEqual([
    moved,
  ]);
  expect(client.getQueryData(collectionKey('reader', 'c'))).toBeNull();
});
