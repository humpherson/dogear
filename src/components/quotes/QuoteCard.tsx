import { MoveQuoteDialog } from './MoveQuoteDialog';
import { useAuth } from '../../features/auth/AuthProvider';
import {
  cacheEditedQuote,
  cacheDeletedQuote,
} from '../../features/library/quoteCache';
import { Spinner } from '../ui/LoadingIndicator';
import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QuoteForm } from './QuoteForm';
import { deleteQuote, editQuote } from '../../services/quotesService';
import { message, type SavedItemInput } from '../../lib/validation';
import type { Quote, BookSummary, BookSearchResult } from '../../types';
export function QuoteCard({
  quote,
  book,
  onDeleted,
}: {
  quote: Quote;
  book?: BookSummary | BookSearchResult;
  onDeleted: (remainingCount: number) => void;
}) {
  const definition = quote.item_type === 'definition';
  const label = definition ? 'definition' : 'quote';
  const [editing, setEditing] = useState(false),
    [confirm, setConfirm] = useState(false);
  const client = useQueryClient();
  const { session } = useAuth();
  const userId = session!.user.id;
  const edit = useMutation({
    mutationFn: (input: SavedItemInput) => editQuote(quote.id, input),
    onSuccess: async (updated) => {
      await cacheEditedQuote(client, userId, updated);
      setEditing(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteQuote(quote.id),
    onSuccess: async (result) => {
      await cacheDeletedQuote(client, userId, quote.id, result);
      setConfirm(false);
      onDeleted(result.remaining_count);
    },
  });
  return (
    <article className="quote-card">
      {editing ? (
        <QuoteForm
          itemType={definition ? 'definition' : 'quote'}
          collection={!!quote.collection_id}
          showCredits={quote.credit_mode === 'custom' || !!quote.collection_id}
          initial={{
            ...(definition
              ? {
                  item_type: 'definition' as const,
                  term: quote.term,
                  lookup_attribution: quote.lookup_attribution,
                }
              : {}),
            ...(quote.credit_mode === 'custom' || quote.collection_id
              ? {
                  credit_author: quote.credit_author || '',
                  credit_source: quote.credit_source || '',
                }
              : {}),
            text: quote.text,
            page_number: quote.page_number || '',
            note: quote.note || '',
          }}
          onSubmit={(input) => edit.mutate(input)}
          pending={edit.isPending}
          error={edit.isError ? message(edit.error) : undefined}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <p className="item-kind">{definition ? 'Definition' : 'Quote'}</p>
          {definition ? (
            <>
              <h3 className="definition-term">{quote.term}</h3>
              <p className="definition-meaning">{quote.text}</p>
            </>
          ) : (
            <blockquote>{quote.text}</blockquote>
          )}
          {quote.credit_mode === 'custom' &&
            (quote.credit_author || quote.credit_source) && (
              <p className="quote-credit">
                {quote.credit_author}
                {quote.credit_author && quote.credit_source ? ' · ' : ''}
                {quote.credit_source}
              </p>
            )}
          {quote.page_number && (
            <p className="page-ref">
              {quote.collection_id ? 'Reference' : 'Page / location'}{' '}
              {quote.page_number}
            </p>
          )}
          {quote.note && <p className="private-note">{quote.note}</p>}
          <div className="quote-meta">
            <time dateTime={quote.created_at}>
              {new Date(quote.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </time>
            <div className="actions">
              <button className="text-button" onClick={() => setEditing(true)}>
                Edit
              </button>
              <MoveQuoteDialog quote={quote} book={book} />
              <AlertDialog.Root open={confirm} onOpenChange={setConfirm}>
                <AlertDialog.Trigger asChild>
                  <button className="text-button quote-delete">Delete</button>
                </AlertDialog.Trigger>
                <AlertDialog.Portal>
                  <AlertDialog.Overlay className="dialog-overlay" />
                  <AlertDialog.Content className="dialog">
                    <AlertDialog.Title>Let this {label} go?</AlertDialog.Title>
                    <AlertDialog.Description>
                      This cannot be undone. If this is your last item, its book
                      or collection will also leave your library.
                    </AlertDialog.Description>
                    {remove.isError && (
                      <p role="alert">{message(remove.error)}</p>
                    )}
                    <div className="actions">
                      <AlertDialog.Cancel asChild>
                        <button
                          className="secondary"
                          disabled={remove.isPending}
                        >
                          Keep {label}
                        </button>
                      </AlertDialog.Cancel>
                      <button
                        className="danger"
                        aria-busy={remove.isPending}
                        disabled={remove.isPending}
                        onClick={() => remove.mutate()}
                      >
                        {remove.isPending && <Spinner />}
                        {remove.isPending ? 'Deleting…' : `Delete ${label}`}
                      </button>
                    </div>
                  </AlertDialog.Content>
                </AlertDialog.Portal>
              </AlertDialog.Root>
            </div>
          </div>
        </>
      )}
    </article>
  );
}
