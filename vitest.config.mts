import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    testTimeout: 15_000,
  },
});
