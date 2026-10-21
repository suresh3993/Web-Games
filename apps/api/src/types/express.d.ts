import type { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      /** Present when the request carries a valid session cookie. */
      auth?: {
        user: User;
        sessionId: string;
      };
    }
  }
}

export {};
