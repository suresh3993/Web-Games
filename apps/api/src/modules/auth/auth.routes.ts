import { Router } from 'express';
import type { ApiSuccess, CsrfResponse, CurrentUser, MessageResponse } from '@playverse/shared-types';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, verifyEmailSchema } from '@playverse/validation';
import { requireAuth } from '../../middleware/auth';
import { issueCsrfToken } from '../../middleware/csrf';
import type { RateLimiters } from '../../middleware/rate-limit';
import { audit } from '../audit/audit';
import * as auth from './auth.service';
import { clearSessionCookie, revokeAllSessions, revokeSession, setSessionCookie } from './sessions';

const message = (text: string): ApiSuccess<MessageResponse> => ({ data: { message: text } });

export function authRouter(limits: RateLimiters): Router {
  const router = Router();

  router.get('/csrf', (req, res) => {
    const body: ApiSuccess<CsrfResponse> = { data: { csrfToken: issueCsrfToken(req, res) } };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.post('/register', limits.register, async (req, res) => {
    await auth.register(registerSchema.parse(req.body), req);
    res
      .status(202)
      .json(message('Check your inbox: we sent a link to verify your email address. You can log in once your account is ready.'));
  });

  router.post('/login', limits.loginIp, limits.loginAccount, async (req, res) => {
    const input = loginSchema.parse(req.body);
    // Rotate: discard any existing session on this browser before issuing a new one.
    if (req.auth) await revokeSession(req.auth.sessionId);
    const { user, token, session } = await auth.login(input, req);
    setSessionCookie(res, token, session.expiresAt);
    const body: ApiSuccess<CurrentUser> = { data: auth.toCurrentUser(user) };
    res.json(body);
  });

  router.post('/logout', async (req, res) => {
    if (req.auth) {
      await revokeSession(req.auth.sessionId);
      await audit(req, { action: 'auth.logout', actorId: req.auth.user.id, targetType: 'session', targetId: req.auth.sessionId });
    }
    clearSessionCookie(res);
    res.status(204).end();
  });

  router.post('/logout-all', requireAuth, async (req, res) => {
    const { count } = await revokeAllSessions(req.auth!.user.id);
    await audit(req, { action: 'auth.logout_all', actorId: req.auth!.user.id, metadata: { revoked: count } });
    clearSessionCookie(res);
    res.status(204).end();
  });

  router.post('/forgot-password', limits.emailActions, async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    await auth.forgotPassword(email, req);
    res.status(202).json(message('If an account exists for that email, we sent a link to reset the password.'));
  });

  router.post('/reset-password', limits.tokenSubmit, async (req, res) => {
    await auth.resetPassword(resetPasswordSchema.parse(req.body), req);
    clearSessionCookie(res);
    res.json(message('Your password has been changed. Please log in with your new password.'));
  });

  router.post('/verify-email', limits.tokenSubmit, async (req, res) => {
    const { token } = verifyEmailSchema.parse(req.body);
    await auth.verifyEmail(token, req);
    res.json(message('Your email address is verified.'));
  });

  router.post('/resend-verification', requireAuth, limits.emailActions, async (req, res) => {
    await auth.resendVerification(req.auth!.user, req);
    res.status(202).json(message('We sent a new verification link to your email address.'));
  });

  router.get('/me', requireAuth, (req, res) => {
    const body: ApiSuccess<CurrentUser> = { data: auth.toCurrentUser(req.auth!.user) };
    res.set('Cache-Control', 'no-store').json(body);
  });

  /**
   * Session probe for the web app: 200 with the user, or `null` for guests. Unlike /me it
   * never answers 401, so a guest page view doesn't log a failed request in the console.
   */
  router.get('/session', (req, res) => {
    const body: ApiSuccess<CurrentUser | null> = { data: req.auth ? auth.toCurrentUser(req.auth.user) : null };
    res.set('Cache-Control', 'no-store').json(body);
  });

  return router;
}
