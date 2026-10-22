# Test SSH et IBM i

Depuis la racine du projet, avec Node.js 24 ou supérieur et `npm install` :

```sh
npm run ssh:check
npm run ssh:check -- --ibmi
npm run ssh:check -- --env .env.test --ibmi
```

Le premier test vérifie la connexion, l'authentification et l'exécution d'un
`printf`. L'option `--ibmi` exécute la commande CL `CTESTI_IBMI_COMMAND` via
`system`. Par défaut, `DSPDTAARA DTAARA(QUSRSYS/QSS1MRI)` affiche uniquement le
statut de connexion et la version extraite (par exemple `IBM i : V7R5M0`).
Pour une autre commande, le script affiche le statut et le résultat renvoyé.
Elle nécessite un serveur IBM i et un profil autorisé à exécuter cette commande.

Pour changer de test, modifier cette ligne dans le `.env` puis relancer
`npm run --silent ssh:check -- --ibmi` :

```dotenv
# Version du système (affichage compact)
CTESTI_IBMI_COMMAND="DSPDTAARA DTAARA(QUSRSYS/QSS1MRI)"
# Autres exemples en lecture seule, à utiliser à la place de la ligne ci-dessus :
# CTESTI_IBMI_COMMAND="DSPSYSVAL SYSVAL(QCCSID)"
# CTESTI_IBMI_COMMAND="DSPSYSVAL SYSVAL(QDATE)"
```

La variable contient une commande CL, sans préfixe `system`. Une valeur vide ou
absente conserve le test de version. La commande s'exécute avec les droits du
profil SSH et peut modifier le serveur si vous choisissez une commande d'écriture.

Le fichier `.env` existant est chargé par défaut. Pour tester plusieurs serveurs
ou profils, créer des fichiers `.env.test`, `.env.dev`, etc. à partir de
`.env.example`, puis les sélectionner avec `--env`. Ces fichiers sont ignorés
par Git. Les variables déjà définies dans l'environnement ont priorité sur le
fichier sélectionné.

Variables utilisées :

| Variable | Valeur |
| --- | --- |
| `CTESTI_HOST` | Adresse du serveur |
| `CTESTI_PORT` | Port SSH, `22` par défaut |
| `CTESTI_USER` | Profil utilisateur |
| `CTESTI_HOST_KEY_SHA256` | Empreinte serveur SHA-256 hexadécimale de 64 caractères, obtenue par un canal de confiance |
| `CTESTI_AUTH` | `password` ou `key` |
| `CTESTI_PASSWORD` | Mot de passe si `password` |
| `CTESTI_PRIVATE_KEY` | Chemin de clé privée si `key` |
| `CTESTI_PASSPHRASE` | Passphrase de clé, si nécessaire |
| `CTESTI_TIMEOUT_MS` | Délai par tentative en millisecondes, `30000` par défaut |
| `CTESTI_SSH_ATTEMPTS` | Nombre total de tentatives, première incluse, entier ≥ 1 ; `3` par défaut |
| `CTESTI_SSH_RETRY_DELAY_MS` | Attente entre les tentatives en ms, entier de 0 à 2147483647 ; `1000` par défaut |
| `CTESTI_IBMI_COMMAND` | Commande CL exécutée avec `--ibmi`, test de version par défaut |

Les variables XMLSERVICE et de bibliothèque de preuve ne sont pas nécessaires.
Le programme retourne un code de sortie `0` en cas de réussite, `1` en cas
d'échec. `npm run ssh:check -- --help` affiche l'aide.

Si la connexion coupe avant l'authentification, le script utilise ces réglages
du `.env` (trois tentatives au total, espacées d'une seconde par défaut) :

```dotenv
CTESTI_SSH_ATTEMPTS=3
CTESTI_SSH_RETRY_DELAY_MS=1000
```

`CTESTI_SSH_ATTEMPTS=1` désactive les reprises. Le délai peut valoir `0`.
Les valeurs invalides sont refusées avant toute connexion.
L'affichage indique le nombre total configuré, par exemple
`SSH : connexion interrompue, nouvelle tentative 2/3…`.
Un refus d'authentification, une empreinte incorrecte ou une erreur de
configuration arrête immédiatement le test.

Dès que la connexion est authentifiée, toute reprise est désactivée : même si la
commande échoue ou si sa réponse est perdue, elle n'est jamais renvoyée lors de
cette invocation. En cas de coupure après son envoi, le résultat peut rester
inconnu ; vérifier le serveur avant une relance manuelle.

`npm run test:ssh` vérifie ces cas avec Vitest, sans connexion réseau ni chargement
du `.env`. Les tests SSH sont également inclus dans `npm test`. Un test utilise
les horloges simulées pour vérifier qu'un délai dépassé après l'envoi de la
commande ne provoque jamais sa réexécution.
