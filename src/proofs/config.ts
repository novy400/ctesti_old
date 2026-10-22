import { readFileSync } from 'node:fs';
import type { ConnectConfig } from 'ssh2';

export function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Configuration manquante : ${key}`);
  return value;
}

export function identifier(value: string): string {
  if (!/^[A-Z][A-Z0-9_]{0,9}$/.test(value)) throw new Error('Identifiant IBM i invalide');
  return value;
}

export function configuration(env: NodeJS.ProcessEnv = process.env) {
  const fingerprint = required(env, 'CTESTI_HOST_KEY_SHA256').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('CTESTI_HOST_KEY_SHA256 : SHA-256 hexadécimal attendu');
  const port = Number(env.CTESTI_PORT ?? '22');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('CTESTI_PORT invalide');
  const ssh: ConnectConfig = {
    host: required(env, 'CTESTI_HOST'), port,
    username: required(env, 'CTESTI_USER'),
    hostHash: 'sha256', hostVerifier: (hash: string) => hash === fingerprint,
  };
  if (env.CTESTI_AUTH === 'password') ssh.password = required(env, 'CTESTI_PASSWORD');
  else if (env.CTESTI_AUTH === 'key') {
    const keyPath = required(env, 'CTESTI_PRIVATE_KEY');
    try { ssh.privateKey = readFileSync(keyPath); }
    catch { throw new Error('CTESTI_PRIVATE_KEY : clé privée illisible'); }
    if (env.CTESTI_PASSPHRASE) ssh.passphrase = env.CTESTI_PASSPHRASE;
  } else throw new Error('CTESTI_AUTH doit valoir password ou key');
  const cli = env.CTESTI_XMLSERVICE_CLI ?? '/QOpenSys/pkgs/bin/xmlservice-cli';
  for (const path of [cli]) {
    if (!/^\/[A-Za-z0-9_./-]+$/.test(path) || path.split('/').includes('..')) throw new Error('Chemin IFS invalide');
  }
  const ccsid = Number(required(env, 'CTESTI_CCSID'));
  if (!Number.isInteger(ccsid) || ccsid < 1 || ccsid > 65534) throw new Error('CTESTI_CCSID invalide');
  const timeoutMs = Number(env.CTESTI_TIMEOUT_MS ?? '30000');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw new Error('CTESTI_TIMEOUT_MS invalide');
  ssh.readyTimeout = timeoutMs;
  const sshAttempts = Number(env.CTESTI_SSH_ATTEMPTS ?? '1');
  const sshRetryDelayMs = Number(env.CTESTI_SSH_RETRY_DELAY_MS ?? '1000');
  const sshConnectIntervalMs = Number(env.CTESTI_SSH_CONNECT_INTERVAL_MS ?? '0');
  if (!Number.isSafeInteger(sshAttempts) || sshAttempts < 1) throw new Error('CTESTI_SSH_ATTEMPTS invalide');
  if (!Number.isSafeInteger(sshRetryDelayMs) || sshRetryDelayMs < 0 || sshRetryDelayMs > 2147483647) throw new Error('CTESTI_SSH_RETRY_DELAY_MS invalide');
  if (!Number.isSafeInteger(sshConnectIntervalMs) || sshConnectIntervalMs < 0 || sshConnectIntervalMs > 30000) throw new Error('CTESTI_SSH_CONNECT_INTERVAL_MS invalide');
  return { ssh, fingerprint, cli, ccsid, timeoutMs, sshAttempts, sshRetryDelayMs, sshConnectIntervalMs, library: identifier(required(env, 'CTESTI_PROOF_LIBRARY')) };
}
