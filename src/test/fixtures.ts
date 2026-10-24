import type { BookSearchResult, Quote, LibraryBook } from '../types';
import type { SavedQuote } from '../services/quotesService';
export function savedFixture(
  book: BookSearchResult,
  quoteId = 'q',
  userId = 'reader',
): SavedQuote {
  const quote: Quote = {
    id: quoteId,
    user_id: userId,
    user_book_id: 'ub',
    text: 'Saved words',
    note: null,
    page_number: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
  const entry: LibraryBook = {
    id: 'ub',
    user_id: userId,
    book_id: 'b',
    created_at: quote.created_at,
    books: {
      ...book,
      id: 'b',
      created_at: quote.created_at,
      updated_at: quote.updated_at,
    },
    quotes: [{ count: 1 }],
  };
  return { quote_record: quote, library_entry: entry };
}
