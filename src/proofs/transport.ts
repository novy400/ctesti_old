import { Client } from 'ssh2';
import { setTimeout as delay } from 'node:timers/promises';
import type { configuration } from './config.js';

export class TransportError extends Error {
  constructor(public readonly execution: 'not-submitted' | 'indeterminate', reason: string, public readonly retryable = false) {
    super(reason);
    this.name = 'TransportError';
  }
}

type Configuration = ReturnType<typeof configuration>;
export interface RequestOptions {
  beforeSubmit?: () => Promise<void>;
  // Enveloppe XML distincte du budget de messages par appel ; 10 Mio par défaut.
  maxResponseBytes?: number;
}
const nextConnections = new Map<string, number>();

// Espace seulement les ouvertures vers une cible, pas les scénarios déjà actifs.
async function connectionSlot(config: Configuration): Promise<void> {
  if (!config.sshConnectIntervalMs) return;
  const key = `${config.ssh.host}:${config.ssh.port}`;
  const now = Date.now();
  const start = Math.max(now, nextConnections.get(key) ?? now);
  nextConnections.set(key, start + config.sshConnectIntervalMs);
  if (start > now) await delay(start - now);
}

// Une connexion par scénario ; l'état IBM i reste limité à sa requête stateless.
async function execute(config: Configuration, command: string, input: string, preflight = false, options: RequestOptions = {}): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    if (config.sshConnectIntervalMs) await connectionSlot(config);
    try { return await executeOnce(config, command, input, preflight, options); }
    catch (error) {
      if (!(error instanceof TransportError) || !error.retryable || attempt >= config.sshAttempts) throw error;
      await delay(config.sshRetryDelayMs);
    }
  }
}

function executeOnce(config: Configuration, command: string, input: string, preflight: boolean, options: RequestOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const chunks: Buffer[] = [];
    let bytes = 0;
    let submitted = false;
    let authenticated = false;
    let settled = false;
    const finish = (reason?: string, retryable = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.destroy();
      if (reason) reject(new TransportError(submitted ? 'indeterminate' : 'not-submitted', reason, retryable && !authenticated));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    };
    let timer = setTimeout(() => finish('Délai de connexion SSH dépassé avant authentification', true), config.timeoutMs);
    client.on('error', (error: Error & { code?: string; level?: string }) => {
      const code = /^E[A-Z0-9_]{1,24}$/.test(error.code ?? '') ? error.code : undefined;
      finish(`Connexion SSH impossible ou interrompue${code ? ` (${code})` : ''}`,
        error.level !== 'client-authentication' && (error.level === 'client-timeout' || error.message === 'Connection lost before handshake'
          || ['ECONNRESET', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT'].includes(error.code ?? '')));
    });
    client.on('close', () => finish('Connexion fermée avant réponse complète', true));
    client.on('ready', () => {
      if (settled || authenticated) return;
      authenticated = true; // Barrière irréversible : aucune reprise après ready.
      clearTimeout(timer);
      if (options.beforeSubmit) {
        const coordinationTimeout = config.sshAttempts * (config.timeoutMs + config.sshConnectIntervalMs)
          + (config.sshAttempts - 1) * config.sshRetryDelayMs + 5000;
        timer = setTimeout(() => finish('Synchronisation locale dépassée avant soumission'), coordinationTimeout);
        Promise.resolve().then(options.beforeSubmit).then(submit,
          () => finish('Synchronisation locale interrompue avant soumission'));
      } else submit();
    });
    const submit = () => {
      if (settled) return;
      clearTimeout(timer);
      timer = setTimeout(() => finish('Délai SSH/XMLSERVICE dépassé ; aucun rejeu'), config.timeoutMs);
      client.exec(command, (error, stream) => {
        if (settled) return;
        if (error) { finish('Exécution xmlservice-cli impossible'); return; }
        stream.on('error', () => finish('Canal SSH interrompu'));
        stream.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > (options.maxResponseBytes ?? 10 * 1024 * 1024)) { finish('Limite de réponse XML dépassée'); return; }
          chunks.push(chunk);
        });
        // Ne jamais exporter stderr : il peut contenir des données de la requête.
        stream.stderr.resume();
        stream.on('close', (code: number | null, signal?: string) => {
          if (code === 78) submitted = false; // Contrôle préalable refusé avant lancement du CLI.
          finish(code === 0 && !signal ? undefined : preflight || code === 78
            ? 'Prérequis serveur manquant : exécutable XMLSERVICE, XMLSTOREDP ou bibliothèque de référence'
            : 'xmlservice-cli terminé en erreur');
        });
        submitted = !preflight; // Le contrôle préalable ne soumet aucun travail XMLSERVICE.
        stream.end(input);
      });
    };
    try {
      client.connect({ ...config.ssh, hostVerifier: (hash: string) => {
        const accepted = hash === config.fingerprint;
        if (!accepted) finish('Identité SSH inconnue ou différente de l’empreinte approuvée');
        return accepted;
      } });
    } catch { finish('Configuration SSH refusée'); }
  });
}

export function checkPrerequisites(config: Configuration): Promise<void> {
  return execute(config, prerequisiteCommand(config), '', true).then(() => undefined);
}

function prerequisiteCommand(config: Configuration): string {
  // Les chemins proviennent de configuration(), qui exclut quotes et métacaractères.
  const command = `test -x '${config.cli}' && test -r '/QSYS.LIB/QXMLSERV.LIB/XMLSTOREDP.SRVPGM' && test -r '/QSYS.LIB/${config.library}.LIB' && test -x '/QSYS.LIB/${config.library}.LIB'`;
  return command;
}

export function request(config: Configuration, xml: string, options: RequestOptions = {}): Promise<string> {
  if (options.maxResponseBytes !== undefined && (!Number.isSafeInteger(options.maxResponseBytes)
    || options.maxResponseBytes < 1 || options.maxResponseBytes > 64 * 1024 * 1024)) {
    return Promise.reject(new TransportError('not-submitted', 'Budget de réponse XML invalide (maximum 64 Mio)'));
  }
  return execute(config, `if ${prerequisiteCommand(config)}; then '${config.cli}' -c '*here *cdata'; else exit 78; fi`, xml, false, options);
}
