import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id with OWASP-recommended minimum parameters (m=19 MiB, t=2, p=1).
 * The PHC string embeds the parameters, so they can be raised later without
 * invalidating existing hashes.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string): Promise<string> => hash(password, OPTIONS);

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * A real hash of a random secret, verified when the email is unknown so that
 * "no such user" and "wrong password" take comparable time.
 */
let dummyHash: Promise<string> | null = null;
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(`dummy-${Math.random()}-${Date.now()}`);
  await verifyPassword(await dummyHash, password);
  return false;
}
