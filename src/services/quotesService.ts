import { db } from '../lib/supabase';
import { quoteSchema, type QuoteInput } from '../lib/validation';
import type { BookSearchResult, LibraryBook, Quote } from '../types';
export type SavedQuote = { quote_record: Quote; library_entry: LibraryBook };
export type DeletedQuote = { user_book_id: string; remaining_count: number };
export async function saveQuote(
  book: BookSearchResult,
  input: QuoteInput,
): Promise<SavedQuote> {
  const quote = quoteSchema.parse(input);
  const { data, error } = await db().rpc('save_quote_with_book_result', {
    book,
    quote,
  });
  if (error) throw error;
  if (!data?.[0]) throw new Error('The quotation could not be saved.');
  return data[0] as unknown as SavedQuote;
}
export async function editQuote(id: string, input: QuoteInput): Promise<Quote> {
  const parsed = quoteSchema.parse(input);
  const { data, error } = await db()
    .from('quotes')
    .update({
      ...parsed,
      note: parsed.note || null,
      page_number: parsed.page_number || null,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
export async function deleteQuote(id: string): Promise<DeletedQuote> {
  const { data, error } = await db().rpc('delete_quote_result', {
    quote_id: id,
  });
  if (error) throw error;
  if (!data?.[0]) throw new Error('The quotation could not be deleted.');
  return data[0];
}
