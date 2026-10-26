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
export type QuoteBase = {
  id: string;
  user_id: string;
  user_book_id: string | null;
  collection_id?: string | null;
  credit_mode?: 'book' | 'custom';
  credit_author?: string | null;
  credit_source?: string | null;
  credit_year?: string | null;
  text: string;
  note: string | null;
  page_number: string | null;
  created_at: string;
  updated_at: string;
};
export type LookupAttribution = {
  provider: 'free-dictionary-api';
  source_urls: string[];
  license_name?: string;
  license_url?: string;
};
export type SavedItem = QuoteBase &
  (
    | { item_type?: 'quote'; term?: null; lookup_attribution?: null }
    | {
        item_type: 'definition';
        term: string;
        lookup_attribution?: LookupAttribution | null;
      }
  );
export type Quote = SavedItem;
export type ItemCounts = { quote: number; definition: number; total: number };
export function itemCounts(entry: {
  quotes: { count: number }[];
  item_counts?: ItemCounts;
}): ItemCounts {
  return (
    entry.item_counts || {
      quote: entry.quotes[0]?.count || 0,
      definition: 0,
      total: entry.quotes[0]?.count || 0,
    }
  );
}
export function countLabel(entry: {
  quotes: { count: number }[];
  item_counts?: ItemCounts;
}) {
  const counts = itemCounts(entry);
  return (
    [
      counts.quote
        ? `${counts.quote} ${counts.quote === 1 ? 'quote' : 'quotes'}`
        : '',
      counts.definition
        ? `${counts.definition} ${counts.definition === 1 ? 'definition' : 'definitions'}`
        : '',
    ]
      .filter(Boolean)
      .join(' · ') || '0 words'
  );
}
export type LibraryBook = {
  id: string;
  user_id: string;
  book_id: string;
  created_at: string;
  books: Book;
  item_counts?: ItemCounts;
  quotes: { count: number }[];
};
export type BookSummary = Pick<
  Book,
  | 'id'
  | 'source'
  | 'source_id'
  | 'title'
  | 'authors'
  | 'published_date'
  | 'cover_url'
> &
  Partial<Book>;
export type LibrarySummary = Omit<LibraryBook, 'books'> & {
  books: BookSummary;
};
export type SelectedBook = BookSearchResult | BookSummary;

export type CollectionIconName =
  | 'layers'
  | 'music'
  | 'tv'
  | 'book'
  | 'speech'
  | 'paw-print'
  | 'user'
  | 'face-grinning'
  | 'face-slightly-frowning'
  | 'star'
  | 'brush';
export type CollectionAppearance = {
  icon?: CollectionIconName;
  background_colour?: string;
  icon_colour?: string;
  text_colour?: string;
  border_colour?: string;
};
export type CollectionDraft = CollectionAppearance & { name: string };
export type CollectionEntry = CollectionAppearance & {
  kind: 'collection';
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  item_counts?: ItemCounts;
  quotes: { count: number }[];
};
export type LibraryEntry = LibrarySummary | CollectionEntry;
export type FullLibraryEntry = LibraryBook | CollectionEntry;
export type EntryKind = 'book' | 'collection';
export function isCollection(
  entry: LibraryEntry | FullLibraryEntry,
): entry is CollectionEntry {
  return 'kind' in entry && entry.kind === 'collection';
}
export function entryTitle(entry: LibraryEntry | FullLibraryEntry) {
  return isCollection(entry) ? entry.name : entry.books.title;
}
export function entryPath(entry: LibraryEntry | FullLibraryEntry) {
  return `/${isCollection(entry) ? 'collections' : 'books'}/${entry.id}`;
}
export function quoteParent(quote: Quote) {
  return {
    kind: (quote.collection_id ? 'collection' : 'book') as EntryKind,
    id: quote.collection_id || quote.user_book_id!,
  };
}
