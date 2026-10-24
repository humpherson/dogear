import { db } from '../lib/supabase';
import type {
  LibraryBook,
  LibraryEntry,
  CollectionEntry,
  Quote,
} from '../types';
export async function getLibrary(
  signal?: AbortSignal,
): Promise<LibraryEntry[]> {
  const request = db().rpc('get_library_entries');
  const { data, error } = await (signal
    ? request.abortSignal(signal)
    : request);
  if (error) throw error;
  return data as unknown as LibraryEntry[];
}
export async function getCollection(
  id: string,
  signal?: AbortSignal,
): Promise<CollectionEntry | null> {
  const request = db()
    .from('collections')
    .select('*,quotes(count)')
    .eq('id', id);
  const { data, error } = await (
    signal ? request.abortSignal(signal) : request
  ).maybeSingle();
  if (error) throw error;
  return data ? ({ ...data, kind: 'collection' } as CollectionEntry) : null;
}
export async function getBook(
  id: string,
  signal?: AbortSignal,
): Promise<LibraryBook | null> {
  const request = db()
    .from('user_books')
    .select('id,user_id,book_id,created_at,books(*),quotes(count)')
    .eq('id', id);
  const { data, error } = await (
    signal ? request.abortSignal(signal) : request
  ).maybeSingle();
  if (error) throw error;
  return data as unknown as LibraryBook | null;
}
export async function getQuotes(
  id: string,
  signal?: AbortSignal,
  kind: 'book' | 'collection' = 'book',
): Promise<Quote[]> {
  const request = db()
    .from('quotes')
    .select('*')
    .eq(kind === 'collection' ? 'collection_id' : 'user_book_id', id)
    .order('created_at', { ascending: false });
  const { data, error } = await (signal
    ? request.abortSignal(signal)
    : request);
  if (error) throw error;
  return data as unknown as Quote[];
}
export async function getProfile(id: string) {
  const { data, error } = await db()
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}
export async function updateProfile(id: string, name: string) {
  const { error } = await db()
    .from('profiles')
    .update({ display_name: name.trim() || null })
    .eq('id', id);
  if (error) throw error;
}
