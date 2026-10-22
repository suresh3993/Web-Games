import type { QueryClient } from '@tanstack/react-query';
import { createBrowserRouter, type LoaderFunctionArgs } from 'react-router';
import { AppLayout } from '@/components/layout/app-layout';
import { categoriesQuery, exploreQuery, gameQuery, gamesQuery } from '@/features/games/api';
import { HomePage } from '@/features/games/home-page';
import { NotFoundPage } from '@/routes/not-found-page';
import { RouteErrorPage } from '@/routes/route-error-page';

/**
 * Home is bundled eagerly (first paint); every other page is a lazy chunk.
 * Each game is its own chunk too (via @playverse/game-runtime's registry), loaded
 * only by the player page when that game is launched.
 *
 * Loaders only *start* the main data requests, in parallel with the page's code, and return at
 * once; the pages read the results from the query cache through their usual hooks.
 */
export function createAppRouter(queryClient: QueryClient) {
  const prefetchExplore = ({ request }: LoaderFunctionArgs) => {
    void queryClient.prefetchQuery(gamesQuery(exploreQuery(new URL(request.url).searchParams)));
    void queryClient.prefetchQuery(categoriesQuery);
    return null;
  };
  const prefetchGame = ({ params }: LoaderFunctionArgs) => {
    if (params.slug) void queryClient.prefetchQuery(gameQuery(params.slug));
    return null;
  };

  return createBrowserRouter([
    {
      element: <AppLayout />,
      errorElement: <RouteErrorPage />,
      children: [
        {
          errorElement: <RouteErrorPage />,
          children: [
            { index: true, element: <HomePage /> },
            { path: 'explore', loader: prefetchExplore, lazy: () => import('@/features/games/explore-page').then((m) => ({ Component: m.ExplorePage })) },
            { path: 'categories', lazy: () => import('@/features/games/categories-page').then((m) => ({ Component: m.CategoriesPage })) },
            { path: 'games/:slug', loader: prefetchGame, lazy: () => import('@/features/games/game-details-page').then((m) => ({ Component: m.GameDetailsPage })) },
            { path: 'games/:slug/play', loader: prefetchGame, lazy: () => import('@/features/play/game-player-page').then((m) => ({ Component: m.GamePlayerPage })) },
            { path: 'favorites', lazy: () => import('@/features/library/library-pages').then((m) => ({ Component: m.FavoritesPage })) },
            { path: 'recently-played', lazy: () => import('@/features/library/library-pages').then((m) => ({ Component: m.RecentlyPlayedPage })) },
            { path: 'leaderboards', lazy: () => import('@/features/library/library-pages').then((m) => ({ Component: m.LeaderboardsPage })) },
            { path: 'profile', lazy: () => import('@/features/account/profile-pages').then((m) => ({ Component: m.ProfilePage })) },
            { path: 'profile/edit', lazy: () => import('@/features/account/profile-pages').then((m) => ({ Component: m.EditProfilePage })) },
            { path: 'achievements', lazy: () => import('@/features/account/progress-pages').then((m) => ({ Component: m.AchievementsPage })) },
            { path: 'challenges', lazy: () => import('@/features/account/progress-pages').then((m) => ({ Component: m.ChallengesPage })) },
            { path: 'notifications', lazy: () => import('@/features/account/notifications').then((m) => ({ Component: m.NotificationsPage })) },
            { path: 'settings', lazy: () => import('@/features/account/settings-page').then((m) => ({ Component: m.SettingsPage })) },
            { path: 'privacy', lazy: () => import('@/features/info/info-pages').then((m) => ({ Component: m.PrivacyPage })) },
            { path: 'terms', lazy: () => import('@/features/info/info-pages').then((m) => ({ Component: m.TermsPage })) },
            { path: 'help', lazy: () => import('@/features/info/info-pages').then((m) => ({ Component: m.HelpPage })) },
            {
              path: 'admin',
              lazy: () => import('@/features/admin/admin-layout').then((m) => ({ Component: m.AdminLayout })),
              children: [
                { index: true, lazy: () => import('@/features/admin/dashboard-page').then((m) => ({ Component: m.AdminDashboardPage })) },
                { path: 'users', lazy: () => import('@/features/admin/users-page').then((m) => ({ Component: m.AdminUsersPage })) },
                { path: 'reports', lazy: () => import('@/features/admin/reports-page').then((m) => ({ Component: m.AdminReportsPage })) },
                { path: 'games', lazy: () => import('@/features/admin/games-pages').then((m) => ({ Component: m.AdminGamesPage })) },
                { path: 'games/new', lazy: () => import('@/features/admin/games-pages').then((m) => ({ Component: m.AdminGameCreatePage })) },
                { path: 'games/:id', lazy: () => import('@/features/admin/games-pages').then((m) => ({ Component: m.AdminGameEditPage })) },
                { path: 'categories', lazy: () => import('@/features/admin/categories-page').then((m) => ({ Component: m.AdminCategoriesPage })) },
                { path: 'achievements', lazy: () => import('@/features/admin/content-pages').then((m) => ({ Component: m.AdminAchievementsPage })) },
                { path: 'challenges', lazy: () => import('@/features/admin/content-pages').then((m) => ({ Component: m.AdminChallengesPage })) },
                { path: 'audit-log', lazy: () => import('@/features/admin/audit-page').then((m) => ({ Component: m.AdminAuditLogPage })) },
              ],
            },
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
}
