import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // SYSARCH_API lets the e2e run point the proxy at its own server.
    proxy: { '/api': process.env.SYSARCH_API ?? 'http://localhost:8787' },
  },
});
