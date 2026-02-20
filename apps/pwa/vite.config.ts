import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const resolvePort = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, '');
  const pwaPort = resolvePort(env.PWA_PORT ?? env.VITE_PWA_PORT, 5173);
  const pwaPreviewPort = resolvePort(
    env.PWA_PREVIEW_PORT ?? env.PWA_PORT ?? env.VITE_PWA_PORT,
    4173,
  );

  return {
    envDir: workspaceRoot,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'Tithe Expense Tracker',
          short_name: 'Tithe',
          description: 'Mobile-first local expense tracker',
          theme_color: '#0D5A32',
          background_color: '#F6FAF7',
          display: 'standalone',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/favicon.svg',
              sizes: '64x64',
              type: 'image/svg+xml',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png}'],
        },
      }),
    ],
    server: {
      host: '0.0.0.0',
      port: pwaPort,
    },
    preview: {
      host: '0.0.0.0',
      port: pwaPreviewPort,
    },
  };
});
