import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// NOTE: Vitest config lives in vitest.config.ts (separate file) to avoid a vite 8 /
// vitest bundled-vite type clash breaking `tsc -b` in the build.
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to all interfaces so the dev server is reachable over the LAN and through
    // an Ngrok tunnel — not just on localhost.
    host: true,
    port: 5173,
    // Accept the Host header that Ngrok forwards. `true` allows any host: simple and
    // surprise-proof for the demo (prevents Vite's "Blocked request. This host is not
    // allowed."). For production, narrow it to explicit patterns instead, e.g.:
    //   allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.ngrok.app']
    allowedHosts: true,
    proxy: {
      // Forward API calls to the local backend SERVER-SIDE, so the browser only ever
      // talks to this dev server's own origin: no CORS, and a single Ngrok tunnel (on
      // 5173) is enough. The '/api' prefix is stripped, so the frontend's
      // '/api/health' reaches the backend as '/health'. Independent of allowedHosts
      // above (that gates the INCOMING Host; this forwards the OUTGOING /api requests).
      '/api': {
        target: 'http://localhost:3005',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
