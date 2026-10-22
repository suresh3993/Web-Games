import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate } from 'react-router';
import { PASSWORD_MIN_LENGTH, registerSchema } from '@suresh/validation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { cn } from '@/lib/utils';
import { useCurrentUser, useRegister } from './api';
import { applyServerError, AuthLayout } from './auth-layout';

function PasswordMeter({ value }: { value: string }) {
  // Length is what matters most (NIST 800-63B); variety gives a small bonus.
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(value)).length;
  const score = value.length === 0 ? 0 : value.length < PASSWORD_MIN_LENGTH ? 1 : value.length >= 16 || variety >= 3 ? 3 : 2;
  const labels = ['', 'Too short', 'Good', 'Strong'];
  const colors = ['bg-muted', 'bg-destructive', 'bg-warning', 'bg-success'];
  return (
    <div className="grid gap-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full', i <= score ? colors[score] : 'bg-muted')} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {score ? `Password strength: ${labels[score]}` : `Use at least ${PASSWORD_MIN_LENGTH} characters. A short phrase works well.`}
      </p>
    </div>
  );
}

export function RegisterPage() {
  const { data: user } = useCurrentUser();
  const register = useRegister();
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const password = form.watch('password');

  if (user) return <Navigate to="/" replace />;

  if (submittedEmail) {
    return (
      <AuthLayout title="Check your inbox" description={<>We sent a verification link to <strong>{submittedEmail}</strong>.</>}>
        <div className="grid gap-4">
          <div className="flex justify-center py-2">
            <MailCheck className="size-14 text-accent-text" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted-foreground">
            Open the link within 24 hours to verify your address, then log in. Can&apos;t find it? Check your spam folder.
          </p>
          {import.meta.env.DEV && (
            <Alert tone="info" title="Local development">
              Emails are captured by Mailpit:{' '}
              <a className="font-medium text-primary-text underline" href="http://localhost:8025" target="_blank" rel="noreferrer">
                open http://localhost:8025
              </a>
            </Alert>
          )}
          <Button asChild size="lg">
            <Link to="/login">Go to log in</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await register.mutateAsync(values);
      setSubmittedEmail(values.email);
    } catch (err) {
      applyServerError(err, form.setError, ['displayName', 'email', 'password']);
    }
  });

  return (
    <AuthLayout
      title="Create your account"
      description="Free forever. Save scores, earn XP and climb the leaderboards."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary-text hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
        <FormField
          label="Display name"
          autoComplete="nickname"
          autoFocus
          maxLength={32}
          hint="Shown on leaderboards. 2–32 characters."
          error={errors.displayName?.message}
          {...form.register('displayName')}
        />
        <FormField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...form.register('email')} />
        <div className="grid gap-2">
          <FormField
            label="Password"
            type="password"
            autoComplete="new-password"
            maxLength={128}
            error={errors.password?.message}
            {...form.register('password')}
          />
          <PasswordMeter value={password} />
        </div>
        <Button type="submit" size="lg" loading={isSubmitting}>
          Create account
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          By creating an account you agree to play fair. We never sell your data.
        </p>
      </form>
    </AuthLayout>
  );
}
