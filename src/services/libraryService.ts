import { db } from '../lib/supabase';
import type { LibraryBook, LibrarySummary, Quote } from '../types';
export const libraryProjection =
  'id,user_id,book_id,created_at,books(id,source,source_id,title,authors,published_date,cover_url),quotes(count)';
export async function getLibrary(
  signal?: AbortSignal,
): Promise<LibrarySummary[]> {
  const request = db()
    .from('user_books')
    .select(libraryProjection)
    .order('created_at', { ascending: false });
  const { data, error } = await (signal
    ? request.abortSignal(signal)
    : request);
  if (error) throw error;
  return data as unknown as LibrarySummary[];
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
): Promise<Quote[]> {
  const request = db()
    .from('quotes')
    .select('*')
    .eq('user_book_id', id)
    .order('created_at', { ascending: false });
  const { data, error } = await (signal
    ? request.abortSignal(signal)
    : request);
  if (error) throw error;
  return data;
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
