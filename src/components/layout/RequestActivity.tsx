import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { useAuth } from '../../features/auth/AuthProvider';
import { Spinner } from '../ui/LoadingIndicator';

export function RequestActivity() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const { loading } = useAuth();
  if (!loading && !fetching && !mutating) return null;
  return (
    <div
      className="request-activity"
      role="progressbar"
      aria-label="Request in progress"
      aria-valuetext={mutating ? 'Working…' : 'Loading…'}
    >
      <Spinner />
      <span>{mutating ? 'Working…' : 'Loading…'}</span>
    </div>
  );
}
