import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/components/layout/app-layout';
import { HomePage } from '@/features/games/home-page';
import { NotFoundPage } from '@/routes/not-found-page';
import { RouteErrorPage } from '@/routes/route-error-page';

/**
 * Home is bundled eagerly (first paint); every other page is a lazy chunk.
 * Each game is its own chunk too (via @playverse/game-runtime's registry), loaded
 * only by the player page when that game is launched.
 */
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'explore', lazy: () => import('@/features/games/explore-page').then((m) => ({ Component: m.ExplorePage })) },
          { path: 'categories', lazy: () => import('@/features/games/categories-page').then((m) => ({ Component: m.CategoriesPage })) },
          { path: 'games/:slug', lazy: () => import('@/features/games/game-details-page').then((m) => ({ Component: m.GameDetailsPage })) },
          { path: 'games/:slug/play', lazy: () => import('@/features/play/game-player-page').then((m) => ({ Component: m.GamePlayerPage })) },
          { path: 'favorites', lazy: () => import('@/features/library/library-pages').then((m) => ({ Component: m.FavoritesPage })) },
          { path: 'recently-played', lazy: () => import('@/features/library/library-pages').then((m) => ({ Component: m.RecentlyPlayedPage })) },
          { path: 'leaderboards', lazy: () => import('@/features/library/library-pages').then((m) => ({ Component: m.LeaderboardsPage })) },
          { path: 'login', lazy: () => import('@/features/auth/login-page').then((m) => ({ Component: m.LoginPage })) },
          { path: 'register', lazy: () => import('@/features/auth/register-page').then((m) => ({ Component: m.RegisterPage })) },
          { path: 'forgot-password', lazy: () => import('@/features/auth/forgot-password-page').then((m) => ({ Component: m.ForgotPasswordPage })) },
          { path: 'reset-password', lazy: () => import('@/features/auth/reset-password-page').then((m) => ({ Component: m.ResetPasswordPage })) },
          { path: 'verify-email', lazy: () => import('@/features/auth/verify-email-page').then((m) => ({ Component: m.VerifyEmailPage })) },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
