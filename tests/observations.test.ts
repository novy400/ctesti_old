import { expect, test } from 'vitest';
import { CollectionError, ObservationScript, runObservations } from '../src/proofs/observations.js';
import { ProofContext } from '../src/proofs/context.js';
import { nodes, parseXml, textValue } from '../src/proofs/xml.js';

const job = '123456/TEST/QP0ZSPWT';
const message = (ordinal = 1) => ({ ordinal, key: '00000001', id: null, type: 'INFORMATIONAL', severity: 0,
  text: 'duplicate', substitution: null, fromProgram: null });
const sqlRow = (rows: unknown[]) => `<sql><fetch>${rows.map(value => `<row><data><![CDATA[${typeof value === 'string' ? value : JSON.stringify(value)}]]></data></row>`).join('')}</fetch></sql>`;
function response(script: ObservationScript, statuses: Record<string, { outcome?: string; error?: string | null; job?: string; messages?: unknown[] }>) {
  const sqls = nodes(parseXml(`<myscript>${script.body}</myscript>`), 'sql');
  return parseXml(`<myscript>${sqlRow([job])}${sqls.map(sql => {
    const query = textValue(nodes(sql, 'query')[0]);
    const id = /where CALL_ID = '([^']+)'/.exec(query)?.[1];
    if (!id || !statuses[id]) return '<sql/>';
    const data = statuses[id]!;
    if (query.startsWith("select JSON_OBJECT('callId'")) return sqlRow([{ callId: id, job: data.job ?? job, outcome: data.outcome ?? 'normal', error: data.error ?? null }]);
    if (query.startsWith('select PAYLOAD')) return sqlRow(data.messages ?? ['null']);
    return '<sql/>';
  }).join('')}${sqlRow([job])}</myscript>`);
}
function partial(operation: () => unknown) {
  try { operation(); } catch (error) {
    expect(error).toBeInstanceOf(CollectionError);
    return (error as CollectionError).observation;
  }
  throw new Error('Échec technique attendu');
}

test('attribution de deux appels, ordre et doublons sans champ artificiel', () => {
  const script = new ObservationScript('context').call('first', 'CALL PGM(QTEMP/FIRST)').call('second', 'CALL PGM(QTEMP/SECOND)');
  const result = response(script, { first: { messages: [message(12), message(13)] }, second: { messages: [message(18)] } });
  expect(script.observation(result, 'first', job)).toMatchObject({ callId: 'first', contextId: 'context', job,
    messages: [message(12), message(13)], collection: { state: 'complete', error: null } });
  expect(script.observation(result, 'second', job).messages).toEqual([message(18)]);
});

test('liste vide complète distincte d’une collecte manquante', () => {
  const script = new ObservationScript('context').call('silent', 'CALL PGM(QTEMP/SILENT)');
  expect(script.observation(response(script, { silent: {} }), 'silent', job).messages).toEqual([]);
  expect(partial(() => script.observation(response(script, { silent: { messages: [] } }), 'silent', job)).collection.state).toBe('partial');
});

test.each(['collector-sql-error', 'time-limit', 'message-limit', 'byte-limit', 'truncated-field', 'uncertain-boundary'])(
  '%s conserve l’erreur IBM i et les observations partielles', error => {
    const script = new ObservationScript('context').call('error', 'CALL PGM(QTEMP/ERROR)');
    const result = response(script, { error: { outcome: 'ibmi-error', error, messages: [message()] } });
    expect(partial(() => script.observation(result, 'error', job))).toMatchObject({ outcome: 'ibmi-error', messages: [message()], collection: { state: 'partial', error } });
  });

test('une ligne corrompue conserve le préfixe et ne devient pas complète', () => {
  const script = new ObservationScript('context').call('error', 'CALL PGM(QTEMP/ERROR)');
  const result = response(script, { error: { outcome: 'ibmi-error', messages: [message(), '{broken'] } });
  expect(partial(() => script.observation(result, 'error', job))).toMatchObject({ outcome: 'ibmi-error', messages: [message()], collection: { state: 'partial' } });
});

test('job différent, ordre incohérent, champ absent et résultat inconnu ne prouvent rien de complet', () => {
  const script = new ObservationScript('context').call('first', 'CALL PGM(QTEMP/FIRST)');
  for (const status of [{ job: '654321/OTHER/JOB' }, { messages: [message(2), message(1)] },
    { messages: [{ ordinal: 1 }] }, { outcome: 'unknown' }]) {
    expect(partial(() => script.observation(response(script, { first: status }), 'first', job)).collection.state).toBe('partial');
  }
});

test('identifiants uniques et budgets valides avant toute soumission', () => {
  const script = new ObservationScript('context').call('first', 'CALL PGM(QTEMP/FIRST)');
  expect(() => script.call('first', 'CALL PGM(QTEMP/FIRST)')).toThrow('dupliqué');
  for (const limits of [{ messages: 0 }, { bytes: 10485761 }, { milliseconds: NaN }, { messages: 1.5 }]) {
    expect(() => script.call('invalid', 'CALL PGM(QTEMP/FIRST)', { limits })).toThrow('Budget');
  }
  expect(() => script.call("bad'id", '')).toThrow('Identifiant');
});

test('un scénario d’un autre contexte est refusé avant le réseau', async () => {
  const context = new ProofContext({} as ConstructorParameters<typeof ProofContext>[0]);
  await expect(runObservations(context, new ObservationScript('other'))).rejects.toThrow('autre contexte');
  expect(() => context.verifiedJob).toThrow('non vérifié');
});
