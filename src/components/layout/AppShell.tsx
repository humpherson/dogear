import { loadLibraryPage } from '../../app/pageLoaders';
import { usePreloadPages } from '../../app/usePreloadPages';
import { PageBoundary } from './PageBoundary';
import { Suspense } from 'react';
import { LoadingIndicator, Spinner } from '../ui/LoadingIndicator';
import { RequestActivity } from './RequestActivity';
import { useMutation } from '@tanstack/react-query';
import { signOut } from '../../services/authService';
import { message } from '../../lib/validation';
import { BookOpen, Plus, LogOut } from 'lucide-react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
export function AppShell() {
  const { session } = useAuth();
  const location = useLocation();
  usePreloadPages(session?.user.id);
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: signOut,
    onSuccess: () => navigate('/login', { replace: true }),
  });
  return (
    <>
      <a
        className="skip"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          const main = document.getElementById('main');
          main?.focus();
          main?.scrollIntoView();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <Link className="wordmark" to="/">
          dogeard<span>.</span>
        </Link>
        <nav aria-label="Main navigation">
          {session ? (
            <>
              <NavLink
                to="/library"
                onMouseEnter={() =>
                  void loadLibraryPage().catch(() => undefined)
                }
                onFocus={() => void loadLibraryPage().catch(() => undefined)}
                onTouchStart={() =>
                  void loadLibraryPage().catch(() => undefined)
                }
              >
                <BookOpen size={18} />
                Library
              </NavLink>
              <NavLink to="/quotes/new">
                <Plus size={18} />
                Add quote
              </NavLink>
              <button
                type="button"
                className="nav-sign-out"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                aria-busy={logout.isPending}
              >
                {logout.isPending ? (
                  <Spinner />
                ) : (
                  <LogOut size={18} aria-hidden="true" />
                )}
                {logout.isPending ? 'Signing out…' : 'Sign out'}
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login">Sign in</NavLink>
              <Link className="button small" to="/signup">
                Start your library
              </Link>
            </>
          )}
        </nav>
      </header>
      {session && logout.isError && (
        <p className="nav-error" role="alert">
          We couldn’t sign you out. {message(logout.error)} Please try again.
        </p>
      )}
      <main id="main" tabIndex={-1}>
        <RequestActivity />
        <PageBoundary
          key={`${session?.user.id || 'public'}:${location.pathname}`}
        >
          <Suspense
            fallback={
              <div>
                <h1 className="sr-only">Opening this page</h1>
                <LoadingIndicator>Opening this page…</LoadingIndicator>
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </PageBoundary>
      </main>
      <footer>
        <span className="wordmark">dogeard.</span>
        <span>A little space for words that matter.</span>
      </footer>
    </>
  );
}
