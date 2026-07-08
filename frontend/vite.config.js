import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Raw-Import von docs/Dokumentation.md (Repo-Root, eine Ebene ueber
    // dem Vite-Root frontend/). Haelt die Doku als einzige Quelle.
    fs: { allow: ['..'] },
  },
})
