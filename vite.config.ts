/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pdfjsAssets from './scripts/vite-pdfjs-assets.mjs';
import sniffSafeAssets from './scripts/vite-sniff-safe-assets.mjs';

export default defineConfig({
  base: './',
  plugins: [react(), pdfjsAssets(), sniffSafeAssets()],
  test: {
    // Keep local experiments out; include the native bridge regression on macOS.
    include: ['src/**/*.test.{ts,tsx}', 'macos/*.test.js'],
  },
});
