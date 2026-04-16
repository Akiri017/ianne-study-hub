import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Exclude compiled output — only run source TypeScript tests
    exclude: ['dist/**', 'node_modules/**'],
  },
})
