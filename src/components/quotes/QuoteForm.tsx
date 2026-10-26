import { normaliseTerm } from '../../services/dictionaryService';
import { Spinner } from '../ui/LoadingIndicator';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { DictionaryLookup } from './DictionaryLookup';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  quoteSchema,
  definitionSchema,
  type SavedItemInput,
  type EditorFields,
} from '../../lib/validation';
export function QuoteForm({
  itemType = 'quote',
  onDraftChange,
  creating = false,
  collection = false,
  focusOnMount = false,
  showPrivacyHint = true,
  showCredits = collection,
  initial,
  onSubmit,
  pending,
  error,
  onCancel,
  disabled = false,
  pendingLabel = 'Saving…',
}: {
  itemType?: 'quote' | 'definition';
  onDraftChange?: (draft: EditorFields) => void;
  creating?: boolean;
  collection?: boolean;
  focusOnMount?: boolean;
  showPrivacyHint?: boolean;
  showCredits?: boolean;
  initial?: EditorFields;
  onSubmit: (data: SavedItemInput) => void;
  pending: boolean;
  pendingLabel?: string;
  disabled?: boolean;
  error?: string;
  onCancel?: () => void;
}) {
  const definition = itemType === 'definition';
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(() =>
    Boolean(
      initial &&
      (initial.page_number ||
        initial.note ||
        initial.credit_author ||
        initial.credit_source),
    ),
  );
  const {
    register,
    control,
    getValues,
    setValue,
    setFocus,
    handleSubmit,
    formState: { errors },
  } = useForm<EditorFields>({
    resolver: zodResolver(
      definition ? definitionSchema : quoteSchema,
    ) as Resolver<EditorFields>,
    defaultValues: {
      ...(definition
        ? {
            item_type: 'definition' as const,
            term: '',
            lookup_attribution: null,
          }
        : {}),
      text: '',
      page_number: '',
      note: '',
      ...(showCredits ? { credit_author: '', credit_source: '' } : {}),
      ...initial,
    },
  });
  const term = useWatch({ control, name: 'term' }) || '';
  const meaning = useWatch({ control, name: 'text' }) || '';
  useEffect(() => {
    if (!focusOnMount) return;
    setFocus(definition ? 'term' : 'text');
    form.current
      ?.querySelector(definition ? 'input' : 'textarea')
      ?.scrollIntoView?.({ block: 'center' });
  }, [definition, focusOnMount, setFocus]);
  useEffect(() => {
    // Validation may reveal a previously collapsed field. Focus after it opens.
    const field = (
      ['credit_author', 'credit_source', 'page_number', 'note'] as const
    ).find((key) => errors[key]);
    if (field) setFocus(field);
  }, [errors, setFocus]);
  return (
    <form
      autoComplete="off"
      name="quote-editor"
      onChange={() => onDraftChange?.(getValues())}
      ref={form}
      onSubmit={handleSubmit((values) =>
        onSubmit((definition ? definitionSchema : quoteSchema).parse(values)),
      )}
      className="quote-form"
      aria-busy={pending}
    >
      {definition && (
        <>
          <label htmlFor={`${id}-term`}>Word or phrase</label>
          <input
            id={`${id}-term`}
            autoComplete="off"
            {...register('term')}
            maxLength={120}
            aria-invalid={!!errors.term}
            aria-describedby={`${id}-term-error`}
          />
          <p className="field-error" id={`${id}-term-error`}>
            {errors.term?.message}
          </p>
          <DictionaryLookup
            key={normaliseTerm(term)}
            term={term}
            hasMeaning={!!meaning.trim()}
            onChoose={(result) => {
              setValue('text', result.definition, {
                shouldDirty: true,
                shouldValidate: true,
              });
              setValue('lookup_attribution', result.attribution, {
                shouldDirty: true,
              });
              onDraftChange?.(getValues());
              setFocus('text');
              form.current
                ?.querySelector('textarea')
                ?.scrollIntoView?.({ block: 'center' });
            }}
          />
        </>
      )}
      <label htmlFor={`${id}-quote-text`}>
        {definition ? 'Meaning' : 'The words you want to keep'}
      </label>
      <textarea
        autoComplete="off"
        id={`${id}-quote-text`}
        rows={7}
        placeholder={
          definition
            ? 'Explain what this word or phrase means…'
            : 'A sentence, a passage, a little perspective…'
        }
        {...register('text')}
        aria-invalid={!!errors.text}
        aria-describedby={
          showPrivacyHint
            ? `${id}-quote-text-error ${id}-visibility`
            : `${id}-quote-text-error`
        }
      />
      <p id={`${id}-quote-text-error`} className="field-error">
        {errors.text?.message}
      </p>
      <details
        className="quote-details"
        open={
          detailsOpen ||
          !!(
            errors.page_number ||
            errors.note ||
            errors.credit_author ||
            errors.credit_source
          )
        }
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      >
        <summary>
          {showCredits || definition
            ? 'Add attribution and details'
            : 'Add details'}{' '}
          <span className="muted">(optional)</span>
        </summary>
        {(showCredits || definition) && (
          <>
            {!definition && (
              <>
                <label htmlFor={`${id}-author`}>
                  Author or speaker <span className="muted">(optional)</span>
                </label>
                <input
                  autoComplete="off"
                  id={`${id}-author`}
                  {...register('credit_author')}
                  maxLength={10000}
                  aria-invalid={!!errors.credit_author}
                  aria-describedby={`${id}-author-error`}
                />
                <p className="field-error" id={`${id}-author-error`}>
                  {errors.credit_author?.message}
                </p>
              </>
            )}
            <label htmlFor={`${id}-source`}>
              Source <span className="muted">(optional)</span>
            </label>
            <input
              autoComplete="off"
              id={`${id}-source`}
              {...register('credit_source')}
              maxLength={1000}
              placeholder={
                definition
                  ? 'e.g. a dictionary or article'
                  : 'e.g. a song title or conversation'
              }
              aria-invalid={!!errors.credit_source}
              aria-describedby={`${id}-source-error`}
            />
            <p className="field-error" id={`${id}-source-error`}>
              {errors.credit_source?.message}
            </p>
          </>
        )}
        <label htmlFor={`${id}-page-number`}>
          {collection ? 'Reference' : 'Page or location'}{' '}
          <span className="muted">(optional)</span>
        </label>
        <input
          autoComplete="off"
          id={`${id}-page-number`}
          placeholder="e.g. 42, xiv, or Chapter 3"
          {...register('page_number')}
          aria-invalid={!!errors.page_number}
          aria-describedby={`${id}-page-error`}
        />
        <p id={`${id}-page-error`} className="field-error">
          {errors.page_number?.message}
        </p>
        <label htmlFor={`${id}-quote-note`}>
          A note to yourself <span className="muted">(optional)</span>
        </label>
        <textarea
          autoComplete="off"
          id={`${id}-quote-note`}
          rows={3}
          {...register('note')}
          aria-invalid={!!errors.note}
          aria-describedby={`${id}-note-error`}
        />
        <p id={`${id}-note-error`} className="field-error">
          {errors.note?.message}
        </p>
      </details>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {showPrivacyHint && (
        <p id={`${id}-visibility`} className="hint">
          Collection names, notes, references and account details stay private.
        </p>
      )}
      <div className="actions">
        <button
          disabled={pending || disabled}
          type="submit"
          aria-busy={pending}
        >
          {pending && <Spinner />}
          {pending
            ? pendingLabel
            : initial && !creating
              ? 'Save changes'
              : definition
                ? 'Keep this definition'
                : 'Keep this quote'}
        </button>
        {onCancel && (
          <button
            type="button"
            className="secondary"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
