import { mkdir, writeFile } from 'node:fs/promises';
import { expect } from 'vitest';
import { createProofTest } from '../../src/proofs/fixture.js';
import { IbmiError, ProofLifecycle, type CloseStep, type Verdict } from '../../src/proofs/lifecycle.js';

const directory = process.env.CTESTI_VERDICT_DIR ?? 'artifacts/verdict';

class ControlledContext extends ProofLifecycle {
  provisional: Verdict | undefined;
  bodyRan = false;
  readonly present = new Set(['first', 'second']);
  constructor(readonly name: string, readonly fault?: string) { super(); }

  async close(): Promise<void> {
    const step = (name: string, destructive = false): CloseStep => ({
      name, destructive, run: async () => {
        if (this.fault?.split(',').includes(name)) throw new Error(`${name}-impossible`);
        if (name.startsWith('cleanup-')) this.present.delete(name.slice('cleanup-'.length));
      },
    });
    try {
      await this.finish([
        step('copy-qtemp'), step('termination', true),
        step('cleanup-first', true), step('cleanup-second', true),
      ]);
    } finally {
      await mkdir(directory, { recursive: true });
      const diagnostic = `${directory}/${this.name}.json`;
      await writeFile(diagnostic, JSON.stringify({
        provisional: this.provisional, final: this.failed ? 'fail' : 'pass',
        bodyRan: this.bodyRan, completed: this.completed, skipped: this.skipped,
        present: [...this.present], errors: this.failures.map(error =>
          error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)),
      }, null, 2));
      console.log(`Diagnostic cTestI : ${diagnostic}`);
    }
  }
}

function scenario(
  name: string,
  body: (context: ControlledContext) => Promise<void> = async () => {},
  options: { fault?: string; hook?: boolean; prepare?: boolean; verdict?: Verdict } = {},
) {
  if (process.env.CTESTI_VERDICT_CASE && process.env.CTESTI_VERDICT_CASE !== name) return;
  const proof = createProofTest(
    () => new ControlledContext(name, options.fault),
    async (context, verdict) => {
      context.provisional = verdict;
      expect(verdict).toBe(options.verdict ?? 'pass');
      if (options.hook) throw new Error('hook-impossible');
    },
    async () => { if (options.prepare) throw new Error('preparation-impossible'); },
  );
  proof(name, async ({ ibmi }) => { ibmi.bodyRan = true; await body(ibmi); });
}

scenario('success');
scenario('hook', undefined, { hook: true });
for (const fault of ['copy-qtemp', 'termination', 'cleanup-first', 'cleanup-second']) {
  scenario(fault, undefined, { fault });
}
scenario('assertion-and-close', async () => {
  expect('obtained', 'assertion-initiale').toBe('expected');
}, { verdict: 'fail', hook: true, fault: 'copy-qtemp' });
scenario('prepare', undefined, { prepare: true, verdict: 'fail' });

for (const kind of ['technical', 'unexpected-ibmi']) {
  scenario(kind, async context => {
    await expect(context.perform(async () => {
      if (kind === 'technical') throw new Error('panne-technique');
      throw new IbmiError('CPF0001-inattendue');
    })).rejects.toThrow();
    let continued = false;
    await expect(context.perform(async () => { continued = true; })).rejects.toThrow('Contexte condamné');
    expect(continued).toBe(false);
  }, { verdict: 'fail' });
}
scenario('expected-ibmi', async context => {
  const error = await context.expectingError(async () => { throw new IbmiError('CPF0001-attendue'); });
  expect(error.message).toBe('CPF0001-attendue');
  await context.perform(async () => {});
});
scenario('expected-but-normal', async context => {
  await expect(context.expectingError(async () => {})).rejects.toThrow('terminaison normale');
}, { verdict: 'fail' });
scenario('expected-but-technical', async context => {
  await expect(context.expectingError(async () => { throw new Error('transport-impossible'); })).rejects.toThrow('transport-impossible');
}, { verdict: 'fail' });

for (const policy of ['retry', 'repeats', 'fails', 'retry-object']) {
  if (process.env.CTESTI_VERDICT_CASE !== policy) continue;
  const proof = createProofTest(() => { throw new Error('creation-interdite'); });
  const options = policy === 'retry-object' ? { retry: { count: 2 } } : { [policy]: policy === 'fails' ? true : 2 };
  proof(policy, options, () => { throw new Error('execution-interdite'); });
}
