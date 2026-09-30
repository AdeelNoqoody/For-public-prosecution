import { defineConfig } from 'tsup';

/**
 * Builds the Electron main + preload scripts (the renderer is built by Vite).
 * The main bundle also contains the embedded server and mock POS, with every dependency
 * bundled in, so the packaged app needs no node_modules and no separate Node.js install.
 */
export default defineConfig({
  entry: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
  outDir: 'dist-electron',
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // Keep `node:` prefixes: `node:sqlite` only resolves with the prefix.
  removeNodeProtocol: false,
  // Optional native accelerators of `ws`; it falls back to pure JS when they are missing.
  external: ['electron', 'bufferutil', 'utf-8-validate'],
  // Bundle everything except the modules above (a plain /.*/ would also swallow `electron`).
  noExternal: [/^(?!node:|(electron|bufferutil|utf-8-validate)$).*/],
});
