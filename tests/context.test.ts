import { expect, test, vi, beforeEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { ProofContext } from '../src/proofs/context.js';
import { configuration } from '../src/proofs/config.js';
import { checkPrerequisites, request, TransportError } from '../src/proofs/transport.js';
import { ProofScript } from '../src/proofs/script.js';

vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), writeFile: vi.fn() }));
vi.mock('../src/proofs/transport.js', async importOriginal => {
  const original = await importOriginal<typeof import('../src/proofs/transport.js')>();
  return { ...original, request: vi.fn(), checkPrerequisites: vi.fn() };
});
const config = configuration({
  CTESTI_HOST_KEY_SHA256: 'a'.repeat(64), CTESTI_HOST: 'example.test',
  CTESTI_USER: 'TEST', CTESTI_AUTH: 'password', CTESTI_PASSWORD: 'secret',
  CTESTI_CCSID: '297', CTESTI_PROOF_LIBRARY: 'CTPROOF',
});
const row = (value = '123456/TEST/QP0ZSPWT') => `<sql><fetch><row><data>${value}</data></row></fetch></sql>`;
const response = () => `<myscript>${row()}${row('expected')}${row()}</myscript>`;
const transport = vi.mocked(request);
beforeEach(() => { vi.clearAllMocks(); transport.mockReset(); transport.mockResolvedValue(response()); });

test('une seule soumission avec inventaire préalable sans IPC ni secret', async () => {
  const context = new ProofContext(config);
  transport.mockImplementation(async () => { expect(writeFile).toHaveBeenCalled(); return response(); });
  const script = new ProofScript().observe('value', 'values 1');
  expect(script.body).toContain('values 1');
  expect(transport).not.toHaveBeenCalled();
  const result = await context.run(script.body);
  expect(script.rows(result, 'value')).toEqual(['expected']);
  await context.close();
  expect(checkPrerequisites).not.toHaveBeenCalled();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0]?.[1]).not.toMatch(/<start>|<use>/);
  const inventory = String(vi.mocked(writeFile).mock.calls.at(-1)?.[1]);
  expect(JSON.parse(inventory)).toMatchObject({ mode: 'stateless', state: 'closed', responseReceived: true });
  expect(inventory).not.toContain('secret');
  expect(inventory).not.toContain('ipc');
});

test('une seconde soumission est refusée après un succès', async () => {
  const context = new ProofContext(config);
  await context.run('');
  await expect(context.run('')).rejects.toThrow('Une seule requête');
  expect(transport).toHaveBeenCalledTimes(1);
});

test('les délimiteurs SQL et CL restent littéraux dans le texte XML du scénario', () => {
  const script = new ProofScript().statement("insert into QTEMP.T values('token') with nc")
    .command("SNDPGMMSG MSG('message')")
    .observe('token', "select TOKEN from QTEMP.T where TOKEN = 'token' with nc");
  expect(script.body).toContain("values('token') with nc");
  expect(script.body).toContain("MSG('message')");
  expect(script.body).not.toContain('&apos;');
});

test('deux soumissions concurrentes du même contexte sont refusées', async () => {
  let release!: (value: string) => void;
  transport.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const context = new ProofContext(config);
  const pending = context.run('');
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  await expect(context.run('')).rejects.toThrow('Une seule requête');
  await expect(context.close()).rejects.toThrow('active');
  release(response()); await pending;
});

test('timeout après soumission : aucun rejeu ni commande de clôture distante', async () => {
  const context = new ProofContext(config);
  transport.mockRejectedValueOnce(new TransportError('indeterminate', 'timeout'));
  await expect(context.run('')).rejects.toThrow('timeout');
  await expect(context.run('')).rejects.toThrow('condamné');
  await expect(context.close()).rejects.toThrow('Clôture');
  expect(transport).toHaveBeenCalledTimes(1);
  expect(String(vi.mocked(writeFile).mock.calls.at(-1)?.[1])).toContain('"indeterminate": true');
});

test('prérequis manquant : aucune requête XMLSERVICE', async () => {
  transport.mockRejectedValueOnce(new TransportError('not-submitted', 'Prérequis manquant'));
  await expect(new ProofContext(config).run('')).rejects.toThrow('Prérequis');
  expect(transport).toHaveBeenCalledTimes(1);
});

test('réponse tronquée ou identité incohérente : échec sans remplacement', async () => {
  for (const xml of ['<myscript>', `<myscript>${row()}${row('123457/TEST/QP0ZSPWT')}</myscript>`]) {
    transport.mockResolvedValueOnce(xml);
    await expect(new ProofContext(config).run('')).rejects.toThrow();
  }
  expect(transport).toHaveBeenCalledTimes(2);
});

test('une erreur IBM i explicitement attendue peut être vérifiée sans nouvelle requête', async () => {
  transport.mockResolvedValueOnce(`<myscript>${row()}<sql><sqlerror>failure</sqlerror></sql></myscript>`);
  const context = new ProofContext(config);
  await context.run('', { expectError: true });
  await context.close();
  expect(transport).toHaveBeenCalledTimes(1);
});
