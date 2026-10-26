import { db } from '../lib/supabase';
import type { Database } from '../types/database';
export type LibraryQuote =
  Database['public']['Functions']['get_random_library_quote']['Returns'][number] & {
    item_type?: 'quote' | 'definition';
    term?: string | null;
    lookup_attribution?: import('../types').LookupAttribution | null;
    entry_kind?: string;
    entry_title?: string;
  };
export async function getRandomLibraryQuote(
  excludeQuoteId: string | null = null,
  signal?: AbortSignal,
): Promise<LibraryQuote | null> {
  const request = db().rpc(
    'get_random_library_item',
    excludeQuoteId ? { exclude_item_id: excludeQuoteId } : {},
  );
  const { data, error } = await (signal
    ? request.abortSignal(signal)
    : request);
  if (error) throw error;
  return data as unknown as LibraryQuote | null;
}
