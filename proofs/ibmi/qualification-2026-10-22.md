# Campagne locale du 22 octobre 2026 — ticket #9

> Historique du mode persistant, remplacé par l’[ADR 0001](../../docs/adr/0001-stateless-test-request.md).
> Les paramètres IPC/JOBD et le critère de fin de job ci-dessous ne décrivent plus le contrat courant.

## Périmètre et attentes

Attentes définies avant exécution : authentification SSH par clé et vérification
de l'empreinte approuvée ; identité du même job XMLSERVICE, LIBL et témoin QTEMP
conservés entre requêtes. Aucun résultat observé n'est adopté comme résultat attendu.
ckool reste en lecture seule. Aucune création de bibliothèque n'est autorisée.
Seules NOVY4001 et NOVY4002 sont disponibles ; la référence du banc est NOVY4002.

## Configuration locale retenue

```dotenv
CTESTI_AUTH=key
CTESTI_IPC_ROOT=/home/NOVY400/.ctesti/ipc
CTESTI_PROOF_LIBRARY=NOVY4002
CTESTI_JOB_DESCRIPTION=QGPL/NOVY400
CTESTI_CCSID=273
CTESTI_SSH_ATTEMPTS=3
CTESTI_SSH_RETRY_DELAY_MS=1000
```

Les secrets et l'adresse de connexion restent dans `.env`, ignoré par Git.
La valeur CCSID décrit le job observé ; elle ne modifie pas le profil ou le serveur.
Aucun objet n'a été écrit dans NOVY4001 ou NOVY4002 pendant cette campagne.

## Résultats réels

- `npm run ssh:check` : réussi avec clé et empreinte approuvée.
- IBM i : V7R5M0 ; `xmlservice-cli` : 1.1.0 ; CCSID du job SSH : 273.
- CLI exécutable, objets `QXMLSERV/XMLSTOREDP` et `QXMLSERV/XMLSERVICE` présents.
- SQL XMLSERVICE `values QSYS2.JOB_NAME` en mode `*here *cdata` : réussi.
  Ce contrôle local ne remplace pas le mode persistant demandé par le ticket.
- Soumission avec `QSYS/QSRVJOB` : refus `CPF1146`, file QSYS/QSYSNOMAX
  non autorisée, puis `CPF1338`. Le contrôle `CHKOBJ ... AUT(*USE)` de la JOBD réussit :
  la présence et l'accès à la JOBD ne suffisent pas à qualifier la soumission.
- La JOBD du profil est QGPL/NOVY400 et utilise la file QGPL/NOVY400.
  Avec ce réglage, le journal confirme le démarrage du job XMLSERVICE
  `969570/NOVY400/XTOOLKIT`, soumis depuis le client de la preuve.
- `npx vitest run --config proofs/ibmi/vitest.config.ts --testNamePattern "^continuité : identité"` :
  échec du premier appel, `xmlservice-cli terminé en erreur` ; aucune identité
  effective ni preuve LIBL/QTEMP collectée. La réponse du CLI de diagnostic est
  `XMLSTOREDP error`.
- Une sonde distincte avec IPC précréé privé et requête SQL minimale sans
  réservation échoue aussi avec `XMLSTOREDP error` : ni la réservation ni la
  création automatique du chemin ne suffisent à expliquer l'échec restant.
- Des interruptions SSH avant authentification subsistent. Le transport accepte
  les reprises configurées uniquement avant `ready`. Aucune requête XMLSERVICE
  potentiellement soumise n'est rejouée.

## Conservation et limites

Les inventaires des contextes échoués sont dans `artifacts/contexts/`, notamment
`a520d222-309b-45f6-a04c-879c0b1a6ec6.json`. Ce contexte reste indéterminé.
Son job observé par le journal est `969570/NOVY400/XTOOLKIT` ; ce constat externe
ne constitue pas une identité relevée depuis le contexte effectif.
Aucune terminaison forcée ni suppression automatique n'a été demandée.
Les sondes distinctes disposent aussi d'inventaires sous `artifacts/xmlservice-*.json`.
Un état planifié ou indéterminé ne démontre pas que le job s'est terminé.

Le problème d'autorisation de la file par défaut est corrigé par une configuration
explicite, sans changement serveur. L'échec restant de l'échange IPC avec le job
persistant nécessite encore un diagnostic ; sa cause n'est pas établie.
Les autres scénarios de continuité, la CI, le mot de passe, les pannes injectées
et la vérification de fin du job restent à qualifier. Le ticket #9 reste ouvert.
