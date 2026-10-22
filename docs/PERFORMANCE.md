# Performance

## How it is measured

`tests/e2e/perf.spec.ts` loads each page on an emulated phone (Pixel 7) with Lighthouse's mobile throttling:

- slow 4G: 1.6 Mbps down, 150 ms round trip;
- a CPU four times slower than the test machine;
- a cold cache for every page.

It records First Contentful Paint, Largest Contentful Paint (LCP) and Cumulative Layout Shift (CLS) from the browser's own
performance APIs. Run it against the production build on an otherwise idle machine:

```powershell
$env:E2E_PERF = "1"; $env:E2E_WEB_MODE = "preview"
npx playwright test tests/e2e/perf.spec.ts --project=desktop-chromium --workers=1
```

The test fails if any page's LCP exceeds 3.0 s or its CLS exceeds 0.1. That 3.0 s budget is a regression guard with
headroom over today's numbers; Google's "good" thresholds are LCP ≤ 2.5 s and CLS ≤ 0.1.

These are lab numbers from localhost, where the API answers in a few milliseconds. Real visitors' numbers (field data)
must be measured on the deployed site, for example with the Chrome UX Report or a `web-vitals` beacon.

## Results (2026-10-22, production build)

"Now": median LCP of three runs, and the worst CLS of the three. "Before": one run under the same conditions, before
the changes below.

| Page | LCP before | LCP now | CLS now |
|---|---|---|---|
| `/` | 2.34 s | 2.08 s | 0.001 |
| `/explore` | 3.11 s | 2.39 s | 0.000 |
| `/categories` | 2.63 s | 2.09 s | 0.039 |
| `/leaderboards` | 2.34 s | 2.09 s | 0.046 |
| `/games/:slug` | 2.94 s | 2.40 s | 0.029 |
| `/games/:slug/play` | 2.70 s | 2.49 s | 0.001 |

All six pages now meet the "good" thresholds. The player page has the least margin.

JavaScript loaded on the home page: 210 KB gzipped (was 216 KB). The React framework chunk is 99 KB (was 159 KB).

## What changed

1. **Production React in local builds.** The web build loaded the monorepo's `.env`, and its `NODE_ENV=development`
   (meant for the API) made `vite build` bundle React's development build. That build is larger and slower, and it shows
   development-only UI. The Vite config now reads only `VITE_*` variables. Docker images were not affected, because
   `.env` is excluded from the build context.
2. **No fade-in on first load.** `<main>` used to start at opacity 0 and fade in. Browsers don't count invisible content
   as painted, so every page's LCP waited for the animation. Pages now appear immediately; the fade remains for in-app
   navigation. The home hero keeps a slide-in, but no longer fades.
3. **Lazy animation features.** Framer Motion's animation code loads after first paint (`LazyMotion`). The manual
   `motion` and `radix` vendor chunks are gone, so pages no longer download every Radix primitive and all of Motion.
4. **Data requests start earlier.** The session request starts as soon as the app's code runs, and route loaders start
   the Explore and game-details requests in parallel with the page's own code. Previously, both waited for the page to
   render first.
5. **Less code on the game pages.** The "Report a problem" form, and the validation library behind it, now loads only on
   the player page, and only after first paint. Before, it also loaded on every game details page. Two numeric limits
   moved to `@suresh/shared-types`, so the game runner no longer pulls in zod.

Tried and reverted: preloading the two web fonts. On a slow connection the fonts competed with the JavaScript for
bandwidth and delayed first paint by about 0.4 s. They use `font-display: swap`, so text never waits for them anyway.

## Next steps if pages get heavier

- Split the player's game controller out of the page chunk; it is only needed once the player presses Play.
- Server-side rendering or prerendering of the public pages would paint content before any JavaScript runs.
