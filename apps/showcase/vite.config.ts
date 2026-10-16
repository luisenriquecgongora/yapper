import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@yapper/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@yapper/react': path.resolve(__dirname, '../../packages/react/src/index.ts'),
    },
  },
  server: {
    port: 3004,
  },
});
