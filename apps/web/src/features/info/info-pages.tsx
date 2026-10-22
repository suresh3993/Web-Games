import { FileText, LifeBuoy, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PageShell } from '@/components/page-shell';

/** Operator contact, configured at build time (VITE_SUPPORT_EMAIL). */
const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || null;
const UPDATED = '21 October 2026';

function Contact() {
  return SUPPORT_EMAIL ? (
    <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary-text underline">
      {SUPPORT_EMAIL}
    </a>
  ) : (
    <>the operator of this site</>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return (
    <article className="glass grid max-w-3xl gap-4 rounded-xl border border-border p-6 text-sm leading-relaxed text-muted-foreground sm:p-8 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">
      {children}
    </article>
  );
}

const templateNote = (
  <p className="text-xs">
    Last updated {UPDATED}. This text ships with the SURESH software and describes how it works. The operator of this site should review it for their
    jurisdiction before relying on it.
  </p>
);

export function PrivacyPage() {
  return (
    <PageShell icon={ShieldCheck} title="Privacy policy" description="What we collect, why, and how you stay in control.">
      <Prose>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account:</strong> your email address, display name and optional avatar. Your password is stored only as an Argon2id hash, never in readable form.
            Avatars are re-encoded on our server, which removes photo metadata such as location.
          </li>
          <li>
            <strong>Play:</strong> the rounds you play (game, start and end time, active time), scores and game statistics, personal bests, favourites,
            achievements, daily challenge progress, XP, and the notifications we send you. Problem reports you file are stored with your account.
          </li>
          <li>
            <strong>Security:</strong> your IP address and browser user agent for each signed-in session, and a security log of events such as sign-ins,
            password changes and account changes.
          </li>
        </ul>

        <h2>Why</h2>
        <p>
          To run your account and the games, keep leaderboards fair (for example, detecting impossible scores), protect accounts from abuse, and send you the
          emails the service needs: verification, password reset, and notices about changes to your account. We do not send marketing email.
        </p>

        <h2>What others can see</h2>
        <p>Leaderboards show your display name, avatar, level, XP and best scores. Your email address is never shown to other players.</p>

        <h2>Cookies and local storage</h2>
        <ul>
          <li>
            <strong>pv_session</strong> keeps you signed in (HttpOnly; expires after 7 days without activity, 30 days at most).
          </li>
          <li>
            <strong>pv_csrf</strong> protects forms against cross-site request forgery.
          </li>
          <li>
            Your theme (<strong>pv-theme</strong>) and game sound setting (<strong>pv:sound</strong>) are kept in your browser’s local storage.
          </li>
        </ul>
        <p>All of these are strictly necessary for the site to work. There are no advertising, analytics or tracking cookies.</p>

        <h2>Sharing</h2>
        <p>We do not sell personal data. It is processed only by the infrastructure that runs this site (hosting, database and email delivery).</p>

        <h2>How long we keep it</h2>
        <p>
          Account and play data are kept until you delete your account. Sessions end as described above, and only your 200 most recent notifications are kept.
          Problem reports and the security log are kept for moderation and security, but when you delete your account they are no longer linked to you.
        </p>

        <h2>Your choices and rights</h2>
        <ul>
          <li>
            Download everything we hold about you: <Link to="/settings" className="underline">Settings → Your data</Link>.
          </li>
          <li>
            Correct your details: <Link to="/profile/edit" className="underline">Edit profile</Link>.
          </li>
          <li>
            Delete your account and its data: <Link to="/settings" className="underline">Settings → Delete account</Link>.
          </li>
        </ul>
        <p>
          Questions or requests: contact <Contact />. If you are below the age at which you can consent to data processing where you live, ask a parent or guardian
          before creating an account.
        </p>
        {templateNote}
      </Prose>
    </PageShell>
  );
}

export function TermsPage() {
  return (
    <PageShell icon={FileText} title="Terms of service" description="The rules for using SURESH.">
      <Prose>
        <h2>Your account</h2>
        <p>
          Use your own email address and keep your password private. You are responsible for activity on your account. One account per person, please.
        </p>
        <h2>Fair play</h2>
        <ul>
          <li>No cheating: no modified clients, automated play, scripted score submissions or exploiting bugs to gain scores, XP or achievements.</li>
          <li>Scores that fail our checks are hidden from leaderboards and earn no XP. Repeated abuse can lead to suspension.</li>
          <li>Report bugs and problems with the “Report a problem” button on any game instead of exploiting them.</li>
        </ul>
        <h2>Your content</h2>
        <p>Display names and avatars must not be offensive, impersonate anyone or infringe anyone’s rights. Moderators may remove them or suspend accounts.</p>
        <h2>Our games</h2>
        <p>
          The games on SURESH are original works made for this site. You may play them here for personal, non-commercial use. There are no purchases,
          real-money prizes or gambling of any kind.
        </p>
        <h2>Availability</h2>
        <p>
          We work to keep the service running and your data safe, but the service is provided “as is”, without guarantees of availability, and games, scores and
          features may change.
        </p>
        <h2>Ending your account</h2>
        <p>
          You can delete your account at any time in <Link to="/settings" className="underline">Settings</Link>. We may suspend accounts that break these terms; if
          you think a suspension is a mistake, contact <Contact />.
        </p>
        <h2>Changes</h2>
        <p>If these terms change, the date below changes too. Continuing to use the service means you accept the updated terms.</p>
        {templateNote}
      </Prose>
    </PageShell>
  );
}

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: 'Why do I need an account to play?',
    a: 'Every round is linked to your account so we can save your scores, XP, achievements and challenge progress, and keep leaderboards fair.',
  },
  {
    q: 'My verification email never arrived.',
    a: (
      <>
        Check your spam folder, then log in and use “Resend email” in the banner at the top of the site. Links expire after 24 hours.
      </>
    ),
  },
  {
    q: 'How do I earn XP and level up?',
    a: 'Finish a round: 10 XP plus 4 XP per active minute (up to 30 per round) for rounds of at least 10 seconds, up to 300 XP per game per day. Achievements and daily challenges give bonus XP. Level n needs 100 × n × (n − 1) / 2 XP in total.',
  },
  {
    q: 'Why isn’t my score on the leaderboard?',
    a: 'Scores that look impossible (above the game’s maximum, longer than the round lasted, or achieved instantly) are kept for review but hidden from leaderboards. Leaderboards also refresh every 30 seconds.',
  },
  {
    q: 'Why does a round say it expired?',
    a: 'Rounds are closed if the game stops reporting for 15 minutes (for example, the tab was closed) or after 4 hours. Start a new round to keep playing.',
  },
  {
    q: 'Can I play on my phone?',
    a: 'Yes. Most games support touch controls; each game page lists the devices it supports. Some games play best in landscape.',
  },
  {
    q: 'How do I delete my account or download my data?',
    a: (
      <>
        Both are in <Link to="/settings" className="underline">Settings</Link>.
      </>
    ),
  },
];

export function HelpPage() {
  return (
    <PageShell icon={LifeBuoy} title="Help and support" description="Answers to common questions, and how to reach us.">
      <div className="grid max-w-3xl gap-6">
        <section aria-labelledby="faq" className="grid gap-2">
          <h2 id="faq" className="text-xl font-semibold">
            Frequently asked questions
          </h2>
          {FAQ.map((item) => (
            <details key={item.q} className="glass group rounded-xl border border-border p-4 open:border-primary/40">
              <summary className="cursor-pointer font-medium marker:text-primary-text">{item.q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </section>
        <section aria-labelledby="contact" className="glass grid gap-2 rounded-xl border border-border p-6 text-sm text-muted-foreground">
          <h2 id="contact" className="text-xl font-semibold text-foreground">
            Still stuck?
          </h2>
          <p>
            Found a bug in a game? Use <strong className="text-foreground">Report a problem</strong> on the game’s page: it goes straight to our moderators, and
            you’ll get a notification when it’s handled.
          </p>
          <p>
            For account questions, contact <Contact />.
          </p>
          <p>
            Read our <Link to="/privacy" className="underline">privacy policy</Link> and <Link to="/terms" className="underline">terms of service</Link>.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
