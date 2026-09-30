import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // Bundle the workspace package (it ships TypeScript sources); keep real deps external.
  noExternal: ['@kiosk/shared'],
  // tsup strips the `node:` protocol from builtin imports by default. That turns
  // `node:sqlite` into a bare `sqlite` specifier which Node can't resolve, so the built
  // server crashes at startup with ERR_MODULE_NOT_FOUND. Keep the protocol intact.
  removeNodeProtocol: false,
});
