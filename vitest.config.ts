import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['scripts/**/*.test.mjs'], retry: 0, fileParallelism: false },
});
