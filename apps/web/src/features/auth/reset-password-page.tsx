import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { passwordSchema, z } from '@playverse/validation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { useResetPassword } from './api';
import { applyServerError, AuthLayout } from './auth-layout';
import { useUrlToken } from './use-url-token';

const formSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

export function ResetPasswordPage() {
  const token = useUrlToken();
  const reset = useResetPassword();
  const form = useForm({ resolver: zodResolver(formSchema), defaultValues: { password: '', confirmPassword: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    if (!token) return;
    try {
      await reset.mutateAsync({ token, password });
    } catch (err) {
      applyServerError(err, form.setError, ['password']);
    }
  });

  if (!token) {
    return (
      <AuthLayout title="Reset link missing">
        <div className="grid gap-4">
          <Alert tone="error">This page needs the link from your reset email. Request a new one below.</Alert>
          <Button asChild>
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (reset.isSuccess) {
    return (
      <AuthLayout title="Password updated">
        <div className="grid gap-4">
          <Alert tone="success">{reset.data.message} For your security, all devices have been signed out.</Alert>
          <Button asChild size="lg">
            <Link to="/login">Log in</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" description="Pick something long and unique — a short phrase works well.">
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        {errors.root?.server && (
          <Alert tone="error">
            {errors.root.server.message}{' '}
            <Link to="/forgot-password" className="font-medium text-primary-text underline">
              Request a new link
            </Link>
          </Alert>
        )}
        <FormField label="New password" type="password" autoComplete="new-password" autoFocus error={errors.password?.message} {...form.register('password')} />
        <FormField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...form.register('confirmPassword')}
        />
        <Button type="submit" size="lg" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
