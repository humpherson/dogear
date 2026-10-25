import { protectCollectionChooserEscape } from '../collections/collectionDialog';
import { CollectionAppearanceFields } from '../collections/CollectionAppearanceFields';
import { type CollectionAppearance } from '../../types';
import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-alert-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { libraryQueryOptions } from '../../features/library/libraryQuery';
import { cacheMovedQuote } from '../../features/library/quoteCache';
import { moveQuote, type MoveTarget } from '../../services/quotesService';
import {
  type Quote,
  type BookSummary,
  type BookSearchResult,
  isCollection,
  entryTitle,
  entryPath,
  quoteParent,
} from '../../types';
import { collectionNameSchema, message } from '../../lib/validation';
import { LoadingIndicator, Spinner } from '../ui/LoadingIndicator';
export function MoveQuoteDialog({
  quote,
  book,
}: {
  quote: Quote;
  book?: BookSummary | BookSearchResult;
}) {
  const { session } = useAuth(),
    client = useQueryClient(),
    navigate = useNavigate();
  const [open, setOpen] = useState(false),
    [target, setTarget] = useState(''),
    [name, setName] = useState(''),
    [author, setAuthor] = useState(''),
    [source, setSource] = useState(''),
    [error, setError] = useState('');
  const [appearance, setAppearance] = useState<CollectionAppearance>({});
  const original = useRef({ author: '', source: '' });
  const library = useQuery({
    ...libraryQueryOptions(session?.user.id),
    enabled: open && !!session,
  });
  const parent = quoteParent(quote);
  const targets =
    library.data?.filter(
      (entry) =>
        !(
          entry.id === parent.id &&
          (isCollection(entry) ? 'collection' : 'book') === parent.kind
        ),
    ) || [];
  const mutation = useMutation({
    mutationFn: async () => {
      let destination: MoveTarget;
      if (target === 'new') {
        destination = {
          kind: 'collection',
          name: collectionNameSchema.parse(name),
          ...appearance,
        };
      } else {
        const entry = targets.find(
          (item) =>
            `${isCollection(item) ? 'collection' : 'book'}:${item.id}` ===
            target,
        );
        if (!entry) throw new Error('Choose a destination.');
        destination = {
          kind: isCollection(entry) ? 'collection' : 'book',
          id: entry.id,
        };
      }
      if (author.length > 10000 || source.length > 1000)
        throw new Error('Attribution is too long.');
      return moveQuote(
        quote.id,
        destination,
        author.trim() !== original.current.author ||
          source.trim() !== original.current.source
          ? { credit_author: author.trim(), credit_source: source.trim() }
          : undefined,
      );
    },
    onSuccess: async (result) => {
      await cacheMovedQuote(client, session!.user.id, result);
      setOpen(false);
      navigate(entryPath(result.destination_entry));
    },
  });
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (mutation.isPending) return;
        if (value) {
          const credits = {
            author:
              quote.credit_mode === 'custom'
                ? quote.credit_author || ''
                : book?.authors.join(', ') || 'Unknown author',
            source:
              quote.credit_mode === 'custom'
                ? quote.credit_source || ''
                : book?.title || '',
          };
          original.current = credits;
          setAuthor(credits.author);
          setSource(credits.source);
          setTarget('');
          setName('');
          setAppearance({});
          setError('');
          mutation.reset();
        }
        setOpen(value);
      }}
    >
      <Dialog.Trigger asChild>
        <button className="text-button">Move</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog managed-dialog"
          onEscapeKeyDown={protectCollectionChooserEscape}
        >
          <Dialog.Title>Move this quote</Dialog.Title>
          <Dialog.Description>
            Choose a new home and review its credits. Moving the final quote
            also removes its previous book or collection from your library.
          </Dialog.Description>
          <form
            className="dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              setError('');
              if (!target) {
                setError('Choose a destination.');
                return;
              }
              mutation.mutate();
            }}
          >
            <div className="dialog-scroll">
              {library.isPending && (
                <LoadingIndicator>Loading your library…</LoadingIndicator>
              )}
              {library.isError && (
                <p role="alert">
                  {message(library.error)}{' '}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void library.refetch()}
                  >
                    Retry library
                  </button>
                </p>
              )}
              <label htmlFor={`move-target-${quote.id}`}>Destination</label>
              <select
                id={`move-target-${quote.id}`}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                disabled={mutation.isPending}
              >
                <option value="">Choose a book or collection</option>
                {targets.map((entry) => (
                  <option
                    key={`${isCollection(entry) ? 'collection' : 'book'}:${entry.id}`}
                    value={`${isCollection(entry) ? 'collection' : 'book'}:${entry.id}`}
                  >
                    {entryTitle(entry)}
                    {isCollection(entry) ? ' — Collection' : ' — Book'}
                  </option>
                ))}
                <option value="new">Create a collection</option>
              </select>
              {target === 'new' && (
                <>
                  <label htmlFor={`move-name-${quote.id}`}>
                    New collection name
                  </label>
                  <input
                    id={`move-name-${quote.id}`}
                    value={name}
                    maxLength={120}
                    onChange={(event) => setName(event.target.value)}
                    disabled={mutation.isPending}
                  />
                  <details className="collection-customise">
                    <summary>Customise collection</summary>
                    <CollectionAppearanceFields
                      value={appearance}
                      onChange={setAppearance}
                      disabled={mutation.isPending}
                    />
                  </details>
                </>
              )}
              <label htmlFor={`move-author-${quote.id}`}>
                Author or speaker (optional)
              </label>
              <input
                id={`move-author-${quote.id}`}
                value={author}
                maxLength={10000}
                onChange={(event) => setAuthor(event.target.value)}
                disabled={mutation.isPending}
              />
              <label htmlFor={`move-source-${quote.id}`}>
                Source (optional)
              </label>
              <input
                id={`move-source-${quote.id}`}
                value={source}
                maxLength={1000}
                onChange={(event) => setSource(event.target.value)}
                disabled={mutation.isPending}
              />
              <p className="hint">
                Review the author and source credits for this quote. Collection
                names, notes and references stay private.
              </p>
              {(error || mutation.isError) && (
                <p role="alert">{error || message(mutation.error)}</p>
              )}
            </div>
            <div className="actions dialog-footer">
              <button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Spinner />}
                {mutation.isPending ? 'Moving…' : 'Move quote'}
              </button>
              <Dialog.Cancel asChild>
                <button
                  type="button"
                  className="secondary"
                  disabled={mutation.isPending}
                >
                  Cancel
                </button>
              </Dialog.Cancel>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
