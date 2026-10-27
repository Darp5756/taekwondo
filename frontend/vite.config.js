import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // En desarrollo, /api se redirige al backend local.
    proxy: { '/api': process.env.VITE_PROXY_TARGET || 'http://localhost:3000' },
  },
});
