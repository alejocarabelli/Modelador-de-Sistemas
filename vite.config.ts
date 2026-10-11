/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pdfjsAssets from './scripts/vite-pdfjs-assets.mjs';

export default defineConfig({
  base: './',
  plugins: [react(), pdfjsAssets()],
  test: {
    // Keep local experiments out; include the native bridge regression on macOS.
    include: ['src/**/*.test.{ts,tsx}', 'macos/*.test.js'],
  },
});
