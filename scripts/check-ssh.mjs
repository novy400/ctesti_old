import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import { readSshRetryOptions, runSshCommand } from './ssh-command.mjs';

// La commande CL configurée est transmise à system comme un seul argument.
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Configuration manquante : ${name}`);
  return value;
}

async function check() {
  const { values } = parseArgs({ options: {
    env: { type: 'string', default: '.env' },
    ibmi: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  } });
  if (values.help) {
    console.log('Usage : npm run ssh:check -- [--env .env.test] [--ibmi]');
    console.log('--ibmi : exécute CTESTI_IBMI_COMMAND (version IBM i par défaut).');
    return;
  }
  try { process.loadEnvFile(values.env); }
  catch (error) {
    if (error.code !== 'ENOENT' || values.env !== '.env') {
      throw new Error(`Fichier de configuration illisible : ${values.env}`);
    }
  }
  const retryOptions = readSshRetryOptions();
  const fingerprint = required('CTESTI_HOST_KEY_SHA256').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('CTESTI_HOST_KEY_SHA256 : SHA-256 hexadécimal attendu');
  const port = Number(process.env.CTESTI_PORT ?? '22');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('CTESTI_PORT invalide');
  const timeout = Number(process.env.CTESTI_TIMEOUT_MS ?? '30000');
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2147483647) {
    throw new Error('CTESTI_TIMEOUT_MS invalide');
  }
  const defaultIbmiCommand = 'DSPDTAARA DTAARA(QUSRSYS/QSS1MRI)';
  const ibmiCommand = process.env.CTESTI_IBMI_COMMAND?.trim() || defaultIbmiCommand;
  if (values.ibmi && /[\r\n\0]/.test(ibmiCommand)) {
    throw new Error('CTESTI_IBMI_COMMAND doit contenir une seule ligne sans caractère nul.');
  }
  const command = values.ibmi
    ? `system '${ibmiCommand.replaceAll("'", "'\\''")}'`
    : 'printf ctesti-ssh-ok';
  const config = {
    host: required('CTESTI_HOST'), port, username: required('CTESTI_USER'),
    readyTimeout: timeout, hostHash: 'sha256',
    hostVerifier: hash => hash === fingerprint,
  };
  const auth = required('CTESTI_AUTH');
  if (auth === 'password') config.password = required('CTESTI_PASSWORD');
  else if (auth === 'key') {
    const path = required('CTESTI_PRIVATE_KEY').replace(/^~(?=[/\\])/, homedir());
    try { config.privateKey = readFileSync(path); }
    catch { throw new Error('CTESTI_PRIVATE_KEY : clé privée illisible'); }
    if (process.env.CTESTI_PASSPHRASE) config.passphrase = process.env.CTESTI_PASSPHRASE;
  } else throw new Error('CTESTI_AUTH doit valoir password ou key');

  const { output: result, diagnostic } = await runSshCommand(config, command, {
    ...retryOptions,
    timeout,
    expectedOutput: values.ibmi ? undefined : 'ctesti-ssh-ok',
  }).catch(error => {
    if (values.ibmi && error.diagnostic?.trim()) console.error(error.diagnostic.trim());
    throw error;
  });
  if (values.ibmi) {
    console.log('SSH : connexion réussie, empreinte serveur vérifiée.');
    if (ibmiCommand.toUpperCase() === defaultIbmiCommand) {
      const version = `${result}\n${diagnostic}`.match(/\bV\d+R\d+M\d+\b/)?.[0];
      if (!version) throw new Error('Version IBM i introuvable dans la réponse du serveur.');
      console.log(`IBM i : ${version}`);
    } else {
      console.log('IBM i : commande exécutée avec succès.');
      if (result.trim()) console.log(result.trim());
      if (diagnostic.trim()) console.log(diagnostic.trim());
    }
  } else {
    console.log(`SSH : connexion et commande de contrôle réussies (authentification ${auth}).`);
    console.log('Empreinte serveur approuvée vérifiée.');
  }
}

check().catch(error => { console.error(error.message); process.exitCode = 1; });
