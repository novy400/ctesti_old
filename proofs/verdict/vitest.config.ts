import { defineConfig } from 'vitest/config';

export default defineConfig({ test: {
  include: ['proofs/verdict/scenarios.ts'], retry: 0,
  runner: './src/proofs/runner.ts',
  fileParallelism: false,
  reporters: ['default', 'junit'], outputFile: { junit: `${process.env.CTESTI_VERDICT_DIR ?? 'artifacts/verdict'}/junit.xml` },
} });
