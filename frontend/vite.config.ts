import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

function resolveBackendTarget(): string {
  if (process.env.VITE_BACKEND_URL) {
    return process.env.VITE_BACKEND_URL;
  }

  // Keep Vite proxy aligned with backend/.env PORT automatically
  try {
    const backendEnvPath = path.resolve(__dirname, '../backend/.env');
    if (fs.existsSync(backendEnvPath)) {
      const content = fs.readFileSync(backendEnvPath, 'utf8');
      const match = content.match(/^\s*PORT\s*=\s*(\d+)\s*$/m);
      if (match?.[1]) {
        return `http://localhost:${match[1]}`;
      }
    }
  } catch {
    // Fall back to default backend port
  }

  return 'http://localhost:5001';
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: resolveBackendTarget(),
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
