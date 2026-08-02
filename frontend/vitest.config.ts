import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so the vite 8 / vitest bundled-vite type clash never
// reaches `tsc -b`. No React plugin needed: esbuild transforms TSX via tsconfig's
// `jsx: react-jsx` (automatic runtime). Not included in any tsconfig, so tsc ignores it.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
  },
})
