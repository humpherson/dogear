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

const lookupAttributionSchema = z.object({
  provider: z.literal('free-dictionary-api'),
  source_urls: z.array(z.url().startsWith('https://').max(2048)).max(5),
  license_name: z.string().max(120).optional(),
  license_url: z.url().startsWith('https://').max(2048).optional(),
});
export const definitionSchema = quoteSchema.extend({
  item_type: z.literal('definition'),
  term: z
    .string()
    .trim()
    .min(1, 'Enter a word or short phrase.')
    .max(120, 'Use at most 120 characters.')
    .regex(/^[^\r\n]+$/, 'Keep the word or phrase on one line.'),
  text: z
    .string()
    .trim()
    .min(1, 'Enter a meaning.')
    .max(10000, 'Use at most 10,000 characters.'),
  lookup_attribution: lookupAttributionSchema.nullable().optional(),
});
export const savedItemSchema = z.union([
  definitionSchema,
  quoteSchema.extend({
    item_type: z.literal('quote').optional(),
    term: z.null().optional(),
    lookup_attribution: z.null().optional(),
  }),
]);
export type DefinitionInput = z.infer<typeof definitionSchema>;
export type SavedItemInput = z.infer<typeof savedItemSchema>;
export type EditorFields = QuoteInput & {
  item_type?: 'quote' | 'definition';
  term?: string;
  lookup_attribution?: import('../types').LookupAttribution | null;
};
