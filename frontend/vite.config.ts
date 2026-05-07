import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,                          // listen on 0.0.0.0, not just localhost
    allowedHosts: ['.trycloudflare.com'], // accept any *.trycloudflare.com subdomain
    proxy: {
      '/api': {
        target: 'http://165.245.142.217:8001',//'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
