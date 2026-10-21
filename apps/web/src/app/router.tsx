import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/components/layout/app-layout';
import { HomePage } from '@/features/games/home-page';
import { NotFoundPage } from '@/routes/not-found-page';
import { RouteErrorPage } from '@/routes/route-error-page';

/**
 * Home is bundled eagerly (first paint); every other page is a lazy chunk.
 * Game engines will be split per game via @playverse/game-runtime's registry.
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
