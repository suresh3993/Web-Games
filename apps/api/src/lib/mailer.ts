import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Messages captured when MAIL_TRANSPORT=memory (automated tests). */
export const outbox: MailMessage[] = [];

const transporter: Transporter | null =
  env.mail.transport === 'smtp'
    ? nodemailer.createTransport({
        host: env.mail.host,
        port: env.mail.port,
        secure: env.mail.secure,
        auth: env.mail.user ? { user: env.mail.user, pass: env.mail.password } : undefined,
      })
    : null;

const pending = new Set<Promise<void>>();

async function deliver(message: MailMessage): Promise<void> {
  if (!transporter) {
    outbox.push(message);
    return;
  }
  await transporter.sendMail({ from: env.mail.from, ...message });
}

/**
 * Sends in the background so that response timing does not reveal whether an
 * email was sent (prevents account enumeration via timing). Failures are logged.
 */
export function sendMailInBackground(message: MailMessage): void {
  const job = deliver(message)
    .catch((err: unknown) => logger.error({ err, subject: message.subject }, 'email delivery failed'))
    .finally(() => pending.delete(job));
  pending.add(job);
}

/** Waits for in-flight emails (tests and graceful shutdown). */
export async function flushMail(): Promise<void> {
  await Promise.all([...pending]);
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
