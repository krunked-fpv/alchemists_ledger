import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'glsl-raw-loader',
      transform(code, id) {
        if (id.split('?')[0].endsWith('.glsl')) {
          return {
            code: `export default ${JSON.stringify(code)};`,
            map: null,
          };
        }
        return null;
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 4096,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
