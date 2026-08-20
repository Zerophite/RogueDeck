import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/RogueDeck/',  // must match the GitHub repo name (Pages serves at /RogueDeck/)
})
