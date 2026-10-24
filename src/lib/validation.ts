import { z } from 'zod';
export const quoteSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Enter a quotation.')
    .max(10000, 'Keep quotations under 10,001 characters.'),
  page_number: z.string().trim().max(100, 'Use at most 100 characters.'),
  note: z.string().trim().max(5000, 'Use at most 5,000 characters.'),
  credit_author: z
    .string()
    .trim()
    .max(10000, 'Use at most 10,000 characters.')
    .optional(),
  credit_source: z
    .string()
    .trim()
    .max(1000, 'Use at most 1,000 characters.')
    .optional(),
});
export type QuoteInput = z.infer<typeof quoteSchema>;
export function message(error: unknown) {
  if (error instanceof z.ZodError)
    return error.issues[0]?.message || 'Check the entered values.';
  return error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : 'Something went wrong. Please try again.';
}

export const collectionNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a collection name.')
  .max(120, 'Use at most 120 characters.');
