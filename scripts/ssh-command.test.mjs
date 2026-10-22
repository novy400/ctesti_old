import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { expect, test, vi } from 'vitest';
import { readSshRetryOptions, runSshCommand } from './ssh-command.mjs';

const lost = () => Object.assign(new Error('Connection lost before handshake'), { level: 'protocol' });

function harness(scenarios, env = {}) {
  const clients = [];
  const commands = [];
  const retries = [];
  const pauses = [];
  const retryTotals = [];
  return {
    clients, commands, retries, pauses, retryTotals,
    run: () => runSshCommand({ hostVerifier: hash => hash === 'approved' }, 'test-command', {
      ...readSshRetryOptions(env),
      timeout: 1000,
      expectedOutput: 'ok',
      pause: async ms => { pauses.push(ms); },
      onRetry: (attempt, total) => { retries.push(attempt); retryTotals.push(total); },
      createClient() {
        const scenario = scenarios[clients.length];
        assert.ok(scenario, 'Aucune connexion supplémentaire autorisée');
        const client = new EventEmitter();
        clients.push(client);
        client.destroy = () => { client.emit('close'); };
        client.connect = config => { queueMicrotask(() => scenario(client, config)); };
        client.exec = (command, callback) => {
          commands.push(command);
          if (client.execError) { callback(new Error('refused')); return; }
          const stream = new PassThrough();
          stream.stderr = new PassThrough();
          callback(null, stream);
          queueMicrotask(() => {
            if (client.hangAfterExec) return;
            if (client.disconnectAfterExec) client.emit('error', Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
            else if (client.streamError) stream.emit('error', new Error('lost response'));
            else {
              stream.write('ok');
              stream.emit('close', client.exitCode ?? 0);
            }
            stream.destroy();
            stream.stderr.destroy();
          });
        };
        return client;
      },
    }),
  };
}

test('deux coupures avant authentification puis une seule exécution', async () => {
  const h = harness([
    c => c.emit('error', lost()),
    c => c.emit('close'),
    c => c.emit('ready'),
  ]);
  assert.equal((await h.run()).output, 'ok');
  assert.deepEqual(h.retries, [2, 3]);
  assert.deepEqual(h.pauses, [1000, 1000]);
  assert.deepEqual(h.commands, ['test-command']);
  // Une ancienne connexion qui émet ready trop tard reste définitivement arrêtée.
  h.clients[0].emit('ready');
  assert.equal(h.commands.length, 1);
});

test('arrêt après trois connexions interrompues sans exécuter la commande', async () => {
  const h = harness(Array.from({ length: 3 }, () => c => c.emit('error', lost())));
  await assert.rejects(h.run(), /Négociation SSH/);
  assert.equal(h.clients.length, 3);
  assert.equal(h.commands.length, 0);
});

for (const [name, scenario, message] of [
  ['refus d’authentification', c => c.emit('error', Object.assign(lost(), { level: 'client-authentication' })), /Authentification/],
  ['empreinte incorrecte', (c, config) => config.hostVerifier('wrong'), /Identité SSH/],
  ['DNS invalide', c => c.emit('error', Object.assign(new Error(), { code: 'ENOTFOUND' })), /DNS/],
  ['algorithmes incompatibles', c => c.emit('error', Object.assign(new Error('no matching cipher'), { level: 'handshake' })), /Négociation SSH/],
]) {
  test(`${name} : aucune nouvelle tentative`, async () => {
    const h = harness([scenario]);
    await assert.rejects(h.run(), message);
    assert.equal(h.clients.length, 1);
    assert.equal(h.commands.length, 0);
    assert.deepEqual(h.retries, []);
  });
}

for (const setting of ['disconnectAfterExec', 'streamError', 'execError', 'exitCode']) {
  test(`${setting} après authentification : aucun second appel`, async () => {
    const h = harness([c => { c[setting] = setting === 'exitCode' ? 1 : true; c.emit('ready'); }], {
      CTESTI_SSH_ATTEMPTS: '7', CTESTI_SSH_RETRY_DELAY_MS: '250',
    });
    await assert.rejects(h.run());
    assert.equal(h.clients.length, 1);
    assert.deepEqual(h.commands, ['test-command']);
    assert.deepEqual(h.retries, []);
  });
}

test('un événement ready répété ne déclenche pas une seconde commande', async () => {
  const h = harness([c => { c.emit('ready'); c.emit('ready'); }]);
  await h.run();
  assert.deepEqual(h.commands, ['test-command']);
});

test('délai dépassé après envoi : aucune seconde exécution', async () => {
  vi.useFakeTimers();
  try {
    const h = harness([c => { c.hangAfterExec = true; c.emit('ready'); }], {
      CTESTI_SSH_ATTEMPTS: '5',
    });
    const failure = expect(h.run()).rejects.toThrow('Délai SSH dépassé');
    await vi.advanceTimersByTimeAsync(1001);
    await failure;
    expect(h.commands).toEqual(['test-command']);
    expect(h.clients).toHaveLength(1);
    expect(h.retries).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

test('les réglages absents conservent trois tentatives et une seconde', () => {
  assert.deepEqual(readSshRetryOptions({}), { maxAttempts: 3, retryDelayMs: 1000 });
});

test('le nombre et le délai du .env sont respectés, y compris dans la progression', async () => {
  const h = harness([
    ...Array.from({ length: 4 }, () => c => c.emit('error', lost())),
    c => c.emit('ready'),
  ], { CTESTI_SSH_ATTEMPTS: '5', CTESTI_SSH_RETRY_DELAY_MS: '250' });
  await h.run();
  assert.equal(h.clients.length, 5);
  assert.deepEqual(h.pauses, [250, 250, 250, 250]);
  assert.deepEqual(h.retries, [2, 3, 4, 5]);
  assert.deepEqual(h.retryTotals, [5, 5, 5, 5]);
  assert.deepEqual(h.commands, ['test-command']);
  for (const client of h.clients) client.emit('ready');
  assert.equal(h.commands.length, 1);
});

test('une seule tentative désactive toute reprise', async () => {
  const h = harness([c => c.emit('error', lost())], { CTESTI_SSH_ATTEMPTS: '1' });
  await assert.rejects(h.run());
  assert.equal(h.clients.length, 1);
  assert.deepEqual(h.pauses, []);
  assert.deepEqual(h.commands, []);
});

test('un délai nul permet une reprise sans attente', async () => {
  const h = harness([c => c.emit('close'), c => c.emit('ready')], {
    CTESTI_SSH_ATTEMPTS: '2', CTESTI_SSH_RETRY_DELAY_MS: '0',
  });
  await h.run();
  assert.deepEqual(h.pauses, [0]);
  assert.deepEqual(h.commands, ['test-command']);
});

for (const [key, values] of [
  ['CTESTI_SSH_ATTEMPTS', ['', '0', '-1', '1.5', 'abc', 'Infinity', '9007199254740992']],
  ['CTESTI_SSH_RETRY_DELAY_MS', ['', ' ', '-1', '1.5', 'abc', 'Infinity', '2147483648']],
]) {
  test(`${key} : les valeurs invalides sont refusées`, () => {
    for (const value of values) {
      assert.throws(() => readSshRetryOptions({ [key]: value }), new RegExp(key));
    }
  });
}
