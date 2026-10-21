import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// prisma.config.ts disables Prisma's implicit .env loading, so load it explicitly.
config({ quiet: true });

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
