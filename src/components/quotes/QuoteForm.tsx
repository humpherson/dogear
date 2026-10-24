import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { quoteSchema, type QuoteInput } from '../../lib/validation';
export function QuoteForm({
  initial,
  onSubmit,
  pending,
  error,
  onCancel,
  pendingLabel = 'Saving…',
}: {
  initial?: QuoteInput;
  onSubmit: (data: QuoteInput) => void;
  pending: boolean;
  pendingLabel?: string;
  error?: string;
  onCancel?: () => void;
}) {
  const id = useId();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<QuoteInput>({
    resolver: zodResolver(quoteSchema),
    defaultValues: initial || { text: '', page_number: '', note: '' },
  });
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="quote-form">
      <label htmlFor={`${id}-quote-text`}>The words you want to keep</label>
      <textarea
        id={`${id}-quote-text`}
        rows={7}
        placeholder="A sentence, a passage, a little perspective…"
        {...register('text')}
        aria-invalid={!!errors.text}
        aria-describedby={`${id}-quote-text-error ${id}-visibility`}
      />
      <p id={`${id}-quote-text-error`} className="field-error">
        {errors.text?.message}
      </p>
      <label htmlFor={`${id}-page-number`}>
        Page or location <span className="muted">(optional)</span>
      </label>
      <input
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
        id={`${id}-quote-note`}
        rows={3}
        {...register('note')}
        aria-invalid={!!errors.note}
        aria-describedby={`${id}-note-error`}
      />
      <p id={`${id}-note-error`} className="field-error">
        {errors.note?.message}
      </p>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <p id={`${id}-visibility`} className="hint">
        Quote text and book attribution may appear on the public homepage. Your
        notes and account details stay private.
      </p>
      <div className="actions">
        <button disabled={pending} type="submit">
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
