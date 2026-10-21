import { execSync } from 'node:child_process';
import path from 'node:path';

/** Applies all migrations to the dedicated test database before any test file runs. */
export default function setup() {
  const root = path.resolve(__dirname, '../../..');
  execSync('npx prisma migrate deploy', {
    cwd: root,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
}
