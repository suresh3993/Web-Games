import { expect } from '@playwright/test';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025';

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

/** Polls Mailpit for the newest email to `to` whose subject matches, and returns a link from it. */
export async function linkFromEmail(to: string, subject: RegExp, path: 'verify-email' | 'reset-password'): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
        const { messages } = (await res.json()) as { messages: MailpitSummary[] };
        const match = messages.find((m) => subject.test(m.Subject));
        if (!match) return undefined;
        const message = (await (await fetch(`${MAILPIT}/api/v1/message/${match.ID}`)).json()) as { Text: string };
        link = message.Text.match(new RegExp(`https?://[^\\s]+/${path}\\?token=[A-Za-z0-9_-]+`))?.[0];
        return link;
      },
      { message: `waiting for "${subject}" email to ${to}`, timeout: 15_000 },
    )
    .toBeTruthy();
  return link!;
}

export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
