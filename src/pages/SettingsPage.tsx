import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../features/auth/AuthProvider';
import { db } from '../lib/supabase';
import { getProfile, updateProfile } from '../services/libraryService';
import { message } from '../lib/validation';
export function SettingsPage() {
  const { session } = useAuth();
  const id = session!.user.id,
    client = useQueryClient();
  const [name, setName] = useState<string | null>(null),
    [error, setError] = useState('');
  const profile = useQuery({
    queryKey: ['private', id, 'profile'],
    queryFn: () => getProfile(id),
  });
  const mutation = useMutation({
    mutationFn: () =>
      updateProfile(id, name ?? profile.data?.display_name ?? ''),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['private', id, 'profile'] }),
  });
  async function signOut() {
    setError('');
    const { error } = await db().auth.signOut();
    if (error) setError(message(error));
  }
  return (
    <section className="auth-card">
      <p className="eyebrow">Your space</p>
      <h1>
        Settings<span className="gold">.</span>
      </h1>
      <p>{session?.user.email}</p>
      {profile.isPending ? (
        <p role="status">Loading profile…</p>
      ) : profile.isError ? (
        <p role="alert">{message(profile.error)}</p>
      ) : (
        <form
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <label htmlFor="display-name">Display name</label>
          <input
            autoComplete="nickname"
            name="profile-display-name"
            id="display-name"
            value={name ?? profile.data?.display_name ?? ''}
            maxLength={100}
            onChange={(e) => {
              setName(e.target.value);
              mutation.reset();
            }}
          />
          {mutation.isError && <p role="alert">{message(mutation.error)}</p>}
          {mutation.isSuccess && <p role="status">Profile saved.</p>}
          <button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      )}
      <hr />
      <button className="secondary" onClick={() => void signOut()}>
        Sign out
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
