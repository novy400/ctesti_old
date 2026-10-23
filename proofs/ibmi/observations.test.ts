import { existsSync } from 'node:fs';
import { expect } from 'vitest';
import { ProofContext } from '../../src/proofs/context.js';
import { createProofTest } from '../../src/proofs/fixture.js';
import { CollectionError, ObservationScript, runObservations } from '../../src/proofs/observations.js';
import { observationFixtures } from './observation-fixtures.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const proof = createProofTest(() => new ProofContext());
const command = (mode: string) => `CALL PGM(QTEMP/CT10FIX) PARM('${mode}')`;
const build = (context: ProofContext) => observationFixtures(new ObservationScript(context.id));

proof('observations : deux appels RPGLE et programme imbriqué', async ({ ibmi }) => {
  const script = build(ibmi).call('first', command('A')).call('second', command('B'));
  const { response, job } = await runObservations(ibmi, script);
  const first = script.observation(response, 'first', job);
  const second = script.observation(response, 'second', job);
  expect(first).toMatchObject({ contextId: ibmi.id, callId: 'first', job, outcome: 'normal', collection: { state: 'complete' } });
  expect(second).toMatchObject({ contextId: ibmi.id, callId: 'second', job, outcome: 'normal', collection: { state: 'complete' } });
  expect(first.messages.map(m => m.text?.trim())).toEqual(['CT10:first.', 'CT10:nested.', 'CT10:nested.']);
  expect(second.messages.map(m => m.text?.trim())).toEqual(['CT10:second.']);
  expect(first.messages.slice(1).map(m => m.fromProgram?.trim())).toEqual(['CT10NEST', 'CT10NEST']);
  expect(first.messages[0]).toMatchObject({ id: 'CPF9898', type: 'INFORMATIONAL', severity: 40 });
  expect(first.messages.every(m => m.key !== null && m.substitution !== null)).toBe(true);
});

proof('observations : appel silencieux et collecte complète vide', async ({ ibmi }) => {
  const script = build(ibmi).call('silent', command('Z'));
  const { response, job } = await runObservations(ibmi, script);
  expect(script.observation(response, 'silent', job)).toMatchObject({ outcome: 'normal', messages: [], collection: { state: 'complete', error: null } });
});

proof('observations : erreur IBM i conservée', async ({ ibmi }) => {
  const script = build(ibmi).call('error', command('E')).call('after', command('B'));
  const { response, job } = await runObservations(ibmi, script);
  const observation = script.observation(response, 'error', job);
  expect(observation.outcome).toBe('ibmi-error');
  expect(observation.messages[0]?.text?.trim()).toBe('CT10:before-error.');
  expect(observation.messages.some(m => m.id === 'CPF9898' && m.type === 'ESCAPE')).toBe(true);
  expect(script.observation(response, 'after', job).messages.map(m => m.text?.trim())).toEqual(['CT10:second.']);
});

for (const [name, mode, options, reason] of [
  ['panne après erreur IBM i', 'E', { failAfter: 1 }, 'collector-sql-error'],
  ['collecte inaccessible', 'A', { failAfter: 0 }, 'collector-sql-error'],
  ['limite messages réduite atteinte exactement', 'B', { limits: { messages: 1 } }, 'message-limit'],
  ['limite octets réduite', 'A', { limits: { bytes: 1 } }, 'byte-limit'],
  ['limite temps réduite', 'A', { limits: { milliseconds: 100 }, delaySeconds: 1 }, 'time-limit'],
  ['texte tronqué', 'T', {}, 'truncated-field'],
  ['délimitation incertaine', 'A', { invalidateBoundary: true }, 'uncertain-boundary'],
] as const) {
  proof(`observations : ${name}`, async ({ ibmi }) => {
    const script = build(ibmi).call('partial', command(mode), options).call('blocked', command('B'));
    const { response, job } = await runObservations(ibmi, script);
    let error: unknown;
    try { script.observation(response, 'partial', job); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(CollectionError);
    const partial = (error as CollectionError).observation;
    expect(partial.outcome).toBe(mode === 'E' ? 'ibmi-error' : 'normal');
    expect(partial.collection).toEqual({ state: 'partial', error: reason });
    expect(partial.messages).toHaveLength(('failAfter' in options && options.failAfter === 1) || reason === 'message-limit' || reason === 'truncated-field' ? 1 : 0);
    expect(() => script.observation(response, 'blocked', job)).toThrow(CollectionError);
    try { script.observation(response, 'blocked', job); }
    catch (caught) { expect((caught as CollectionError).observation).toMatchObject({ outcome: 'unknown', messages: [], collection: { error: 'blocked-after-collection-failure' } }); }
  });
}

// Campagne nominale explicite : aucune charge de 10 001 messages par défaut.
for (const [name, mode, options, reason] of [
  ['10000 messages', 'M', {}, 'message-limit'],
  ['10 Mio', 'V', {}, 'byte-limit'],
  ['15 secondes', 'A', { delaySeconds: 16 }, 'time-limit'],
] as const) {
  proof.skipIf(process.env.CTESTI_COLLECTION_STRESS !== '1')(`observations limites nominales : ${name}`, async ({ ibmi }) => {
    const script = build(ibmi).call('budget', command(mode), options);
    const { response, job } = await runObservations(ibmi, script);
    expect(() => script.observation(response, 'budget', job)).toThrow(CollectionError);
    try { script.observation(response, 'budget', job); }
    catch (error) { expect((error as CollectionError).observation.collection.error).toBe(reason); }
  });
}
