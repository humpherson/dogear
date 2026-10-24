import { useState } from 'react';
import * as Dialog from '@radix-ui/react-alert-dialog';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import {
  collectionQueryOptions,
  quotesQueryOptions,
  cachedCollection,
} from '../features/library/libraryQuery';
import { cacheRenamedCollection } from '../features/library/quoteCache';
import { renameCollection } from '../services/quotesService';
import { collectionNameSchema, message } from '../lib/validation';
import type { CollectionAppearance } from '../types';
import { CollectionAppearanceFields } from '../components/collections/CollectionAppearanceFields';
import {
  CollectionDetails,
  CollectionCover,
} from '../components/collections/CollectionDetails';
import { QuoteCard } from '../components/quotes/QuoteCard';
import { LoadingIndicator, Spinner } from '../components/ui/LoadingIndicator';
export function CollectionPage() {
  const { collectionId = '' } = useParams(),
    { session } = useAuth(),
    client = useQueryClient(),
    navigate = useNavigate();
  const collection = useQuery(
      collectionQueryOptions(session?.user.id, collectionId),
    ),
    quotes = useQuery(
      quotesQueryOptions(session?.user.id, collectionId, 'collection'),
    );
  const [filter, setFilter] = useState(''),
    [renaming, setRenaming] = useState(false),
    [name, setName] = useState('');
  const [appearance, setAppearance] = useState<CollectionAppearance>({});
  const entry =
    collection.isSuccess && !collection.data
      ? null
      : (collection.data ??
        cachedCollection(client, session?.user.id, collectionId));
  const rename = useMutation({
    mutationFn: () =>
      renameCollection(
        collectionId,
        collectionNameSchema.parse(name),
        appearance,
      ),
    onSuccess: (result) => {
      cacheRenamedCollection(client, session!.user.id, result);
      setRenaming(false);
    },
  });
  if (!entry && collection.isPending)
    return <LoadingIndicator>Opening your collection…</LoadingIndicator>;
  if (!entry && collection.isError)
    return (
      <div role="alert">
        {message(collection.error)}{' '}
        <button onClick={() => void collection.refetch()}>Try again</button>
      </div>
    );
  if (!entry)
    return (
      <section className="empty">
        <h1>Collection not found</h1>
        <p>This collection isn’t in your library.</p>
        <Link to="/library">Return to your library</Link>
      </section>
    );
  const visible = quotes.data?.filter((quote) =>
    quote.text.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
  );
  return (
    <>
      <Link className="back-link" to="/library">
        ← Your library
      </Link>
      <CollectionDetails {...entry} />
      {collection.isError && (
        <p role="alert">
          {message(collection.error)}{' '}
          <button onClick={() => void collection.refetch()}>
            Retry collection
          </button>
        </p>
      )}
      <Dialog.Root
        open={renaming}
        onOpenChange={(open) => {
          if (!rename.isPending) {
            setRenaming(open);
            if (open) {
              setName(entry.name);
              setAppearance({
                background_colour: entry.background_colour,
                text_colour: entry.text_colour,
                icon_colour: entry.icon_colour,
                border_colour: entry.border_colour,
              });
              rename.reset();
            }
          }
        }}
      >
        <Dialog.Trigger asChild>
          <button className="secondary">Edit collection</button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>Edit collection</Dialog.Title>
            <Dialog.Description>
              Your collection name stays private. Renaming it won’t change quote
              credits.
            </Dialog.Description>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                rename.mutate();
              }}
            >
              <label htmlFor="rename-collection">Collection name</label>
              <input
                id="rename-collection"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                disabled={rename.isPending}
              />
              <CollectionAppearanceFields
                value={appearance}
                onChange={setAppearance}
                disabled={rename.isPending}
              />
              <CollectionCover name={name} {...appearance} large />
              {rename.isError && <p role="alert">{message(rename.error)}</p>}
              <div className="actions">
                <button type="submit" disabled={rename.isPending}>
                  {rename.isPending && <Spinner />}
                  {rename.isPending ? 'Saving…' : 'Save collection'}
                </button>
                <Dialog.Cancel asChild>
                  <button
                    type="button"
                    className="secondary"
                    disabled={rename.isPending}
                  >
                    Cancel
                  </button>
                </Dialog.Cancel>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className="page-heading">
        <h1 className="section-title">
          Your quotes{' '}
          <span className="muted">
            ({entry.quotes[0]?.count ?? quotes.data?.length ?? 0})
          </span>
        </h1>
        <Link className="button" to="/quotes/new" state={{ collection: entry }}>
          Add another quote
        </Link>
      </div>
      <label htmlFor="collection-filter">Filter your quotes</label>
      <input
        id="collection-filter"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Find a word or phrase…"
      />
      {quotes.isPending && (
        <LoadingIndicator>Loading your quotes…</LoadingIndicator>
      )}
      {quotes.isError && (
        <p role="alert">
          {message(quotes.error)}{' '}
          <button onClick={() => void quotes.refetch()}>Retry quotes</button>
        </p>
      )}
      {visible?.length ? (
        visible.map((quote) => (
          <QuoteCard
            key={quote.id}
            quote={quote}
            onDeleted={(remaining) => {
              if (remaining === 0) navigate('/library', { replace: true });
            }}
          />
        ))
      ) : quotes.isSuccess ? (
        <p>No quotes match your filter.</p>
      ) : null}
    </>
  );
}
