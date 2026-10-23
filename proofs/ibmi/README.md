# Scénarios IBM i stateless — ticket #9

Le contrat courant est défini par l’[ADR 0001](../../docs/adr/0001-stateless-test-request.md) : chaque test soumet une seule requête XMLSERVICE `*here *cdata` contenant la préparation, les appels et la collecte des observations. TypeScript construit la séquence avant soumission, puis vérifie les observations retournées.

## Garanties et limites

- Le même job exécute toute la séquence pendant la requête : LIBL et QTEMP restent utilisables entre les étapes.
- Une seconde soumission depuis le même contexte de test est refusée. Aucune branche TypeScript ne peut dépendre d’une réponse intermédiaire.
- Aucun IPC, réservation, JOBD ou arrêt `*immed` n’est nécessaire. Le banc n’administre pas le job hôte.
- Une réponse complète confirme la fin du scénario, pas la disparition physique du job hôte ni la réussite des assertions.
- Une coupure ou un timeout après soumission laisse un résultat indéterminé. Aucun rejeu, remplacement, arrêt forcé ou nettoyage automatique n’est effectué. Les seules reprises possibles concernent une connexion interrompue avant authentification, sans commande soumise.
- L’inventaire est écrit avant soumission, sans secret ni copie brute des requêtes/réponses. Les observations nécessaires doivent être retournées dans la réponse ; QTEMP n’est pas une conservation durable.
- Stateless ne garantit ni rollback ni isolation des effets sur une bibliothèque, un fichier IFS partagé ou un service externe. Les ressources modifiables doivent être préparées explicitement et sérialisées si nécessaire.
- Une erreur de préparation doit arrêter le scénario serveur avant le programme cible. Ce comportement doit être qualifié sur la cible et ne peut pas être déduit du seul parsing de la réponse côté client.

## Configuration et exécution

Node >= 24 et les dépendances npm sont nécessaires. `.env` ou les variables CI définissent cible, port, utilisateur, authentification, empreinte SHA-256 approuvée, CLI XMLSERVICE, bibliothèque de référence, CCSID et délais. `CTESTI_IPC_ROOT` et `CTESTI_JOB_DESCRIPTION` appartiennent à l’ancien mode et ne sont plus nécessaires.

`CTESTI_TIMEOUT_MS` définit le budget de négociation SSH et, après authentification,
un budget renouvelé pour l’unique commande. Un timeout de négociation peut utiliser
les tentatives configurées ; aucun timeout après authentification n’autorise un rejeu.
Le délai Vitest est calculé pour couvrir ces budgets et les attentes entre tentatives.
`CTESTI_SSH_CONNECT_INTERVAL_MS` espace les ouvertures vers une même cible dans
un processus, sans sérialiser les scénarios actifs : `0` par défaut, `1500` dans
le `.env` de la cible qualifiée. Il ne coordonne pas les processus locaux et CI.

```powershell
npm run ssh:check
npm run check
npm test
npm run proof:context
```

Sur la cible disponible, `CTESTI_PROOF_LIBRARY=NOVY4002`. NOVY4001 et NOVY4002 sont les seules bibliothèques autorisées. Le banc ne crée aucune bibliothèque et ne modifie aucun objet applicatif ; ses témoins sont dans QTEMP. Les objets RPG CTMAPP/CTMAPS doivent être préparés séparément pour les preuves de mapping. ckool reste strictement en lecture seule.

## Qualification

Fixer avant chaque campagne les attentes : même identité qualifiée avant/après préparation, appels et collecte dans une requête ; LIBL et QTEMP conformes ; tests successifs et simultanés sans contamination ; panne sans rejeu ; une seule soumission par test. Qualifier les deux modes d’authentification en local et en CI. Aucun résultat observé ne devient automatiquement une attente.

Conserver JUnit (`artifacts/ibmi-junit.xml`) et les inventaires (`artifacts/contexts/*.json`) avec un accès restreint. Consigner les versions, droits, CCSID effectivement qualifié, résultats et limites. La réussite locale ne vaut pas qualification CI ni validation du MVP.

Le [bilan final SSH et messages](qualification-ssh-messages-2026-10-22.md) consigne la campagne réussie de 7 tests IBM i et ses limites. Les [premiers essais stateless](qualification-stateless-2026-10-22.md) et le [mode persistant abandonné](qualification-2026-10-22.md) restent disponibles comme historique.

Le banc du ticket #10 et ses campagnes ciblées sont décrits dans
[Attribution des observations](observations.md) : `npm run proof:observations`.

## Construire une séquence

```typescript
const script = new ProofScript()
  .command(`ADDLIBLE LIB(${ibmi.config.library}) POSITION(*FIRST)`)
  .statement('create table QTEMP.CTWIT (TOKEN varchar(36))')
  .statement(`insert into QTEMP.CTWIT values('${ibmi.id}') with nc`)
  .observe('token', 'select TOKEN from QTEMP.CTWIT with nc');
const response = await ibmi.run(script.body); // Unique soumission du test.
expect(script.rows(response, 'token')).toEqual([ibmi.id]);
```

`ProofScript` construit les étapes sans accès au réseau. `ProofContext.run`
encadre la séquence par deux observations d’identité et refuse toute seconde
soumission. Les requêtes SQL et commandes de préparation utilisent `error="on"`.
Le choix `WITH NC` concerne uniquement les témoins QTEMP non journalisés du banc.

Les textes SQL/CL sont transmis en CDATA : le parseur rapide XMLSERVICE ne
décode pas les entités comme `&gt;` dans les commandes. Les marqueurs réservés
du parseur et le terminateur CDATA sont refusés avant soumission.
Pour une commande CL autorisée uniquement dans un programme ou en REXX,
utiliser `.command(texteCL, 'rexx')` ; le banc protège le littéral imbriqué dans
`STRREXPRC PARM`. Le test de messages utilise ce mode pour `SNDPGMMSG` et ne
s’adresse qu’à la file `*EXT` de son propre job.

Ces contraintes suivent les documentations
[SNDPGMMSG d’IBM](https://www.ibm.com/docs/en/i/7.4.0?topic=ssw_ibm_i_74%2Fcl%2Fsndpgmmsg.html)
et [CDATA d’XMLSERVICE](https://github.com/IBM/xmlservice/blob/main/docs/faq.rst).
