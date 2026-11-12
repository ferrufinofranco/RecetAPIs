import { defineConfig } from 'vitest/config'

// Sin plugins del frontend, jsdom, setup de mocks ni carga de .env por Vite.
export default defineConfig({
  envDir: false,
  test: {
    environment: 'node',
    include: ['tests/integration/rls/**/*.rls.js'],
    fileParallelism: false,
    sequence: { concurrent: false, shuffle: false },
    maxWorkers: 1,
    // Cada fetch corta a los 15 s. Los límites del runner cubren el peor caso
    // secuencial para no disparar limpieza mientras un hook sigue escribiendo.
    testTimeout: 1_800_000,
    hookTimeout: 900_000,
    retry: 0,
    reporters: ['default'],
  },
})
