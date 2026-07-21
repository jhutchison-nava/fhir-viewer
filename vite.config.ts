import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    // Fully static app: all data is pre-distilled JSON under public/schema,
    // fetched by route loaders in the browser. SPA mode skips SSR of loaders.
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
})
