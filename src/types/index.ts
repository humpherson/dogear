export type BookSearchResult = {
  source: 'open_library' | 'google_books';
  source_id: string;
  title: string;
  authors: string[];
  description: string | null;
  published_date: string | null;
  cover_url: string | null;
  isbn_10: string | null;
  isbn_13: string | null;
};
export type Book = BookSearchResult & {
  id: string;
  created_at: string;
  updated_at: string;
};
export type Quote = {
  id: string;
  user_id: string;
  user_book_id: string;
  text: string;
  note: string | null;
  page_number: string | null;
  created_at: string;
  updated_at: string;
};
export type LibraryBook = {
  id: string;
  user_id: string;
  book_id: string;
  created_at: string;
  books: Book;
  quotes: { count: number }[];
};
