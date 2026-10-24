import { createClient } from '@supabase/supabase-js';
import { config } from './env';
import type { Database } from '../types/database';
export const supabase = config
  ? createClient<Database>(config.url, config.key, {
      auth: {
        flowType: 'implicit',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
export function db() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}
