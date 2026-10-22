import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { forgotPasswordSchema } from '@suresh/validation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { useForgotPassword } from './api';
import { applyServerError, AuthLayout } from './auth-layout';

export function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const form = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await forgot.mutateAsync(values);
    } catch (err) {
      applyServerError(err, form.setError, ['email']);
    }
  });

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter your account email and we’ll send you a single-use reset link."
      footer={
        <Link to="/login" className="font-medium text-primary-text hover:underline">
          Back to log in
        </Link>
      }
    >
      {forgot.isSuccess ? (
        <div className="grid gap-4">
          <Alert tone="success" title="Check your email">
            {forgot.data.message} The link expires in 1 hour.
          </Alert>
          {import.meta.env.DEV && (
            <Alert tone="info" title="Local development">
              Emails are captured by Mailpit at{' '}
              <a className="font-medium text-primary-text underline" href="http://localhost:8025" target="_blank" rel="noreferrer">
                http://localhost:8025
              </a>
            </Alert>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
          <FormField label="Email" type="email" autoComplete="email" autoFocus error={errors.email?.message} {...form.register('email')} />
          <Button type="submit" size="lg" loading={isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
