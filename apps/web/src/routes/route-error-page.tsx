import { AlertOctagon } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { NotFoundPage } from './not-found-page';

/** Router error boundary: renders instead of a blank screen when a route crashes or a chunk fails to load. */
export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;

  if (import.meta.env.DEV) console.error(error);
  const chunkFailed = error instanceof Error && /dynamically imported module|Loading chunk/i.test(error.message);

  return (
    <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <EmptyState
        icon={AlertOctagon}
        title={chunkFailed ? 'A new version is available' : 'Something went wrong'}
        description={
          chunkFailed
            ? 'PLAYVERSE was updated while you were browsing. Reload to get the latest version.'
            : 'An unexpected error occurred. Reloading usually fixes it — if not, please try again later.'
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => window.location.reload()}>Reload page</Button>
            <Button asChild variant="outline">
              <a href="/">Go home</a>
            </Button>
          </div>
        }
      />
    </div>
  );
}
