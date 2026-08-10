import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // The real monaco-editor touches `window` at import time; Node unit tests
      // use a minimal type-compatible stub instead (see src/test/mocks/).
      'monaco-editor': path.resolve(__dirname, 'src/test/mocks/monaco-editor.ts')
    }
  },
  test: {
    include: ['src/**/*.test.ts', 'corpus/**/*.test.ts'],
    exclude: ['output/**', 'node_modules/**', 'dist/**']
  }
});
