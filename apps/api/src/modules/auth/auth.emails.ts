import { env } from '../../config/env';
import { escapeHtml, type MailMessage } from '../../lib/mailer';

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0b1022;font-family:Segoe UI,Arial,sans-serif;color:#e6e9f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#121a36;border-radius:16px;padding:32px">
<tr><td style="font-size:22px;font-weight:700;letter-spacing:2px;color:#a78bfa">SURESH</td></tr>
<tr><td style="padding-top:16px;font-size:20px;font-weight:600">${escapeHtml(title)}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;line-height:1.6;color:#c7cbe0">${bodyHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="padding:16px 0"><a href="${escapeHtml(href)}" style="background:#7c5cff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">${escapeHtml(label)}</a></p>
<p style="font-size:13px;color:#8a90b0">Or paste this link into your browser:<br>${escapeHtml(href)}</p>`;
}

export function verificationEmail(to: string, displayName: string, token: string): MailMessage {
  const link = `${env.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: 'Verify your SURESH email address',
    text: `Hi ${displayName},\n\nConfirm your email address to finish setting up your SURESH account:\n${link}\n\nThis link expires in 24 hours. If you did not create an account, you can ignore this email.`,
    html: layout(
      'Confirm your email',
      `<p>Hi ${escapeHtml(displayName)},</p><p>Confirm your email address to finish setting up your SURESH account.</p>${button(link, 'Verify email')}<p>This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>`,
    ),
  };
}

export function passwordResetEmail(to: string, displayName: string, token: string): MailMessage {
  const link = `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: 'Reset your SURESH password',
    text: `Hi ${displayName},\n\nWe received a request to reset your password. Choose a new one here:\n${link}\n\nThis link expires in 1 hour and can be used once. If you did not request this, you can ignore this email — your password will not change.`,
    html: layout(
      'Reset your password',
      `<p>Hi ${escapeHtml(displayName)},</p><p>We received a request to reset your password.</p>${button(link, 'Choose a new password')}<p>This link expires in 1 hour and can be used once. If you did not request this, you can ignore this email — your password will not change.</p>`,
    ),
  };
}

export function accountExistsEmail(to: string, displayName: string): MailMessage {
  const link = `${env.appUrl}/forgot-password`;
  return {
    to,
    subject: 'Someone tried to register with your email',
    text: `Hi ${displayName},\n\nSomeone (hopefully you) tried to create a SURESH account with this email address, but you already have one.\nIf you forgot your password, reset it here: ${link}\n\nIf this wasn't you, no action is needed.`,
    html: layout(
      'You already have an account',
      `<p>Hi ${escapeHtml(displayName)},</p><p>Someone (hopefully you) tried to create a SURESH account with this email address, but you already have one.</p>${button(link, 'Reset password')}<p>If this wasn't you, no action is needed.</p>`,
    ),
  };
}

export function passwordChangedEmail(to: string, displayName: string): MailMessage {
  return {
    to,
    subject: 'Your SURESH password was changed',
    text: `Hi ${displayName},\n\nYour password was just changed and all other sessions were signed out.\nIf you did not do this, reset your password immediately and contact support.`,
    html: layout(
      'Password changed',
      `<p>Hi ${escapeHtml(displayName)},</p><p>Your password was just changed and all sessions were signed out.</p><p>If you did not do this, reset your password immediately and contact support.</p>`,
    ),
  };
}

export function accountDeletedEmail(to: string, displayName: string): MailMessage {
  return {
    to,
    subject: 'Your SURESH account was deleted',
    text: `Hi ${displayName},\n\nYour SURESH account and its personal data have been deleted, as you requested.\nIf you did not do this, contact support straight away.\n\nThanks for playing.`,
    html: layout(
      'Account deleted',
      `<p>Hi ${escapeHtml(displayName)},</p><p>Your SURESH account and its personal data have been deleted, as you requested.</p><p>If you did not do this, contact support straight away.</p><p>Thanks for playing.</p>`,
    ),
  };
}

export function accountSuspendedEmail(to: string, displayName: string, reason: string): MailMessage {
  return {
    to,
    subject: 'Your SURESH account was suspended',
    text: `Hi ${displayName},\n\nYour SURESH account has been suspended by a moderator.\nReason: ${reason}\n\nIf you think this is a mistake, reply to this email or contact support.`,
    html: layout(
      'Account suspended',
      `<p>Hi ${escapeHtml(displayName)},</p><p>Your SURESH account has been suspended by a moderator.</p><p><strong>Reason:</strong> ${escapeHtml(reason)}</p><p>If you think this is a mistake, reply to this email or contact support.</p>`,
    ),
  };
}
