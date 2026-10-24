import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { libraryQueryOptions } from '../features/library/libraryQuery';
import * as service from '../services/libraryService';

afterEach(() => vi.restoreAllMocks());

it('reuses a recent library read until a quote mutation invalidates it', async () => {
  const get = vi.spyOn(service, 'getLibrary').mockResolvedValue([]);
  const client = new QueryClient();
  try {
    await client.fetchQuery(libraryQueryOptions('reader'));
    await client.fetchQuery(libraryQueryOptions('reader'));
    expect(get).toHaveBeenCalledTimes(1);
    await client.invalidateQueries({ queryKey: ['private'] });
    await client.fetchQuery(libraryQueryOptions('reader'));
    expect(get).toHaveBeenCalledTimes(2);
  } finally {
    client.clear();
  }
});

it('fetches again after the navigation cache expires', async () => {
  const now = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  const get = vi.spyOn(service, 'getLibrary').mockResolvedValue([]);
  const client = new QueryClient();
  try {
    await client.fetchQuery(libraryQueryOptions('reader'));
    clock.mockReturnValue(now + 31_000);
    await client.fetchQuery(libraryQueryOptions('reader'));
    expect(get).toHaveBeenCalledTimes(2);
  } finally {
    client.clear();
  }
});

it('never reuses a different account’s cached library', async () => {
  const get = vi.spyOn(service, 'getLibrary').mockResolvedValue([]);
  const client = new QueryClient();
  try {
    await client.fetchQuery(libraryQueryOptions('reader-a'));
    await client.fetchQuery(libraryQueryOptions('reader-b'));
    expect(get).toHaveBeenCalledTimes(2);
    expect(client.getQueryCache().getAll()).toHaveLength(2);
  } finally {
    client.clear();
  }
});
