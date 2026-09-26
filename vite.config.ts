import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy: same-origin calls to /sub, /version, ... are forwarded to a locally
// running subconverter (default port 25500). In production the nginx container
// provides the equivalent reverse proxy, so the browser never hits CORS.
export default defineConfig({
  plugins: [react()],
  // All frontend build artifacts are emitted to `build/` (not the Vite default `dist`).
  build: {
    outDir: 'build',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/sub': 'http://localhost:25500',
      '/version': 'http://localhost:25500',
      '/getruleset': 'http://localhost:25500',
      '/getprofile': 'http://localhost:25500',
      '/render': 'http://localhost:25500',
      '/refreshrules': 'http://localhost:25500',
    },
  },
});
