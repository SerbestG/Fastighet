import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Läget "single" bygger en fristående sida där bilder bäddas in i koden, så att
// prototypen kan delas som en enda HTML-fil (se scripts/inline.mjs).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: './',
  server: { port: 5180 },
  preview: { port: 4180 },
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2022',
    assetsInlineLimit: mode === 'single' ? Number.MAX_SAFE_INTEGER : 4096,
    cssCodeSplit: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}) as never);
