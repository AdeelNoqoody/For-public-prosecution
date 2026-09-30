import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../..', import.meta.url));

/** Strict Content-Security-Policy for production builds (dev needs inline scripts for HMR). */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' http: https: ws: wss:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'kiosk-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ROOT_DIR, '');
  // Defaults for running the renderer in a plain browser (`npm run dev:web`).
  // Inside Electron, values from the main process (see electron/main.ts) take precedence.
  const defaults = {
    serverUrl: env.KIOSK_SERVER_URL || 'http://localhost:4000',
    kioskId: env.KIOSK_ID || 'KIOSK-DEV',
    idleTimeoutSeconds: Number(env.IDLE_TIMEOUT_SECONDS || 60),
  };
  return {
    base: './',
    plugins: [react(), tailwindcss(), contentSecurityPolicy()],
    define: { __KIOSK_DEFAULTS__: JSON.stringify(defaults) },
    server: { port: 5173, strictPort: true, host: '127.0.0.1' },
    build: { outDir: 'dist', emptyOutDir: true, target: 'chrome130' },
  };
});
