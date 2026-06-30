import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  publicDir: command === 'serve' || process.env.INCLUDE_STATIC_ARCHIVE === '1' ? 'public' : false,
  build: {
    sourcemap: false,
  },
}));
