import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Client } from 'ssh2';
import { configuration } from '../src/proofs/config.js';
import { checkPrerequisites, request } from '../src/proofs/transport.js';

vi.mock('ssh2', () => ({ Client: vi.fn() }));
const config = configuration({
  CTESTI_HOST_KEY_SHA256: 'a'.repeat(64), CTESTI_HOST: 'example.test',
  CTESTI_USER: 'TEST', CTESTI_AUTH: 'password', CTESTI_PASSWORD: 'secret',
  CTESTI_IPC_ROOT: '/tmp/ctesti', CTESTI_CCSID: '297', CTESTI_PROOF_LIBRARY: 'CTPROOF',
  CTESTI_TIMEOUT_MS: '100',
});
let clients: ReturnType<typeof fakeClient>[];
function fakeClient() {
  const stream = Object.assign(new EventEmitter(), { stderr: new PassThrough(), end: vi.fn() });
  const client = Object.assign(new EventEmitter(), {
    createdAt: Date.now(),
    connect: vi.fn(), destroy: vi.fn(), stream,
    exec: vi.fn((_command: string, callback: (error: undefined, stream: typeof client.stream) => void) => callback(undefined, stream)),
  });
  return client;
}
beforeEach(() => {
  vi.useFakeTimers();
  clients = [];
  vi.mocked(Client).mockImplementation(function () {
    const client = fakeClient();
    clients.push(client);
    return client as unknown as Client;
  });
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

test('le transport transmet *here sans IPC, JOBD ou arrêt de job', async () => {
  const pending = request(config, '<myscript/>');
  const client = clients[0]!;
  client.emit('ready');
  expect(client.exec.mock.calls[0]?.[0]).toContain("'/QOpenSys/pkgs/bin/xmlservice-cli' -c '*here *cdata'");
  expect(client.exec.mock.calls[0]?.[0]).not.toMatch(/-i |sbmjob|immed/);
  expect(client.stream.end).toHaveBeenCalledWith('<myscript/>');
  client.stream.emit('data', Buffer.from('<myscript/>'));
  client.stream.emit('close', 0);
  await expect(pending).resolves.toBe('<myscript/>');
  expect(client.destroy).toHaveBeenCalledTimes(1);
});

test('le budget XML est validé avant connexion', async () => {
  for (const maxResponseBytes of [0, NaN, 64 * 1024 * 1024 + 1]) {
    await expect(request(config, '<myscript/>', { maxResponseBytes })).rejects.toMatchObject({ execution: 'not-submitted' });
  }
  expect(clients).toHaveLength(0);
});

test('une réponse dépassant son enveloppe est indéterminée sans rejeu', async () => {
  const pending = request({ ...config, sshAttempts: 3 }, '<myscript/>', { maxResponseBytes: 8 });
  clients[0]!.emit('ready');
  clients[0]!.stream.emit('data', Buffer.alloc(9));
  await expect(pending).rejects.toMatchObject({ execution: 'indeterminate', retryable: false });
  expect(clients).toHaveLength(1);
});

test.each([false, true])('timeout : soumission=%s, aucune nouvelle connexion', async submitted => {
  const pending = request(config, '<myscript/>');
  if (submitted) clients[0]!.emit('ready');
  const assertion = expect(pending).rejects.toMatchObject({ execution: submitted ? 'indeterminate' : 'not-submitted' });
  await vi.advanceTimersByTimeAsync(100);
  await assertion;
  expect(clients).toHaveLength(1);
});

test('empreinte différente : diagnostic explicite, aucun secret', async () => {
  const pending = request(config, '<myscript/>');
  const verifier = clients[0]!.connect.mock.calls[0]?.[0] as { hostVerifier: (hash: string) => boolean };
  expect(verifier.hostVerifier('b'.repeat(64))).toBe(false);
  await expect(pending).rejects.toMatchObject({ execution: 'not-submitted', message: expect.stringContaining('empreinte approuvée') });
  expect(clients[0]!.exec).not.toHaveBeenCalled();
});

test('coupure après soumission : exécution indéterminée', async () => {
  const pending = request(config, '<myscript/>');
  clients[0]!.emit('ready');
  clients[0]!.emit('error', new Error('password=secret'));
  await expect(pending).rejects.toMatchObject({ execution: 'indeterminate', message: 'Connexion SSH impossible ou interrompue' });
});

test('prérequis manquant : échec explicite avant travail XMLSERVICE', async () => {
  const pending = checkPrerequisites(config);
  clients[0]!.emit('ready');
  expect(clients[0]!.exec.mock.calls[0]?.[0]).toContain("test -x '/QOpenSys/pkgs/bin/xmlservice-cli'");
  clients[0]!.stream.emit('close', 1);
  await expect(pending).rejects.toMatchObject({ execution: 'not-submitted', message: expect.stringContaining('Prérequis serveur manquant') });
});

test('le contrôle préalable intégré refuse la soumission XMLSERVICE sans rejeu', async () => {
  const pending = request({ ...config, sshAttempts: 3 }, '<myscript/>');
  clients[0]!.emit('ready');
  clients[0]!.stream.emit('close', 78);
  await expect(pending).rejects.toMatchObject({ execution: 'not-submitted', retryable: false });
  expect(clients).toHaveLength(1);
});

test('une interruption avant ready peut ouvrir une nouvelle connexion sans rejouer une commande', async () => {
  vi.useRealTimers();
  const pending = request({ ...config, timeoutMs: 5000, sshAttempts: 3, sshRetryDelayMs: 1 }, '<myscript/>');
  clients[0]!.emit('error', new Error('Connection lost before handshake'));
  await vi.waitFor(() => expect(clients).toHaveLength(2));
  expect(clients[0]!.exec).not.toHaveBeenCalled();
  clients[1]!.emit('ready');
  clients[1]!.stream.emit('close', 0);
  await pending;
  expect(clients[1]!.exec).toHaveBeenCalledTimes(1);
});

test('les reprises configurées sont interdites après ready même pour un prérequis', async () => {
  const pending = checkPrerequisites({ ...config, sshAttempts: 3, sshRetryDelayMs: 1 });
  clients[0]!.emit('ready');
  clients[0]!.emit('error', Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
  await expect(pending).rejects.toMatchObject({ execution: 'not-submitted', retryable: false });
  expect(clients).toHaveLength(1);
});

test.each([false, true])('un timeout ssh2 autorise une reprise seulement avant authentification : ready=%s', async ready => {
  const pending = request(config, '<myscript/>');
  if (ready) clients[0]!.emit('ready');
  clients[0]!.emit('error', Object.assign(new Error('Timed out while waiting for handshake'), { level: 'client-timeout' }));
  await expect(pending).rejects.toMatchObject({
    execution: ready ? 'indeterminate' : 'not-submitted', retryable: !ready,
  });
  expect(clients).toHaveLength(1);
});

test.each([false, true])('un timeout TCP autorise une reprise seulement avant authentification : ready=%s', async ready => {
  const pending = request(config, '<myscript/>');
  if (ready) clients[0]!.emit('ready');
  clients[0]!.emit('error', Object.assign(new Error('connect timeout'), { level: 'client-socket', code: 'ETIMEDOUT' }));
  await expect(pending).rejects.toMatchObject({ execution: ready ? 'indeterminate' : 'not-submitted', retryable: !ready });
});

test('la négociation ne consomme pas le délai réservé à la requête XMLSERVICE', async () => {
  const pending = request(config, '<myscript/>');
  const assertion = expect(pending).resolves.toBe('<myscript/>');
  await vi.advanceTimersByTimeAsync(80);
  clients[0]!.emit('ready');
  await vi.advanceTimersByTimeAsync(80);
  clients[0]!.stream.emit('data', Buffer.from('<myscript/>'));
  clients[0]!.stream.emit('close', 0);
  await assertion;
});

test('un délai de requête dépassé ne rejoue jamais le XML même avec trois tentatives configurées', async () => {
  const pending = request({ ...config, sshAttempts: 3 }, '<myscript/>');
  const assertion = expect(pending).rejects.toMatchObject({ execution: 'indeterminate', retryable: false });
  clients[0]!.emit('ready');
  await vi.advanceTimersByTimeAsync(100);
  await assertion;
  expect(clients).toHaveLength(1);
  expect(clients[0]!.stream.end).toHaveBeenCalledTimes(1);
});

test('les ouvertures peuvent être espacées sans sérialiser les requêtes actives', async () => {
  vi.useRealTimers();
  const spaced = { ...config, ssh: { ...config.ssh, host: 'spaced.test' }, timeoutMs: 5000, sshConnectIntervalMs: 40 };
  const first = request(spaced, '<myscript/>');
  const second = request(spaced, '<myscript/>');
  await Promise.resolve();
  await Promise.resolve();
  expect(clients).toHaveLength(1);
  clients[0]!.emit('ready');
  await vi.waitFor(() => expect(clients).toHaveLength(2));
  expect(clients[1]!.createdAt - clients[0]!.createdAt).toBeGreaterThanOrEqual(30);
  // La première requête n'a pas terminé lorsque la deuxième est authentifiée.
  clients[1]!.emit('ready');
  for (const client of clients) {
    expect(client.stream.end).toHaveBeenCalledTimes(1);
    client.stream.emit('close', 0);
  }
  await Promise.all([first, second]);
});

test('la synchronisation locale attend les connexions avant toute soumission XMLSERVICE', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = request(config, '<myscript/>', { beforeSubmit: () => gate });
  clients[0]!.emit('ready');
  await Promise.resolve();
  expect(clients[0]!.exec).not.toHaveBeenCalled();
  release();
  await vi.advanceTimersByTimeAsync(0);
  expect(clients[0]!.exec).toHaveBeenCalledTimes(1);
  clients[0]!.stream.emit('close', 0);
  await pending;
});

test('une synchronisation expirée ne soumet pas le XML même si elle se débloque plus tard', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = request(config, '<myscript/>', { beforeSubmit: () => gate });
  const assertion = expect(pending).rejects.toMatchObject({ execution: 'not-submitted', retryable: false });
  clients[0]!.emit('ready');
  await vi.advanceTimersByTimeAsync(5100);
  await assertion;
  release(); await Promise.resolve(); await Promise.resolve();
  expect(clients[0]!.exec).not.toHaveBeenCalled();
  expect(clients).toHaveLength(1);
});

test('un échec de synchronisation n’exporte pas la cause locale ni ne relance la commande', async () => {
  const pending = request(config, '<myscript/>', { beforeSubmit: async () => { throw new Error('secret-local'); } });
  clients[0]!.emit('ready');
  await expect(pending).rejects.toMatchObject({ message: 'Synchronisation locale interrompue avant soumission', execution: 'not-submitted' });
  expect(clients[0]!.exec).not.toHaveBeenCalled();
});
