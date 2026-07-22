import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // GitHub Pages serves at https://<owner>.github.io/fhir-viewer/.
  base: process.env.NODE_ENV === 'production' ? '/fhir-viewer/' : '/',
  plugins: [
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
        prerender: {
          crawlLinks: true,
        },
      },
      prerender: {
        failOnError: false,
      },
    }),
    viteReact(),
  ],
})
