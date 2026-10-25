import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
export function ProtectedRoute() {
  const { session, loading, error } = useAuth();
  const location = useLocation();
  if (loading)
    return <LoadingIndicator>Opening your library…</LoadingIndicator>;
  if (error) return <p role="alert">{error}</p>;
  return session ? (
    <Outlet key={session.user.id} />
  ) : (
    <Navigate
      to="/login"
      state={{ from: location.pathname + location.search }}
      replace
    />
  );
}
