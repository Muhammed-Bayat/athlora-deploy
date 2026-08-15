import type { ReactNode } from 'react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

interface AsyncBoundaryProps {
  loading: boolean;
  error?: Error | null;
  onRetry?: () => void;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  children: ReactNode;
}

export function AsyncBoundary({
  loading,
  error,
  onRetry,
  empty,
  emptyTitle = 'No items found',
  emptyDescription,
  children,
}: AsyncBoundaryProps) {
  if (loading) {
    return (
      <div role="status" aria-label="Loading content" style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-danger, #dc2626)', marginBottom: '1rem' }}>
          {error.message || 'An error occurred while loading data.'}
        </p>
        {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
      </div>
    );
  }

  if (empty) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return <>{children}</>;
}
