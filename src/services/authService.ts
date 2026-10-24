import { db } from '../lib/supabase';
export async function signOut() {
  const { error } = await db().auth.signOut();
  if (error) throw error;
}
