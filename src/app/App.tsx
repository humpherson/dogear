import { loadLibraryPage, loadBookPage } from './pageLoaders';
import { AuthPage } from '../pages/AuthPage';
import { AddQuotePage } from '../pages/AddQuotePage';
import { LoadingIndicator } from '../components/ui/LoadingIndicator';
import { lazy } from 'react';
import { HashRouter, Navigate, Route, Routes, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { AppShell } from '../components/layout/AppShell';
import { LandingPage } from '../pages/LandingPage';
const LibraryPage = lazy(loadLibraryPage);
const BookPage = lazy(loadBookPage);
import { config } from '../lib/env';
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
function Callback({ error }: { error?: string }) {
  const { loading, session, recovery } = useAuth();
  if (error)
    return (
      <section className="auth-card">
        <h1>This link couldn’t be opened.</h1>
        <p role="alert">{error}</p>
        <Link to="/reset-password">Request a new reset link</Link>
        <p>
          <Link to="/login">Return to sign in</Link>
        </p>
      </section>
    );
  if (loading)
    return <LoadingIndicator>Confirming your session…</LoadingIndicator>;
  return (
    <Navigate
      to={session ? (recovery ? '/update-password' : '/library') : '/login'}
      replace
    />
  );
}
export function App({ callbackError }: { callbackError?: string }) {
  if (!config)
    return (
      <main className="setup">
        <span className="wordmark">dogeard.</span>
        <h1>A little setup first.</h1>
        <p>
          Dogeard needs Supabase to save your library and keep your notes
          private.
        </p>
        <ol>
          <li>
            Run <code>npm run db:start</code> and <code>npm run db:reset</code>.
          </li>
          <li>
            Copy <code>.env.example</code> to <code>.env.local</code>.
          </li>
          <li>
            Add the local project URL and publishable key from{' '}
            <code>npx supabase status</code>, then restart the dev server.
          </li>
        </ol>
        <p>See README.md for the complete setup guide.</p>
      </main>
    );
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<LandingPage />} />
              <Route
                path="login"
                element={<AuthPage key="login" mode="login" />}
              />
              <Route
                path="signup"
                element={<AuthPage key="signup" mode="signup" />}
              />
              <Route
                path="reset-password"
                element={<AuthPage key="reset" mode="reset" />}
              />
              <Route
                path="update-password"
                element={<AuthPage key="update" mode="update" />}
              />
              <Route
                path="auth/callback"
                element={<Callback error={callbackError} />}
              />
              <Route element={<ProtectedRoute />}>
                <Route path="library" element={<LibraryPage />} />
                <Route path="books/:userBookId" element={<BookPage />} />
                <Route path="quotes/new" element={<AddQuotePage />} />
                <Route
                  path="settings"
                  element={<Navigate to="/library" replace />}
                />
              </Route>
              <Route
                path="*"
                element={
                  <section className="empty">
                    <h1>A page turned too far.</h1>
                    <Link to="/">Return home</Link>
                  </section>
                }
              />
            </Route>
          </Routes>
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
