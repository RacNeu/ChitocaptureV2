import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this repository under /ChitocaptureV2/. Vercel and local dev serve from /.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' ? '/ChitocaptureV2/' : '/',
  plugins: [react()],
})
