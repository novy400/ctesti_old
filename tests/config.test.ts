import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { configuration } from '../src/proofs/config.js';

vi.mock('node:fs', () => ({ readFileSync: vi.fn() }));
const env = {
  CTESTI_HOST_KEY_SHA256: 'a'.repeat(64), CTESTI_HOST: 'example.test',
  CTESTI_PORT: '2222', CTESTI_USER: 'TEST', CTESTI_AUTH: 'password', CTESTI_PASSWORD: 'secret',
  CTESTI_IPC_ROOT: '/tmp/ctesti', CTESTI_CCSID: '297', CTESTI_PROOF_LIBRARY: 'CTPROOF',
};

test('authentification explicite par mot de passe', () => {
  const config = configuration(env);
  expect(config.ssh).toMatchObject({ host: 'example.test', port: 2222, username: 'TEST', password: 'secret', hostHash: 'sha256' });
  expect(config.ssh.privateKey).toBeUndefined();
});

test('le délai configuré pilote aussi la négociation SSH', () => {
  expect(configuration({ ...env, CTESTI_TIMEOUT_MS: '45000' }).ssh.readyTimeout).toBe(45000);
});

test('stateless fonctionne sans IPC ni description de job', () => {
  const { CTESTI_IPC_ROOT: ignored, ...stateless } = env;
  const config = configuration(stateless);
  expect(config).not.toHaveProperty('ipcRoot');
  expect(config).not.toHaveProperty('jobDescription');
});

test('authentification par clé avec passphrase sans mot de passe secondaire', () => {
  vi.mocked(readFileSync).mockReturnValueOnce(Buffer.from('private-key'));
  const config = configuration({ ...env, CTESTI_AUTH: 'key', CTESTI_PRIVATE_KEY: '/private/key', CTESTI_PASSPHRASE: 'passphrase' });
  expect(config.ssh.privateKey).toEqual(Buffer.from('private-key'));
  expect(config.ssh.passphrase).toBe('passphrase');
  expect(config.ssh.password).toBeUndefined();
});

test('une erreur de lecture de clé masque les détails du système de fichiers', () => {
  vi.mocked(readFileSync).mockImplementationOnce(() => { throw new Error('sensitive-path'); });
  expect(() => configuration({ ...env, CTESTI_AUTH: 'key', CTESTI_PRIVATE_KEY: '/sensitive-path' }))
    .toThrow(/^CTESTI_PRIVATE_KEY : clé privée illisible$/);
});

test.each(["/tmp/a'bad", '/tmp/../shared', '/tmp/a;cmd', '/tmp/$(cmd)'])('chemin IPC refusé : %s', path => {
  expect(() => configuration({ ...env, CTESTI_XMLSERVICE_CLI: path })).toThrow('Chemin IFS invalide');
});

test.each(['0', '-1', 'NaN', '300001'])('délai invalide : %s', value => {
  expect(() => configuration({ ...env, CTESTI_TIMEOUT_MS: value })).toThrow('CTESTI_TIMEOUT_MS');
});
