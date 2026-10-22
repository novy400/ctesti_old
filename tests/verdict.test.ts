import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import { nodes } from '../src/proofs/xml.js';

function run(scenario?: string, args: string[] = []) {
  mkdirSync('artifacts/verdict', { recursive: true });
  const directory = mkdtempSync(join('artifacts/verdict', 'run-'));
  const env: NodeJS.ProcessEnv = { ...process.env, CTESTI_VERDICT_DIR: directory };
  delete env.CTESTI_VERDICT_CASE;
  if (scenario) env.CTESTI_VERDICT_CASE = scenario;
  const result = spawnSync(process.execPath, [
    'node_modules/vitest/vitest.mjs', 'run', '--config', 'proofs/verdict/vitest.config.ts', ...args,
  ], { encoding: 'utf8', timeout: 30_000, env });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  const console = result.stdout + result.stderr;
  writeFileSync(join(directory, 'console.txt'), console);
  const xml = readFileSync(join(directory, 'junit.xml'), 'utf8');
  const junit: unknown = new XMLParser({ ignoreAttributes: false }).parse(xml);
  return { status: result.status, console, xml, cases: nodes(junit, 'testcase'), directory };
}

function attribute(value: unknown, name: string): unknown {
  if (!value || typeof value !== 'object') throw new Error('Testcase JUnit absent');
  return Reflect.get(value, `@_${name}`);
}

interface Diagnostic {
  provisional: 'pass' | 'fail';
  final: 'pass' | 'fail';
  bodyRan: boolean;
  completed: string[];
  skipped: string[];
  present: string[];
  errors: string[];
}

function diagnostic(directory: string, name: string): Diagnostic {
  return JSON.parse(readFileSync(join(directory, `${name}.json`), 'utf8'));
}

test('le verdict final, les causes et les ressources concordent dans le processus, la console, les diagnostics et JUnit', () => {
  const result = run();
  expect(result.status).toBe(1);
  expect(result.cases).toHaveLength(13);
  const success = new Set(['success', 'expected-ibmi']);
  const causes: Record<string, string[]> = {
    hook: ['hook-impossible'], 'copy-qtemp': ['copy-qtemp-impossible'],
    termination: ['termination-impossible'], 'cleanup-first': ['cleanup-first-impossible'],
    'cleanup-second': ['cleanup-second-impossible'],
    'assertion-and-close': ['assertion-initiale', 'hook-impossible', 'copy-qtemp-impossible'],
    prepare: ['preparation-impossible'], technical: ['panne-technique'],
    'unexpected-ibmi': ['CPF0001-inattendue'], 'expected-but-normal': ['terminaison normale'],
    'expected-but-technical': ['transport-impossible'],
  };
  for (const testcase of result.cases) {
    const name = String(attribute(testcase, 'name'));
    const data = diagnostic(result.directory, name);
    expect(nodes(testcase, 'failure').length > 0, name).toBe(!success.has(name));
    expect(data.final, name).toBe(success.has(name) ? 'pass' : 'fail');
    expect(result.console).toContain(`${name}.json`);
    expect(JSON.stringify(testcase)).toContain(`${name}.json`);
    for (const cause of causes[name] ?? []) {
      expect(result.console, name).toContain(cause);
      expect(JSON.stringify(testcase), name).toContain(cause);
      expect(data.errors.join('\n'), name).toContain(cause);
    }
    if (success.has(name)) expect(data.present).toEqual([]);
    else if (name === 'cleanup-second') {
      expect(data.present).toEqual(['second']);
      expect(data.completed).toContain('cleanup-first');
    } else expect(data.present, name).toEqual(['first', 'second']);
  }
  for (const name of ['hook', 'copy-qtemp', 'termination', 'cleanup-first', 'cleanup-second']) {
    expect(diagnostic(result.directory, name).provisional, name).toBe('pass');
  }
  for (const name of ['assertion-and-close', 'prepare', 'technical', 'unexpected-ibmi', 'expected-but-normal', 'expected-but-technical']) {
    expect(diagnostic(result.directory, name).provisional, name).toBe('fail');
  }
  expect(diagnostic(result.directory, 'prepare').bodyRan).toBe(false);
  expect(diagnostic(result.directory, 'hook').skipped).toEqual(['termination', 'cleanup-first', 'cleanup-second']);
  expect(diagnostic(result.directory, 'termination').skipped).toEqual(['cleanup-first', 'cleanup-second']);
}, 40_000);

test.each(['success', 'expected-ibmi'])('%s produit réellement un code de sortie nul', scenario => {
  const result = run(scenario);
  expect(result.status).toBe(0);
  expect(result.cases).toHaveLength(1);
  expect(nodes(result.cases[0], 'failure')).toEqual([]);
}, 40_000);

test.each([
  ['retry', []], ['retry-object', []], ['repeats', []], ['fails', []],
  ['success', ['--retry', '2']], ['success', ['--repeats', '2']],
] satisfies [string, string[]][])('options interdites : %s %j', (scenario, args) => {
  const result = run(scenario, args);
  expect(result.status).toBe(1);
  expect(result.cases).toHaveLength(1);
  expect(nodes(result.cases[0], 'failure')).not.toEqual([]);
  for (const output of [result.xml, result.console]) {
    expect(output).toContain('cTestI refuse retry, repeats et test.fails');
    expect(output).not.toContain('creation-interdite');
    expect(output).not.toContain('execution-interdite');
    expect(output).not.toContain('Diagnostic cTestI');
  }
}, 40_000);
