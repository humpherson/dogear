import { bookQueryOptions } from '../features/library/libraryQuery';
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
import { saveQuote } from '../services/quotesService';
import { message, type QuoteInput } from '../lib/validation';
export function AddQuotePage() {
  const location = useLocation();
  const [book, setBook] = useState<SelectedBook | null>(
    location.state?.book || null,
  );
  const [selectedUserBookId, setSelectedUserBookId] = useState<
    string | undefined
  >(location.state?.userBookId);
  const { session } = useAuth();
  const needsSavedDetails =
    !!book &&
    !!selectedUserBookId &&
    !('description' in book && 'isbn_10' in book && 'isbn_13' in book);
  const savedDetails = useQuery({
    ...bookQueryOptions(session?.user.id, selectedUserBookId || ''),
    enabled: !!session && needsSavedDetails,
  });
  const navigate = useNavigate(),
    client = useQueryClient();
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
      if (!book) throw new Error('Select a book first.');
      if (needsSavedDetails && !savedDetails.data)
        throw new Error('Load the saved book details before saving.');
      return saveQuote(selectedBook as BookSearchResult, input);
    },
    onSuccess: async (result) => {
      await cacheSavedQuote(client, session!.user.id, result);
      navigate(`/books/${result.library_entry.id}`);
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
          {book ? (
            <>
              <BookDetails book={selectedBook!} />
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
              onSelect={(selected, id) => {
                setBook(selected);
                setSelectedUserBookId(id);
              }}
            />
          )}
        </section>
        <section className="paper-panel">
          {book ? (
            <QuoteForm
              key={book.source_id}
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
              <h2>First, choose your book.</h2>
              <p>
                Choose from your library or find a new book, then keep the
                passage that made you pause.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
