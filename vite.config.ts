import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: [
      { find: /^vue$/, replacement: path.resolve(process.cwd(), 'scripts/vue-h5-compat.ts') },
    ],
  },
  plugins: [
    uni(),
  ],
})
