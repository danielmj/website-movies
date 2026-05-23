import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Refuse to silently jump to 5174/5175/etc when 5173 is busy. A different
    // port = different origin = the browser drops the existing session cookie,
    // making it look like the server lost the session across restarts. Better
    // to fail loudly and let the user kill the stale dev server.
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
