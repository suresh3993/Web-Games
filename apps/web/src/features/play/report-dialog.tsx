import { zodResolver } from '@hookform/resolvers/zod';
import { Flag } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { REPORT_REASONS, type ReportReason } from '@suresh/shared-types';
import { gameReportSchema, type GameReportInput } from '@suresh/validation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { isApiError } from '@/lib/api';
import { useReportGame } from './api';

const REASON_LABELS: Record<ReportReason, string> = {
  BROKEN: 'It’s broken or won’t load',
  INAPPROPRIATE: 'Inappropriate content',
  CHEATING: 'Cheating on the leaderboard',
  OTHER: 'Something else',
};

/** "Report a problem" dialog. `onOpenChange` lets the player pause the game meanwhile. */
export function ReportDialog({
  slug,
  container,
  onOpenChange,
}: {
  slug: string;
  container?: HTMLElement | null;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const report = useReportGame(slug);
  const form = useForm<GameReportInput>({ resolver: zodResolver(gameReportSchema), defaultValues: { reason: 'BROKEN', details: '' } });
  const change = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) form.reset();
  };
  const submit = form.handleSubmit((values) =>
    report.mutate(values, {
      onSuccess: (res) => {
        toast.success(res.message);
        change(false);
      },
      onError: (err) => toast.error(isApiError(err) ? err.message : 'Could not send the report.'),
    }),
  );
  const detailsError = form.formState.errors.details?.message;

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Flag aria-hidden="true" /> Report a problem
        </Button>
      </DialogTrigger>
      <DialogContent container={container}>
        <DialogTitle>Report a problem</DialogTitle>
        <DialogDescription>Tell our moderators what went wrong. Reports are private.</DialogDescription>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">What’s the problem?</legend>
            {REPORT_REASONS.map((reason) => (
              <label key={reason} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" value={reason} {...form.register('reason')} className="accent-[var(--primary)]" />
                {REASON_LABELS[reason]}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor="report-details">Details</Label>
            <textarea
              id="report-details"
              rows={4}
              maxLength={2000}
              aria-invalid={Boolean(detailsError) || undefined}
              aria-describedby={detailsError ? 'report-details-error' : undefined}
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              {...form.register('details')}
            />
            {detailsError && (
              <p id="report-details-error" className="text-xs text-destructive">
                {detailsError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => change(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={report.isPending}>
              Send report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
