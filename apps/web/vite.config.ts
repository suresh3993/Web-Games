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

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
          const game = chunk.facadeModuleId?.match(/[\\/]games[\\/]([a-z0-9-]+)[\\/]index\.ts$/)?.[1];
          return game ? `assets/game-${game}-[hash].js` : 'assets/[name]-[hash].js';
        },
        // Long-lived vendor chunks: app deploys don't invalidate cached framework code.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler|react-router)\//.test(id)) return 'react';
          if (id.includes('@tanstack')) return 'query';
          if (/node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(id)) return 'motion';
          if (/node_modules\/(@radix-ui|@floating-ui)\//.test(id)) return 'radix';
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
