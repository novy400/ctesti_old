import { setTimeout as delay } from 'node:timers/promises';
import ssh2 from 'ssh2';

export function readSshRetryOptions(env = process.env) {
  const maxAttempts = Number(env.CTESTI_SSH_ATTEMPTS ?? '3');
  const retryDelayMs = Number(env.CTESTI_SSH_RETRY_DELAY_MS ?? '1000');
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('CTESTI_SSH_ATTEMPTS doit être un entier supérieur ou égal à 1 (première tentative incluse).');
  }
  if (env.CTESTI_SSH_RETRY_DELAY_MS?.trim() === '' || !Number.isSafeInteger(retryDelayMs)
    || retryDelayMs < 0 || retryDelayMs > 2147483647) {
    throw new Error('CTESTI_SSH_RETRY_DELAY_MS doit être un entier entre 0 et 2147483647.');
  }
  return { maxAttempts, retryDelayMs };
}

// Une nouvelle tentative ne peut partir qu'avant l'événement ready.
export async function runSshCommand(config, command, {
  timeout,
  expectedOutput,
  maxAttempts = 3,
  retryDelayMs = 1000,
  createClient = () => new ssh2.Client(),
  pause = delay,
  onRetry = (attempt, total) => console.log(`SSH : connexion interrompue, nouvelle tentative ${attempt}/${total}…`),
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await runAttempt();
    } catch (error) {
      if (!error.retryable || attempt === maxAttempts) throw error;
      onRetry(attempt + 1, maxAttempts);
      await pause(retryDelayMs);
    }
  }

  function runAttempt() {
    return new Promise((resolve, reject) => {
      const client = createClient();
      let settled = false;
      let authenticated = false;
      let output = '';
      let diagnostic = '';
      let timer = setTimeout(() => finish('Délai SSH dépassé avant authentification', true), timeout);

      function finish(reason, connectionLost = false) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        client.destroy();
        if (reason) {
          reject(Object.assign(new Error(reason), {
            retryable: connectionLost && !authenticated,
            diagnostic,
          }));
        } else resolve({ output, diagnostic });
      }

      client.on('error', error => {
        const messages = {
          ENOTFOUND: 'Résolution DNS impossible', EAI_AGAIN: 'Résolution DNS temporairement indisponible',
          ECONNREFUSED: 'Connexion réseau refusée', ETIMEDOUT: 'Délai réseau dépassé',
          ECONNRESET: 'Connexion réseau interrompue',
        };
        const authenticationFailed = error.level === 'client-authentication';
        const connectionLost = !authenticationFailed && (
          error.level === 'client-timeout'
          ||
          ['ECONNRESET', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT'].includes(error.code)
          || error.message === 'Connection lost before handshake'
        );
        finish(messages[error.code] ?? (authenticationFailed
          ? 'Authentification SSH refusée' : 'Négociation SSH impossible ou interrompue'), connectionLost);
      });
      client.on('close', () => finish('Connexion SSH fermée avant la fin du contrôle', true));
      client.on('ready', () => {
        if (settled || authenticated) return;
        // Barrière irréversible : même si exec échoue ou si sa réponse est perdue,
        // aucune nouvelle connexion et aucune seconde exécution ne sont permises.
        authenticated = true;
        clearTimeout(timer);
        timer = setTimeout(() => finish('Délai SSH dépassé'), timeout);
        client.exec(command, (error, stream) => {
          if (settled) return;
          if (error) { finish('Commande SSH refusée'); return; }
          stream.setEncoding('utf8');
          stream.stderr.setEncoding('utf8');
          stream.on('data', chunk => { output = (output + chunk).slice(0, 16384); });
          stream.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(0, 16384); });
          stream.on('error', () => finish('Canal SSH interrompu'));
          stream.on('close', code => finish(code === 0 && (expectedOutput === undefined || output === expectedOutput)
            ? undefined : `Commande de contrôle SSH en échec (code ${code ?? 'inconnu'})`));
        });
      });
      try {
        client.connect({ ...config, hostVerifier: hash => {
          if (settled) return false;
          const verified = config.hostVerifier(hash);
          if (!verified) finish('Identité SSH différente de l’empreinte approuvée');
          return verified;
        } });
      } catch { finish('Configuration SSH ou clé privée refusée'); }
    });
  }
}
