import type { ReactNode } from 'react';

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function LoadingIndicator({ children }: { children: ReactNode }) {
  return (
    <p className="loading-indicator" role="status">
      <Spinner />
      <span>{children}</span>
    </p>
  );
}
