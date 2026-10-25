import { Spinner } from '../ui/LoadingIndicator';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { quoteSchema, type QuoteInput } from '../../lib/validation';
export function QuoteForm({
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
  collection?: boolean;
  focusOnMount?: boolean;
  showPrivacyHint?: boolean;
  showCredits?: boolean;
  initial?: QuoteInput;
  onSubmit: (data: QuoteInput) => void;
  pending: boolean;
  pendingLabel?: string;
  disabled?: boolean;
  error?: string;
  onCancel?: () => void;
}) {
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
    setFocus,
    handleSubmit,
    formState: { errors },
  } = useForm<QuoteInput>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      text: '',
      page_number: '',
      note: '',
      ...(showCredits ? { credit_author: '', credit_source: '' } : {}),
      ...initial,
    },
  });
  useEffect(() => {
    if (!focusOnMount) return;
    setFocus('text');
    form.current
      ?.querySelector('textarea')
      ?.scrollIntoView?.({ block: 'center' });
  }, [focusOnMount, setFocus]);
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
      ref={form}
      onSubmit={handleSubmit(onSubmit)}
      className="quote-form"
      aria-busy={pending}
    >
      <label htmlFor={`${id}-quote-text`}>The words you want to keep</label>
      <textarea
        autoComplete="off"
        id={`${id}-quote-text`}
        rows={7}
        placeholder="A sentence, a passage, a little perspective…"
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
          {showCredits ? 'Add attribution and details' : 'Add details'}{' '}
          <span className="muted">(optional)</span>
        </summary>
        {showCredits && (
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
            <label htmlFor={`${id}-source`}>
              Source <span className="muted">(optional)</span>
            </label>
            <input
              autoComplete="off"
              id={`${id}-source`}
              {...register('credit_source')}
              maxLength={1000}
              placeholder="e.g. a song title or conversation"
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
            : initial
              ? 'Save changes'
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
