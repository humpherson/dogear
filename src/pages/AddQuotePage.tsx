import { CollectionAppearanceFields } from '../components/collections/CollectionAppearanceFields';
import { CollectionDetails } from '../components/collections/CollectionDetails';
import {
  entryPath,
  type CollectionEntry,
  type CollectionDraft,
} from '../types';
import {
  bookQueryOptions,
  collectionQueryOptions,
  cachedCollection,
} from '../features/library/libraryQuery';
import { cacheSavedQuote } from '../features/library/quoteCache';
import { useAuth } from '../features/auth/AuthProvider';
import { LoadingIndicator } from '../components/ui/LoadingIndicator';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookPicker } from '../components/books/BookPicker';
import { BookDetails } from '../components/books/BookDetails';
import { QuoteForm } from '../components/quotes/QuoteForm';
import type { BookSearchResult, SelectedBook } from '../types';
import { getBookDescription } from '../services/booksApi';
import { saveQuote, saveCollectionQuote } from '../services/quotesService';
import {
  message,
  collectionNameSchema,
  type QuoteInput,
} from '../lib/validation';
function isSavedCollection(
  value: CollectionEntry | CollectionDraft,
): value is CollectionEntry {
  return 'id' in value && typeof value.id === 'string';
}
export function AddQuotePage() {
  const location = useLocation();
  const { session } = useAuth();
  const client = useQueryClient();
  // Browser history survives sign-out and account changes. Never initialise a
  // new user's editor from a previous user's selected collection or book.
  const stateOwner =
    location.state?.ownerId || location.state?.collection?.user_id;
  const selection = stateOwner === session?.user.id ? location.state : null;
  const [book, setBook] = useState<SelectedBook | null>(
    selection?.book || null,
  );
  const [draftCollection, setCollection] = useState<
    CollectionEntry | CollectionDraft | null
  >(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<
    string | undefined
  >(selection?.collectionId || selection?.collection?.id);
  const savedCollection = useQuery({
    ...collectionQueryOptions(session?.user.id, selectedCollectionId || ''),
    enabled: !!session && !!selectedCollectionId,
  });
  const collection: CollectionEntry | CollectionDraft | null =
    selectedCollectionId
      ? (savedCollection.data ??
        cachedCollection(client, session?.user.id, selectedCollectionId) ??
        null)
      : draftCollection;
  const [selectedUserBookId, setSelectedUserBookId] = useState<
    string | undefined
  >(selection?.userBookId);
  const needsSavedDetails =
    !!book &&
    !!selectedUserBookId &&
    !('description' in book && 'isbn_10' in book && 'isbn_13' in book);
  const savedDetails = useQuery({
    ...bookQueryOptions(session?.user.id, selectedUserBookId || ''),
    enabled: !!session && needsSavedDetails,
  });
  const navigate = useNavigate();
  const needsDescription = book?.source === 'open_library' && !('id' in book);
  const description = useQuery({
    queryKey: ['book-description', 'open_library', book?.source_id],
    queryFn: ({ signal }) => getBookDescription(book!.source_id, signal),
    enabled: !!needsDescription,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
  const selectedBook =
    savedDetails.data?.books ??
    (book && needsDescription && description.isSuccess
      ? { ...book, description: description.data }
      : book);
  const mutation = useMutation({
    mutationFn: (input: QuoteInput) => {
      if (collection)
        return saveCollectionQuote(
          input,
          isSavedCollection(collection)
            ? { id: collection.id }
            : {
                ...collection,
                name: collectionNameSchema.parse(collection.name),
              },
        );
      if (!book) throw new Error('Select a book or collection first.');
      if (needsSavedDetails && !savedDetails.data)
        throw new Error('Load the saved book details before saving.');
      return saveQuote(selectedBook as BookSearchResult, input);
    },
    onSuccess: async (result) => {
      await cacheSavedQuote(client, session!.user.id, result);
      navigate(entryPath(result.library_entry));
    },
  });
  return (
    <>
      <Link className="back-link" to="/library">
        ← Your library
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Make a little room for a good line</p>
          <h1>
            Keep a quote<span className="gold">.</span>
          </h1>
        </div>
      </div>
      <div className="editor-layout">
        <section>
          {collection ? (
            <>
              <div className="selected-collection-summary">
                <CollectionDetails {...collection} />
              </div>
              {!isSavedCollection(collection) && (
                <details className="collection-customise">
                  <summary>Customise collection</summary>
                  <label htmlFor="new-collection-name">Collection name</label>
                  <input
                    autoComplete="off"
                    id="new-collection-name"
                    name="new-collection-title"
                    maxLength={120}
                    value={collection.name}
                    onChange={(event) =>
                      setCollection({ ...collection, name: event.target.value })
                    }
                  />
                  <CollectionAppearanceFields
                    value={collection}
                    disabled={mutation.isPending}
                    onChange={(appearance) =>
                      setCollection({ ...collection, ...appearance })
                    }
                  />
                </details>
              )}
              <button
                className="text-button"
                disabled={mutation.isPending}
                onClick={() => {
                  setSelectedCollectionId(undefined);
                  setCollection(null);
                  mutation.reset();
                }}
              >
                Choose a different book or collection
              </button>
            </>
          ) : selectedCollectionId ? (
            <>
              {savedCollection.isPending ? (
                <LoadingIndicator>Opening your collection…</LoadingIndicator>
              ) : (
                <p role="alert">
                  {savedCollection.isError
                    ? message(savedCollection.error)
                    : 'This collection isn’t in your library.'}
                </p>
              )}
              <button
                className="text-button"
                onClick={() => setSelectedCollectionId(undefined)}
              >
                Choose a different book or collection
              </button>
            </>
          ) : book ? (
            <>
              <BookDetails book={selectedBook!} showOpenLibraryLink={false} />
              {needsSavedDetails && savedDetails.isPending && (
                <LoadingIndicator>Loading saved book details…</LoadingIndicator>
              )}
              {needsSavedDetails &&
                savedDetails.isSuccess &&
                !savedDetails.data && (
                  <p role="alert">
                    This book is no longer in your library. Choose a different
                    book to continue.
                  </p>
                )}
              {needsSavedDetails && savedDetails.isError && (
                <p role="alert">
                  We couldn’t load this saved book.{' '}
                  <button
                    className="text-button"
                    onClick={() => void savedDetails.refetch()}
                  >
                    Retry book details
                  </button>
                </p>
              )}
              {needsDescription && description.isPending && (
                <LoadingIndicator>Loading book description…</LoadingIndicator>
              )}
              {needsDescription && description.isError && (
                <p role="status">
                  The description couldn’t be loaded. You can still save your
                  quote.{' '}
                  <button
                    className="text-button"
                    onClick={() => void description.refetch()}
                  >
                    Retry description
                  </button>
                </p>
              )}
              <button
                className="text-button"
                disabled={mutation.isPending}
                onClick={() => {
                  setBook(null);
                  setSelectedUserBookId(undefined);
                  mutation.reset();
                }}
              >
                Choose a different book
              </button>
            </>
          ) : (
            <BookPicker
              onSelectCollection={(selected) => {
                setSelectedCollectionId(undefined);
                setBook(null);
                setSelectedUserBookId(undefined);
                setCollection(selected);
              }}
              onSelect={(selected, id) => {
                setSelectedCollectionId(undefined);
                setCollection(null);
                setBook(selected);
                setSelectedUserBookId(id);
              }}
            />
          )}
        </section>
        <section className="paper-panel">
          {book || collection ? (
            <QuoteForm
              key={
                collection
                  ? isSavedCollection(collection)
                    ? collection.id
                    : 'new-collection'
                  : book!.source_id
              }
              collection={!!collection}
              focusOnMount={!!collection}
              showPrivacyHint={false}
              onSubmit={(values) => mutation.mutate(values)}
              pending={
                mutation.isPending ||
                (needsSavedDetails && savedDetails.isPending) ||
                (!!needsDescription && description.isPending)
              }
              disabled={needsSavedDetails && !savedDetails.data}
              pendingLabel={mutation.isPending ? 'Saving…' : 'Loading book…'}
              error={mutation.isError ? message(mutation.error) : undefined}
            />
          ) : (
            <div className="empty">
              <h2>First, choose a book or collection.</h2>
              <p>
                Choose from your library, find a new book or create a
                collection, then keep the passage that made you pause.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
