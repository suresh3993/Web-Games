/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `vite preview` serves the production build with the same Content-Security-Policy as Nginx,
// so CSP problems show up locally (and in E2E runs against the build), not first in production.
const nginxConf = readFileSync(new URL('../../docker/nginx/nginx.conf', import.meta.url), 'utf8');
const productionCsp = nginxConf.match(/Content-Security-Policy "([^"]+)"/)?.[1];
if (!productionCsp) throw new Error('Could not read the Content-Security-Policy from docker/nginx/nginx.conf');

/**
 * Browser settings: VITE_* variables from the environment (CI, Docker build args) or, failing that,
 * from the monorepo's root .env. Only VITE_* lines are read. Loading the whole file would let its
 * NODE_ENV=development (meant for the API) turn `vite build` into a development build of React.
 */
function browserEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const file = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
    for (const [, key, value] of file.matchAll(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/gm)) {
      if (key) env[key] = (value ?? '').replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // No .env (CI, Docker): the environment alone decides.
  }
  for (const [key, value] of Object.entries(process.env)) if (key.startsWith('VITE_') && value !== undefined) env[key] = value;
  return env;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: false,
  define: Object.fromEntries(Object.entries(browserEnv()).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])),
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in development: the browser talks to Vite, which forwards /api to Express.
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000', changeOrigin: false },
    },
  },
  // The /api proxy is inherited from `server.proxy`.
  preview: { port: 4173, headers: { 'Content-Security-Policy': productionCsp } },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Every game is its own lazy chunk; name it after the game instead of "index".
        chunkFileNames(chunk) {
          const game = chunk.facadeModuleId?.match(/[\/]games[\/]([a-z0-9-]+)[\/]index\.ts$/)?.[1];
          return game ? `assets/game-${game}-[hash].js` : 'assets/[name]-[hash].js';
        },
        // Long-lived vendor chunks for code every page needs: app deploys don't invalidate cached
        // framework code. Partly used libraries (framer-motion, Radix) are deliberately not grouped:
        // a group is downloaded whole, so pages would load every Radix primitive and all of Motion.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler|react-router)\//.test(id)) return 'react';
          if (id.includes('@tanstack')) return 'query';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
