import { db } from '../lib/supabase';
import { savedItemSchema, type SavedItemInput } from '../lib/validation';
import type {
  BookSearchResult,
  LibraryBook,
  Quote,
  FullLibraryEntry,
  CollectionDraft,
  CollectionAppearance,
} from '../types';
export type SavedQuote = { quote_record: Quote; library_entry: LibraryBook };
export type DeletedQuote = {
  user_book_id: string | null;
  collection_id?: string | null;
  remaining_count: number;
  library_entry?: FullLibraryEntry | null;
};
export async function saveQuote(
  book: BookSearchResult,
  input: SavedItemInput,
): Promise<SavedQuote> {
  const quote = savedItemSchema.parse(input);
  const { data, error } = await db().rpc('save_quote_with_book_result', {
    book,
    quote,
  });
  if (error) throw error;
  if (!data?.[0]) throw new Error('The words could not be saved.');
  return data[0] as unknown as SavedQuote;
}
export async function editQuote(
  id: string,
  input: SavedItemInput,
): Promise<Quote> {
  const { data, error } = await db().rpc('edit_library_quote', {
    quote_id: id,
    quote: savedItemSchema.parse(input),
  });
  if (error) throw error;
  return data as unknown as Quote;
}
export async function deleteQuote(id: string): Promise<DeletedQuote> {
  const { data, error } = await db().rpc('delete_library_item', {
    item_id: id,
  });
  if (error) throw error;
  if (!data) throw new Error('The words could not be deleted.');
  return data as unknown as DeletedQuote;
}
export type CollectionSavedQuote = {
  quote_record: Quote;
  library_entry: FullLibraryEntry;
};
export async function saveCollectionQuote(
  input: SavedItemInput,
  target: { id: string } | CollectionDraft,
): Promise<CollectionSavedQuote> {
  const { data, error } = await db().rpc('save_styled_collection_quote', {
    quote: savedItemSchema.parse(input),
    ...('id' in target
      ? { collection_id: target.id }
      : {
          collection_name: target.name,
          appearance: {
            icon: target.icon || 'layers',
            background_colour: target.background_colour || '#f5f0e6',
            icon_colour: target.icon_colour || '#203b35',
            text_colour: target.text_colour || '#203b35',
            border_colour: target.border_colour || '#96713d',
          },
        }),
  });
  if (error) throw error;
  if (!data?.[0]) throw new Error('The words could not be saved.');
  return data[0] as unknown as CollectionSavedQuote;
}
export async function renameCollection(
  id: string,
  name: string,
  appearance?: CollectionAppearance,
): Promise<FullLibraryEntry> {
  const { data, error } = await db().rpc('edit_collection', {
    collection_id: id,
    collection_name: name,
    ...(appearance ? { appearance } : {}),
  });
  if (error) throw error;
  return data as unknown as FullLibraryEntry;
}
export type MoveTarget =
  | { kind: 'book' | 'collection'; id: string }
  | ({ kind: 'collection' } & CollectionDraft);
export type MovedQuote = {
  quote_record: Quote;
  source_kind: 'book' | 'collection';
  source_id: string;
  source_remaining_count: number;
  source_entry: FullLibraryEntry | null;
  destination_entry: FullLibraryEntry;
};
export async function moveQuote(
  id: string,
  target: MoveTarget,
  credits?: { credit_author: string; credit_source: string },
): Promise<MovedQuote> {
  const { data, error } = await db().rpc('move_quote_with_appearance', {
    quote_id: id,
    target_kind: target.kind,
    ...('id' in target
      ? { target_id: target.id }
      : {
          new_collection_name: target.name,
          appearance: {
            icon: target.icon || 'layers',
            background_colour: target.background_colour || '#f5f0e6',
            icon_colour: target.icon_colour || '#203b35',
            text_colour: target.text_colour || '#203b35',
            border_colour: target.border_colour || '#96713d',
          },
        }),
    ...(credits ? { credits } : {}),
  });
  if (error) throw error;
  return data as unknown as MovedQuote;
}
