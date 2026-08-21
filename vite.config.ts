import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now())

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'write-version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ v: buildId }),
        })
      },
    },
  ],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(buildId),
  },
})
