import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { execSync } from 'child_process';
import pkg from '../../package.json';

function getGitCommits() {
  try {
    const raw = execSync('git log -n 15 --pretty=format:"%h|%s|%cd|%an" --date=short', {
      encoding: 'utf-8',
    });
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, message, date, author] = line.split('|');
        return { hash, message, date, author };
      });
  } catch {
    return [];
  }
}

function getGitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'd63a0a9';
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || '1.0.0'),
    __GIT_HASH__: JSON.stringify(getGitHash()),
    __GIT_COMMITS__: JSON.stringify(getGitCommits()),
  },
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
