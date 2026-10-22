import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { loginSchema } from '@suresh/validation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { safeRedirect } from '@/lib/utils';
import { useCurrentUser, useLogin } from './api';
import { applyServerError, AuthLayout } from './auth-layout';

export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeRedirect(params.get('next'));
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const login = useLogin();
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const { errors, isSubmitting } = form.formState;

  if (user && !login.isSuccess) return <Navigate to={next} replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const me = await login.mutateAsync(values);
      toast.success(`Welcome back, ${me.displayName}!`);
      navigate(next, { replace: true });
    } catch (err) {
      form.resetField('password');
      applyServerError(err, form.setError, ['email', 'password']);
    }
  });

  return (
    <AuthLayout
      title="Welcome back"
      description="Log in to play, save scores and track your progress."
      footer={
        <>
          New to SURESH?{' '}
          <Link to="/register" className="font-medium text-primary-text hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
        <FormField label="Email" type="email" autoComplete="email" autoFocus error={errors.email?.message} {...form.register('email')} />
        <div className="grid gap-2">
          <FormField label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...form.register('password')} />
          <Link to="/forgot-password" className="justify-self-end text-xs font-medium text-primary-text hover:underline">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" size="lg" loading={isSubmitting}>
          Log in
        </Button>
      </form>
    </AuthLayout>
  );
}
