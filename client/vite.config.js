import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

process.env.VITE_API_BASE_URL ||= 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_PUBLIC_BASE || '/',
  server: {
    host: true
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler'
      }
    }
  }
});
