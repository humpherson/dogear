import { db } from '../lib/supabase';
import { quoteSchema, type QuoteInput } from '../lib/validation';
import type { BookSearchResult } from '../types';
export async function saveQuote(book: BookSearchResult, input: QuoteInput) {
  const quote = quoteSchema.parse(input);
  const { data, error } = await db().rpc('save_quote_with_book', {
    book,
    quote,
  });
  if (error) throw error;
  if (!data?.[0]) throw new Error('The quotation could not be saved.');
  return data[0];
}
export async function editQuote(id: string, input: QuoteInput) {
  const parsed = quoteSchema.parse(input);
  const { data, error } = await db()
    .from('quotes')
    .update({
      ...parsed,
      note: parsed.note || null,
      page_number: parsed.page_number || null,
    })
    .eq('id', id)
    .select('id')
    .single();
  if (error) throw error;
  return data;
}
export async function deleteQuote(id: string) {
  const { error } = await db().rpc('delete_quote', { quote_id: id });
  if (error) throw error;
}
