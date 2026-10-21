import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api';
import { useCurrentUser, useVerifyEmail } from './api';
import { AuthLayout } from './auth-layout';
import { useUrlToken } from './use-url-token';

export function VerifyEmailPage() {
  const token = useUrlToken();
  const verify = useVerifyEmail();
  const { data: user } = useCurrentUser();
  const started = useRef(false);

  // Submit exactly once (StrictMode re-runs effects in development).
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verify.mutate(token);
  }, [token, verify]);

  if (!token) {
    return (
      <AuthLayout title="Verification link missing">
        <Alert tone="error">Open the link from your verification email to confirm your address.</Alert>
      </AuthLayout>
    );
  }

  if (verify.isError) {
    return (
      <AuthLayout title="Link expired">
        <div className="grid gap-4">
          <Alert tone="error">{isApiError(verify.error) ? verify.error.message : 'We could not verify your email.'}</Alert>
          <p className="text-sm text-muted-foreground">
            {user ? 'Use the “Resend email” button in the banner above to get a fresh link.' : 'Log in and request a new verification email.'}
          </p>
          {!user && (
            <Button asChild>
              <Link to="/login">Log in</Link>
            </Button>
          )}
        </div>
      </AuthLayout>
    );
  }

  if (verify.isSuccess) {
    return (
      <AuthLayout title="Email verified">
        <div className="grid gap-4">
          <Alert tone="success">{verify.data.message} You’re all set.</Alert>
          <Button asChild size="lg">
            <Link to={user ? '/explore' : '/login'}>{user ? 'Explore games' : 'Log in'}</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Verifying your email">
      <div className="flex items-center gap-3 text-muted-foreground" role="status">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" /> One moment…
      </div>
    </AuthLayout>
  );
}
