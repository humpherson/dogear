import { z } from 'zod';
import { isPublishableKey, isSupabaseUrl } from './publicConfig';
const schema = z.object({
  url: z.url().refine(isSupabaseUrl, 'Use an HTTP or HTTPS Supabase URL'),
  key: z
    .string()
    .min(1)
    .refine(
      (v) => isPublishableKey(v),
      'Use a publishable key, never a secret key',
    ),
});
const parsed = schema.safeParse({
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});
export const config = parsed.success ? parsed.data : null;
