import { db } from '../lib/supabase';
import type { LibraryBook, Quote } from '../types';
export async function getLibrary() {
  const { data, error } = await db()
    .from('user_books')
    .select('*, books(*), quotes(count)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as LibraryBook[];
}
export async function getBook(id: string) {
  const { data, error } = await db()
    .from('user_books')
    .select('*, books(*), quotes(count)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as LibraryBook | null;
}
export async function getQuotes(id: string): Promise<Quote[]> {
  const { data, error } = await db()
    .from('quotes')
    .select('*')
    .eq('user_book_id', id)
    .order('created_at', { ascending: false });
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
