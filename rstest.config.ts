import { defineConfig } from '@rstest/core';

// Only the framework-free packages carry unit tests (docs/Architecture.md §8);
// end-to-end behaviour is covered by the scenario scripts in scripts/.
export default defineConfig({
  include: ['packages/*/src/**/*.test.ts'],
});
