import { useMutation } from '@tanstack/react-query';
import { signOut } from '../../services/authService';
import { message } from '../../lib/validation';
import { BookOpen, Plus, LogOut } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
export function AppShell() {
  const { session } = useAuth();
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
          dogear<span>.</span>
        </Link>
        <nav aria-label="Main navigation">
          {session ? (
            <>
              <NavLink to="/library">
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
              >
                <LogOut size={18} aria-hidden="true" />
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
        <Outlet />
      </main>
      <footer>
        <span className="wordmark">dogear.</span>
        <span>A little space for words that matter.</span>
      </footer>
    </>
  );
}
