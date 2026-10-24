import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { supabase } from './lib/supabase';
import { readCallback } from './features/auth/callback';
import { message } from './lib/validation';
import './index.css';
async function start() {
  const callback = readCallback(window.location);
  let error = callback.error || undefined;
  if (callback.active && supabase) {
    try {
      const { data, error: authError } = await supabase.auth.getSession();
      if (authError) throw authError;
      if (callback.recovery && data.session && !error)
        sessionStorage.setItem('dogear-recovery', 'true');
    } catch (e) {
      error = message(e);
    }
    // Supabase has consumed the fragment. Remove auth material before rendering routes.
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}#/auth/callback`,
    );
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App callbackError={error} />
    </StrictMode>,
  );
}
void start();
