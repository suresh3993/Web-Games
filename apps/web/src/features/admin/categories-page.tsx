import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { CATEGORY_ICONS, type AdminCategory } from '@suresh/shared-types';
import { categoryInputSchema, type CategoryInput, z } from '@suresh/validation';
import { CategoryIcon } from '@/components/game/category-icon';
import { QueryError } from '@/components/query-error';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/fields';
import { FormField } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/api';
import { applyServerError } from '@/features/auth/auth-layout';
import { isApiError } from '@/lib/api';
import { AdminHeader, isAdmin, TableShell, tdClass, thClass } from './admin-layout';
import { useAdminCategories, useDeleteCategory, useSaveCategory } from './api';

type CategoryForm = z.input<typeof categoryInputSchema>;

function CategoryDialog({ category, onClose }: { category: AdminCategory | 'new'; onClose: () => void }) {
  const save = useSaveCategory();
  const editing = category !== 'new';
  const form = useForm<CategoryForm, unknown, CategoryInput>({
    resolver: zodResolver(categoryInputSchema),
    defaultValues: editing
      ? { slug: category.slug, name: category.name, description: category.description, icon: category.icon as CategoryForm['icon'], accentColor: category.accentColor, sortOrder: category.sortOrder }
      : { slug: '', name: '', description: '', icon: 'Sparkles', accentColor: '#7c5cff', sortOrder: 100 },
  });
  const { errors } = form.formState;
  const icon = form.watch('icon');
  const submit = form.handleSubmit((values) => {
    const { slug, ...rest } = values;
    return save.mutateAsync({ id: editing ? category.id : undefined, input: editing ? rest : values }).then(
      () => {
        toast.success(editing ? 'Category saved.' : 'Category created.');
        onClose();
      },
      (err) => applyServerError(err, form.setError, editing ? ['name', 'description', 'icon', 'accentColor'] : ['slug', 'name', 'description', 'icon', 'accentColor']),
    );
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{editing ? `Edit ${category.name}` : 'New category'}</DialogTitle>
        <DialogDescription>Categories group games on the Explore and Categories pages.</DialogDescription>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <FormField label="Slug" disabled={editing} hint={editing ? 'The slug is part of URLs and can’t change.' : 'e.g. rhythm'} error={errors.slug?.message} {...form.register('slug')} />
          <FormField label="Name" error={errors.name?.message} {...form.register('name')} />
          <Field label="Description" error={errors.description?.message}>
            {({ id, describedBy, invalid }) => <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} rows={2} {...form.register('description')} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Icon">
              {({ id }) => (
                <div className="flex items-center gap-2">
                  <CategoryIcon name={icon} className="size-5 shrink-0" />
                  <Select id={id} {...form.register('icon')}>
                    {CATEGORY_ICONS.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </Field>
            <FormField label="Colour" type="color" className="[&_input]:h-11 [&_input]:p-1" error={errors.accentColor?.message} {...form.register('accentColor')} />
            <FormField label="Order" type="number" min={0} max={1000} error={errors.sortOrder?.message} {...form.register('sortOrder', { valueAsNumber: true })} />
          </div>
          {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AdminCategoriesPage() {
  const { data: me } = useCurrentUser();
  const { data, isPending, isError, error, refetch } = useAdminCategories();
  const remove = useDeleteCategory();
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);
  const canEdit = isAdmin(me);
  return (
    <>
      <AdminHeader
        title="Categories"
        description="A game has one main category and can be listed in others."
        actions={
          canEdit && (
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden="true" /> New category
            </Button>
          )
        }
      />
      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <TableShell label="Categories">
          <thead>
            <tr>
              <th scope="col" className={thClass}>Category</th>
              <th scope="col" className={thClass}>Games</th>
              <th scope="col" className={thClass}>Published</th>
              <th scope="col" className={thClass}>Order</th>
              <th scope="col" className={thClass}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className={tdClass}>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${c.accentColor}33`, color: c.accentColor }}>
                      <CategoryIcon name={c.icon} className="size-4" />
                    </span>
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.slug}</p>
                    </div>
                  </div>
                </td>
                <td className={`${tdClass} tabular-nums`}>{c.gameCount}</td>
                <td className={`${tdClass} tabular-nums`}>{c.publishedCount}</td>
                <td className={`${tdClass} tabular-nums`}>{c.sortOrder}</td>
                <td className={`${tdClass} text-right`}>
                  {canEdit && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                        <Pencil aria-hidden="true" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      {editing && <CategoryDialog category={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="Only categories that are not any game’s main category (and not used by challenges) can be deleted."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const c = deleting!;
          setDeleting(null);
          remove.mutate(c.id, { onSuccess: () => toast.success('Category deleted.'), onError: (err) => toast.error(isApiError(err) ? err.message : 'Delete failed.') });
        }}
      />
    </>
  );
}
