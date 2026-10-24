import { LoadingIndicator } from '../components/ui/LoadingIndicator';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookPicker } from '../components/books/BookPicker';
import { BookDetails } from '../components/books/BookDetails';
import { QuoteForm } from '../components/quotes/QuoteForm';
import type { BookSearchResult } from '../types';
import { getBookDescription } from '../services/booksApi';
import { saveQuote } from '../services/quotesService';
import { message, type QuoteInput } from '../lib/validation';
export function AddQuotePage() {
  const location = useLocation();
  const [book, setBook] = useState<BookSearchResult | null>(
    location.state?.book || null,
  );
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
    book && needsDescription && description.isSuccess
      ? { ...book, description: description.data }
      : book;
  const mutation = useMutation({
    mutationFn: (input: QuoteInput) => {
      if (!book) throw new Error('Select a book first.');
      return saveQuote(selectedBook!, input);
    },
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ['private'] });
      navigate(`/books/${result.user_book_id}`);
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
                  mutation.reset();
                }}
              >
                Choose a different book
              </button>
            </>
          ) : (
            <BookPicker onSelect={setBook} />
          )}
        </section>
        <section className="paper-panel">
          {book ? (
            <QuoteForm
              key={book.source_id}
              onSubmit={(values) => mutation.mutate(values)}
              pending={
                mutation.isPending ||
                (!!needsDescription && description.isPending)
              }
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
