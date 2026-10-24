import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
export function ProtectedRoute() {
  const { session, loading, error } = useAuth();
  const location = useLocation();
  if (loading) return <p role="status">Opening your library…</p>;
  if (error) return <p role="alert">{error}</p>;
  return session ? (
    <Outlet />
  ) : (
    <Navigate
      to="/login"
      state={{ from: location.pathname + location.search }}
      replace
    />
  );
}
