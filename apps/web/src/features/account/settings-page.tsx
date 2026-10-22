import { zodResolver } from '@hookform/resolvers/zod';
import { Download, KeyRound, LogOut, Settings, ShieldAlert, SlidersHorizontal, Trash2, UserRound } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { CurrentUser } from '@suresh/shared-types';
import { changePasswordSchema, deleteAccountSchema, type ChangePasswordInput, type DeleteAccountInput } from '@suresh/validation';
import { PageShell, RequireAccount } from '@/components/page-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Checkbox, Field, Select } from '@/components/ui/fields';
import { FormField } from '@/components/ui/form-field';
import { applyServerError } from '@/features/auth/auth-layout';
import { useLogout } from '@/features/auth/api';
import { isApiError } from '@/lib/api';
import { useThemeStore, type ThemePreference } from '@/stores/theme-store';
import { downloadDataExport, useChangePassword, useDeleteAccount } from './api';

function Panel({ icon: Icon, title, description, children }: { icon: typeof Settings; title: string; description?: string; children: ReactNode }) {
  const id = `settings-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="glass grid gap-4 rounded-xl border border-border p-6">
      <div>
        <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
          <Icon className="size-5 text-primary-text" aria-hidden="true" /> {title}
        </h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ChangePasswordForm() {
  const change = useChangePassword();
  const form = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: '', newPassword: '' } });
  const { errors } = form.formState;
  const submit = form.handleSubmit((values) =>
    change.mutateAsync(values).then(
      () => {
        toast.success('Password changed. Other devices were signed out.');
        form.reset();
      },
      (err) => applyServerError(err, form.setError, ['currentPassword', 'newPassword']),
    ),
  );
  return (
    <form onSubmit={submit} noValidate className="grid max-w-md gap-4">
      <FormField label="Current password" type="password" autoComplete="current-password" error={errors.currentPassword?.message} {...form.register('currentPassword')} />
      <FormField
        label="New password"
        type="password"
        autoComplete="new-password"
        error={errors.newPassword?.message}
        hint="At least 10 characters. A short phrase works well."
        {...form.register('newPassword')}
      />
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      <div>
        <Button type="submit" loading={change.isPending}>
          Change password
        </Button>
      </div>
    </form>
  );
}

const SOUND_KEY = 'pv:sound';
function readSound() {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

function Preferences() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [sound, setSound] = useState(readSound);
  return (
    <div className="grid max-w-md gap-4">
      <Field label="Theme">
        {({ id }) => (
          <Select id={id} value={theme} onChange={(e) => setTheme(e.target.value as ThemePreference)}>
            <option value="system">Match my device</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </Select>
        )}
      </Field>
      <Checkbox
        label="Game sound on by default"
        checked={sound}
        onChange={(e) => {
          setSound(e.target.checked);
          try {
            localStorage.setItem(SOUND_KEY, e.target.checked ? 'on' : 'off');
          } catch {
            // Storage unavailable: the setting applies to this page only.
          }
        }}
      />
      <p className="text-xs text-muted-foreground">
        Animations follow your device’s “reduce motion” setting, in the site and in games. These preferences are stored in this browser only.
      </p>
    </div>
  );
}

function DeleteAccount({ user }: { user: CurrentUser }) {
  const [open, setOpen] = useState(false);
  const remove = useDeleteAccount();
  const navigate = useNavigate();
  const form = useForm<DeleteAccountInput>({ resolver: zodResolver(deleteAccountSchema), defaultValues: { password: '' } });
  const submit = form.handleSubmit((values) =>
    remove.mutateAsync(values).then(
      () => {
        setOpen(false);
        toast.success('Your account has been deleted.');
        navigate('/', { replace: true });
      },
      (err) => applyServerError(err, form.setError, ['password']),
    ),
  );
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Deleting your account removes your profile, scores, stats, favourites, achievements and XP permanently. Reports you filed are kept for moderation but no longer
        linked to you. This cannot be undone.
      </p>
      <div>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 aria-hidden="true" /> Delete my account
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) form.reset();
        }}
      >
        <DialogContent>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This permanently deletes the account for <strong>{user.email}</strong> and its data. Enter your password to confirm.
          </DialogDescription>
          <form onSubmit={submit} noValidate className="grid gap-4">
            <FormField label="Password" type="password" autoComplete="current-password" error={form.formState.errors.password?.message} {...form.register('password')} />
            {form.formState.errors.root?.server && <Alert tone="error">{form.formState.errors.root.server.message}</Alert>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Keep my account
              </Button>
              <Button type="submit" variant="destructive" loading={remove.isPending}>
                Delete permanently
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SettingsContent({ user }: { user: CurrentUser }) {
  const logoutAll = useLogout(true);
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const exportData = async () => {
    setExporting(true);
    try {
      await downloadDataExport();
      toast.success('Your data export has been downloaded.');
    } catch (err) {
      toast.error(isApiError(err) ? err.message : 'The export failed.');
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="grid max-w-3xl gap-6">
      <Panel icon={UserRound} title="Account" description="How you appear and sign in.">
        <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Email</dt>
          <dd>
            {user.email} {user.emailVerified ? '(verified)' : '(not verified)'}
          </dd>
          <dt className="text-muted-foreground">Display name</dt>
          <dd>{user.displayName}</dd>
        </dl>
        <div>
          <Button asChild variant="outline">
            <Link to="/profile/edit">Edit profile and avatar</Link>
          </Button>
        </div>
      </Panel>

      <Panel icon={KeyRound} title="Password" description="Changing your password signs you out on every other device.">
        <ChangePasswordForm />
      </Panel>

      <Panel icon={LogOut} title="Sessions" description="Signed in somewhere you don’t recognise? Sign out everywhere, then change your password.">
        <div>
          <Button
            variant="outline"
            loading={logoutAll.isPending}
            onClick={() =>
              logoutAll.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Signed out on all devices.');
                  navigate('/login');
                },
              })
            }
          >
            <LogOut aria-hidden="true" /> Log out on all devices
          </Button>
        </div>
      </Panel>

      <Panel icon={SlidersHorizontal} title="Preferences">
        <Preferences />
      </Panel>

      <Panel icon={Download} title="Your data" description="Download everything we store about you as a JSON file (profile, rounds, scores, achievements, notifications and security log).">
        <div>
          <Button variant="outline" onClick={() => void exportData()} loading={exporting}>
            <Download aria-hidden="true" /> Download my data
          </Button>
        </div>
      </Panel>

      <Panel icon={ShieldAlert} title="Delete account">
        <DeleteAccount user={user} />
      </Panel>
    </div>
  );
}

export function SettingsPage() {
  return (
    <PageShell icon={Settings} title="Settings" description="Security, preferences and your data.">
      <RequireAccount>{(user) => <SettingsContent user={user} />}</RequireAccount>
    </PageShell>
  );
}
