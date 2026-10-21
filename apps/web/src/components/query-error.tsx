import { RefreshCw, WifiOff } from 'lucide-react';
import { isApiError } from '@/lib/api';
import { Button } from './ui/button';
import { EmptyState } from './empty-state';

export function QueryError({ error, onRetry, title = 'We could not load this' }: { error: unknown; onRetry?: () => void; title?: string }) {
  const message = isApiError(error) ? error.message : 'Something went wrong. Please try again.';
  return (
    <EmptyState
      icon={WifiOff}
      title={title}
      description={message}
      action={
        onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw aria-hidden="true" /> Try again
          </Button>
        )
      }
    />
  );
}
