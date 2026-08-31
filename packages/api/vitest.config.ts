import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Testerna körs mot en riktig Postgres-databas för att kundsepareringen ska
    // kunna verifieras på riktigt. De delar databas och körs därför i följd.
    fileParallelism: false,
    sequence: { concurrent: false },
    hookTimeout: 120_000,
    testTimeout: 60_000,
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'],
  },
});
