import { defineConfig } from 'vite';

// Dev: Vite serves the app on :5173 and proxies /api to the Express API on :4000, so the browser
// sees one origin and the session cookie just works. Production: Express serves the built dist/.
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4000',
      // Font and favicon are served by Express (shared with the customer and rider pages).
      '/fonts': 'http://localhost:4000',
      '/favicon.svg': 'http://localhost:4000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
