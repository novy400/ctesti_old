import { existsSync } from 'node:fs';
import { expect } from 'vitest';
import { ProofContext } from '../../src/proofs/context.js';
import { ProofScript } from '../../src/proofs/script.js';
import { mappingCall } from '../../src/proofs/mapping.js';
import { nodes, output, textValue } from '../../src/proofs/xml.js';
import { createProofTest } from '../../src/proofs/fixture.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const proof = createProofTest(() => new ProofContext());

function scenario(context: ProofContext) {
  return new ProofScript()
    .observe('before', 'values QSYS2.JOB_NAME')
    .command(`ADDLIBLE LIB(${context.config.library}) POSITION(*FIRST)`)
    .statement('create table QTEMP.CTWIT (TOKEN varchar(36))')
    .statement(`insert into QTEMP.CTWIT values('${context.id}') with nc`)
    .observe('prepared', 'values QSYS2.JOB_NAME')
    .observe('token', 'select TOKEN from QTEMP.CTWIT with nc')
    .observe('library', `select SYSTEM_SCHEMA_NAME from QSYS2.LIBRARY_LIST_INFO where SYSTEM_SCHEMA_NAME = '${context.config.library}'`)
    .observe('after', 'values QSYS2.JOB_NAME');
}
const windows: { start: string; end: string }[] = [];
let resolveConnections!: () => void;
let rejectConnections!: (error: unknown) => void;
const connectionsReady = new Promise<void>((resolve, reject) => {
  resolveConnections = resolve;
  rejectConnections = reject;
});
void connectionsReady.catch(() => {});
let readyConnections = 0;
const beforeConcurrentSubmit = () => {
  if (++readyConnections === 2) resolveConnections();
  return connectionsReady;
};
async function verify(context: ProofContext, concurrent = false) {
  const script = scenario(context);
  if (concurrent) script.observe('started', 'values varchar(current_timestamp)')
    .shell('sleep 5').observe('finished', 'values varchar(current_timestamp)');
  let result: unknown;
  try {
    result = await context.run(script.body, concurrent ? { beforeSubmit: beforeConcurrentSubmit } : {});
  } catch (error) {
    if (concurrent) rejectConnections(error);
    throw error;
  }
  expect(script.rows(result, 'token')).toEqual([context.id]);
  expect(script.rows(result, 'library')).toEqual([context.config.library]);
  expect(script.rows(result, 'before')).toHaveLength(1);
  expect(script.rows(result, 'prepared')).toEqual(script.rows(result, 'before'));
  expect(script.rows(result, 'after')).toEqual(script.rows(result, 'before'));
  if (concurrent) {
    const start = script.rows(result, 'started')[0], end = script.rows(result, 'finished')[0];
    if (!start || !end) throw new Error('Fenêtre serveur absente');
    windows.push({ start, end });
    if (windows.length === 2) {
      expect(windows[0]!.start < windows[1]!.end && windows[1]!.start < windows[0]!.end,
        'Les deux scénarios doivent se chevaucher réellement côté IBM i').toBe(true);
    }
  }
}

proof('continuité stateless : préparation, LIBL et QTEMP dans une seule requête', async ({ ibmi }) => {
  await verify(ibmi);
});

// Chaque cas Vitest possède sa propre requête, même pendant les essais d'isolation.
for (const index of [1, 2]) {
  proof(`continuité stateless : contexte successif ${index}`, async ({ ibmi }) => {
    await verify(ibmi);
  });
}
for (const index of [1, 2]) {
  proof.concurrent(`deux contextes stateless simultanés : témoin ${index}`, async ({ ibmi }) => {
    await verify(ibmi, true);
  });
}

proof('continuité stateless : erreur de préparation avant le témoin cible', async ({ ibmi }) => {
  const script = new ProofScript()
    .statement('select * from QTEMP.CTMISSING')
    .command(`SNDPGMMSG MSG('ctesti-target-${ibmi.id}') TOPGMQ(*EXT) MSGTYPE(*INFO)`, 'rexx');
  const response = await ibmi.run(script.body, { expectError: true });
  expect(nodes(response, 'error').length + nodes(response, 'sqlerror').length).toBeGreaterThan(0);
  expect(nodes(response, 'sqlcode').map(textValue)).toContain('-204');
  expect(nodes(response, 'cmd')).toEqual([]);
  // error=on peut produire un rapport avec le XML exécuté jusqu'à l'erreur en CDATA.
  const partial = nodes(response, 'xmloutput');
  if (nodes(response, 'report').length) expect(partial).toHaveLength(1);
  for (const xml of partial) expect(textValue(xml)).not.toContain('<cmd');
});

proof('messages stateless : doublons et préparation séparés dans une seule requête', async ({ ibmi }) => {
  const script = new ProofScript();
  const send = (text: string) => script.command(`SNDPGMMSG MSG('${text}') TOPGMQ(*EXT) MSGTYPE(*INFO)`, 'rexx');
  const start = `start-${ibmi.id}`, end = `end-${ibmi.id}`, message = `call-${ibmi.id}`;
  send(`prep-${ibmi.id}`); send(start); send(message); send(message); send(end);
  const boundary = (text: string) => `(select min(ORDINAL_POSITION) from table(QSYS2.JOBLOG_INFO('*')) where MESSAGE_TEXT = '${text}')`;
  script.observe('messages', `select MESSAGE_TEXT from table(QSYS2.JOBLOG_INFO('*')) where ORDINAL_POSITION > ${boundary(start)} and ORDINAL_POSITION < ${boundary(end)} order by ORDINAL_POSITION`);
  const response = await ibmi.run(script.body);
  const messages = script.rows(response, 'messages');
  expect(messages.filter(text => text === message)).toEqual([message, message]);
  expect(messages).not.toContain(`prep-${ibmi.id}`);
});

for (const procedure of [false, true]) {
  proof(`mapping stateless ${procedure ? 'SRVPGM' : 'PGM'} : DS, varchar, int32 et packed exact`, async ({ ibmi }) => {
    const result = await ibmi.run(mappingCall(ibmi.config.library, procedure));
    expect(output(result, 'fixed')).toBe('été & <ok>'.padEnd(16));
    expect(output(result, 'shortText')).toBe('café  ');
    expect(output(result, 'longText')).toBe('réponse  ');
    expect(output(result, 'integer')).toBe('2147483647');
    expect(output(result, 'amount')).toBe('1234567890123456789012.123456790');
    expect(output(result, 'first')).toBe('2147483647');
    expect(output(result, 'second')).toBe('0');
    expect(output(result, 'third')).toBe('-1');
    if (procedure) expect(output(result, 'returnValue')).toBe('42');
  });
}
