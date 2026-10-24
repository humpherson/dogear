import { db } from '../lib/supabase';
import type { Database } from '../types/database';
export type HomepageQuote =
  Database['public']['Functions']['get_random_homepage_quote']['Returns'][number];
export async function getRandomHomepageQuote(): Promise<HomepageQuote | null> {
  const { data, error } = await db().rpc('get_random_homepage_quote');
  if (error) throw error;
  return data?.[0] || null;
}
