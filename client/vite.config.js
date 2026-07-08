import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

process.env.VITE_PUBLIC_BASE ||= '/';
process.env.VITE_SITE_URL ||= process.env.VITE_PUBLIC_BASE.replace(/\/$/, '');

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_PUBLIC_BASE,
  server: {
    host: true,
    port: 8080
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler'
      }
    }
  }
});
