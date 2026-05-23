import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Set Cross-Origin-Opener-Policy on every response from the dev server.
// Google Identity Services renders its button in an iframe and the sign-in
// popup posts the id_token back via window.postMessage. The browser's
// default COOP blocks that — `same-origin-allow-popups` whitelists the
// popup→opener channel while keeping the rest cross-origin-isolated.
//
// We set this via a plugin (instead of `server.headers`) so it applies to
// every middleware in the chain, including the proxy and HMR — not just
// the static-file handler.
function googleSigninCoop() {
  const apply = (_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  };
  return {
    name: 'google-signin-coop',
    configureServer(server) { server.middlewares.use(apply); },
    configurePreviewServer(server) { server.middlewares.use(apply); },
  };
}

export default defineConfig({
  plugins: [react(), googleSigninCoop()],
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
