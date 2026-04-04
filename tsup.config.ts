import path from 'path';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  external: [
    'commander',
    'ink',
    'ink-select-input',
    'ink-text-input',
    'ink-spinner',
    'react',
    'react/jsx-runtime',
  ],
  esbuildOptions(options) {
    options.alias = {
      '~': path.resolve('./src'),
    };
  },
  loader: {
    '.md': 'text',
  },
});
