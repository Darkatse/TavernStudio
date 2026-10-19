import { defineConfig } from '@rstest/core';

export default defineConfig({
  include: ['packages/*/src/**/*.test.ts'],
});
