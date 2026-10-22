# Accessibility

Target: WCAG 2.2 level AA for the platform UI (pages, forms, navigation, admin area).

## Automated audit

`tests/e2e/a11y.spec.ts` runs [axe-core](https://github.com/dequelabs/axe-core) (via `@axe-core/playwright`) with the
WCAG 2.0, 2.1 and 2.2 A/AA rule sets. It covers every page in both the dark and the light theme:

- signed out: all public pages, a game's details page, the player's sign-in gate and the 404 page;
- signed in as staff: every account page, every admin page and the player's start screen.

It is part of `npm run test:e2e` (desktop project). The signed-in half needs `E2E_STAFF_EMAIL` / `E2E_STAFF_PASSWORD`, as
in the other admin tests.

**Status (2026-10-22, production build):** no violations on any page in either theme.

The first run found three issues, all fixed:

| Issue | Fix |
|---|---|
| Destructive buttons in the dark theme had 3.67:1 contrast (white on `#f43f5e`; AA needs 4.5:1) | Dark text on that colour: 5.3:1 (`--destructive-foreground` in `globals.css`) |
| The 404 page had no top-level heading | Its heading is now an `<h1>` (`EmptyState headingLevel`) |
| The player's sign-in and verification gates had no top-level heading | Same fix |

## Built in

- A "Skip to content" link, and focus moves to the main region after every navigation, so screen readers announce the
  new page.
- Animations honour the operating system's reduced-motion setting.
- Icon-only buttons have accessible names, and toggles expose their state (`aria-pressed` on favourites).
- Charts in the admin area have a screen-reader table next to the SVG.
- Every game is playable with the keyboard; the runtime contract test drives each one with keyboard input. The player's
  pause, sound, fullscreen and end-round controls form a labelled toolbar.

## Not covered yet

Automated rules catch only part of real-world problems. These still need a person:

- a screen-reader pass (NVDA on Windows, VoiceOver on iOS and macOS) through the main flows;
- a keyboard-only walkthrough of every flow, including dialogs and the admin forms;
- 200% zoom and 320 px reflow checks (the mobile E2E test checks horizontal overflow on the catalog only);
- the games themselves: canvas content is invisible to axe, so contrast inside games and screen-reader support for game
  state are not audited.
