import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256-bit random token, URL-safe. */
export const generateToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** Tokens are stored as SHA-256 hashes so a database leak does not expose live credentials. */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
