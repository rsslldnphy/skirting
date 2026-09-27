import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built app works from any static host or sub-path.
  base: './',
  worker: { format: 'es' },
});
