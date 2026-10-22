import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';
import { configuration } from '../../src/proofs/config.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const runtime = configuration();
// Chaque tentative de connexion et l'unique commande ont des budgets distincts.
const scenarioTimeout = (runtime.sshAttempts + 1) * (runtime.timeoutMs + runtime.sshConnectIntervalMs)
  + (runtime.sshAttempts - 1) * runtime.sshRetryDelayMs + 10_000;

export default defineConfig({ test: {
  runner: './src/proofs/runner.ts',
  include: ['proofs/ibmi/**/*.test.ts'], fileParallelism: false, retry: 0,
  testTimeout: Math.max(120_000, Math.min(2_147_483_647, scenarioTimeout)), hookTimeout: 60_000,
  reporters: ['default', 'junit'], outputFile: { junit: 'artifacts/ibmi-junit.xml' },
} });
