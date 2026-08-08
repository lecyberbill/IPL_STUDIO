import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['output/**', 'node_modules/**', 'dist/**']
  }
});
