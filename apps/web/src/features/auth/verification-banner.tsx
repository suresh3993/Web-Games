import { MailWarning } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api';
import { useCurrentUser, useResendVerification } from './api';

/** Nudges logged-in users with an unverified email address. */
export function VerificationBanner() {
  const { data: user } = useCurrentUser();
  const resend = useResendVerification();
  if (!user || user.emailVerified) return null;

  const onResend = async () => {
    try {
      const { message } = await resend.mutateAsync();
      toast.success(message);
    } catch (err) {
      toast.error(isApiError(err) ? err.message : 'Could not send the email.');
    }
  };

  return (
    <div role="status" className="border-b border-warning/30 bg-warning/10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5 text-sm sm:px-6">
        <MailWarning className="size-4 text-warning" aria-hidden="true" />
        <p className="flex-1">
          Please verify <strong>{user.email}</strong> to unlock playing games and saving scores.
        </p>
        <Button size="sm" variant="outline" onClick={onResend} loading={resend.isPending}>
          Resend email
        </Button>
      </div>
    </div>
  );
}
