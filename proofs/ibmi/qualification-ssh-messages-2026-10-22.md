# Corrections SSH et messages — qualification du 22 octobre 2026

La campagne finale `npm run proof:context` réussit : **7 tests IBM i passent,
2 tests de mapping sont hors sélection**. `npm run check` réussit et `npm test`
compte **80 tests locaux réussis**. Tous ces tests utilisent Vitest.
Ce bilan remplace l’état de la campagne stateless initiale pour les défauts SSH
et messages ; le ticket #9 reste ouvert pour les qualifications manquantes.

## Causes et corrections

Le transport imposait 15 secondes de négociation et ignorait le délai du `.env`.
Les timeouts ssh2 (`client-timeout`) et TCP (`ETIMEDOUT`) n’étaient pas reconnus
comme reprenables avant authentification. Le budget de commande était aussi
consommé pendant la négociation. Ces défauts sont reproduits par des tests de
régression, puis corrigés : budget de négociation configuré, budget renouvelé
après authentification, tentatives bornées avant authentification seulement.
Aucune coupure ou expiration après authentification ne rejoue la commande.

La cible conserve 30 secondes par budget, trois tentatives et une seconde entre
tentatives. `CTESTI_SSH_CONNECT_INTERVAL_MS=1500` espace les ouvertures vers cette
cible dans un processus, sans sérialiser les requêtes actives. Il vaut zéro par
défaut et ne coordonne pas les autres processus ou utilisateurs.

Les tests parallèles attendent localement leurs deux authentifications avant
leur unique soumission. Cette attente est bornée ; elle ne collecte aucune
observation IBM i et un déblocage tardif ne soumet aucune requête expirée.
Un échec d’un pair interrompt l’attente. Le chevauchement réel de deux fenêtres
horodatées côté serveur reste vérifié avec une pause PASE de cinq secondes.
Le délai Vitest couvre les budgets configurés. Ces corrections ne garantissent
pas l’absence de toute panne réseau ou serveur future.

La sonde minimale de messages a confirmé le refus de `SNDPGMMSG` en commande
directe. [IBM l’autorise dans un programme CL ou en REXX](https://www.ibm.com/docs/en/i/7.4.0?topic=ssw_ibm_i_74%2Fcl%2Fsndpgmmsg.html).
Le test emploie désormais `exec="rexx"` dans le même job. Le banc protège aussi
les apostrophes du littéral CL imbriqué dans `STRREXPRC PARM('...')`.

La collecte SQL échouait ensuite avec `SQLCODE -104` : XMLSERVICE transmettait
littéralement `&gt;` à SQL. Les textes SQL/CL/PASE utilisent maintenant CDATA,
selon les [capacités et restrictions du parseur XMLSERVICE](https://github.com/IBM/xmlservice/blob/main/docs/faq.rst).
Les délimiteurs réservés sont refusés avant soumission. Les tests contrôlent
l’échappement REXX et les opérateurs SQL sans entités résiduelles.

## Résultats IBM i

| Scénario | Résultat |
| --- | --- |
| Préparation, même identité, LIBL et QTEMP dans une requête | Réussi |
| Deux contextes successifs | 2/2 réussis |
| Deux contextes simultanés, chevauchement et témoins indépendants | 2/2 réussis |
| Préparation invalide SQLCODE -204, étape cible non exécutée | Réussi |
| Messages : doublons conservés et préparation exclue par bornes ordinales | Réussi |

Authentification par clé, empreinte approuvée, IBM i 7.5, CLI 1.1.0 et CCSID 273.
Les messages ne visent que la file `*EXT` du job de test. Les attentes n’ont pas
été remplacées par les observations. Aucune bibliothèque créée, aucun objet
applicatif modifié dans NOVY4001/NOVY4002 ; ckool est resté en lecture seule.
Une seule requête par test ; aucun IPC, job persistant ou arrêt forcé ajouté.

## Artefacts et limites

JUnit final : `artifacts/ibmi-stateless-ssh-messages-final.xml`.
Inventaires : `artifacts/contexts/*.json`. Ces artefacts ignorés par Git doivent
être conservés avec un accès restreint. Les anciennes campagnes échouées restent
historiques et leurs ressources ne sont pas supprimées automatiquement.

Les deux tests PGM/SRVPGM nécessitent leurs fixtures RPGLE et sont exclus de
`proof:context`. Le mot de passe, la passphrase de clé, la CI et les pannes
réellement injectées restent à qualifier ; les pannes du transport sont simulées
dans Vitest. Cette campagne locale ne valide pas le MVP.
