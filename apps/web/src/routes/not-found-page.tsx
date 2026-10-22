import { Ghost } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <p className="mb-4 text-center font-display text-7xl font-bold text-gradient" aria-hidden="true">
        404
      </p>
      <EmptyState
        icon={Ghost}
        headingLevel={1}
        title="This level doesn’t exist"
        description="The page you’re looking for was moved, removed or never spawned."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to="/">Back to home</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/explore">Explore games</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
