import type { ReactNode } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { isApiError } from '@/lib/api';

export function AuthLayout({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12 sm:py-20">
      <Card className="shadow-glow">
        <CardHeader>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}

/**
 * Maps an API error onto the form: field-level validation messages go to their
 * fields, everything else becomes a form-level (root) error.
 */
export function applyServerError<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: readonly Path<T>[]) {
  if (isApiError(error) && error.code === 'VALIDATION_ERROR') {
    let mapped = false;
    for (const field of fields) {
      const message = error.fields[field]?.[0];
      if (message) {
        setError(field, { type: 'server', message });
        mapped = true;
      }
    }
    if (mapped) return;
  }
  setError('root.server' as Path<T>, {
    type: 'server',
    message: isApiError(error) ? error.message : 'Something went wrong. Please try again.',
  });
}
