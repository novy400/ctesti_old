# Qualification locale stateless du 22 octobre 2026

> Campagne initiale. Les défauts SSH et messages ci-dessous sont désormais corrigés :
> voir le [bilan final](qualification-ssh-messages-2026-10-22.md), avec 7 tests IBM i et 80 tests locaux réussis.

Cette campagne applique l’[ADR 0001](../../docs/adr/0001-stateless-test-request.md)
et le [ticket #9 révisé](https://github.com/novy400/ctesti/issues/9).
Elle ne déclare ni la qualification CI ni le MVP validé.

## Attentes fixées avant exécution

Une seule soumission XMLSERVICE par test ; contrôle `*here *cdata`, sans IPC,
réservation ou terminaison du job hôte. Même identité qualifiée pendant la
préparation et la collecte, LIBL contenant NOVY4002, témoin QTEMP propre au test.
Deux tests successifs et deux tests simultanés réutilisent le même nom de table
QTEMP avec des identifiants différents, sans contamination.
Une erreur de préparation doit empêcher le traitement de l’étape cible suivante.

## Configuration qualifiée et changements

- Cible IBM i V7R5M0 ; CLI XMLSERVICE 1.1.0 ; XML Toolkit 2.0.2-dev.
- Authentification par clé, empreinte approuvée vérifiée, CCSID observé 273.
- Bibliothèque de référence NOVY4002 ; aucune bibliothèque créée.
- Aucun objet applicatif modifié dans NOVY4001/NOVY4002 ; ckool reste en lecture seule.
- IPC et JOBD retirés du contrat, de la configuration du banc et du `.env` local.
  Les ressources des anciennes sondes persistantes ne sont ni terminées ni supprimées.
- Vérifications préalables et lancement du CLI dans une seule connexion SSH.
  Un refus de prérequis distingue explicitement une requête non soumise.
- Les seules reprises autorisées sont celles d’une connexion interrompue avant
  authentification. Une fois authentifié, aucune commande n’est renvoyée.
- Le témoin QTEMP utilise explicitement `WITH NC` pour sa lecture/écriture : il
  n’est pas journalisé. Cela ne définit aucune politique transactionnelle pour
  les programmes applicatifs et ne constitue pas un rollback.
- Les délimiteurs SQL/CL restent littéraux dans le texte des éléments XML ; les
  caractères XML réservés restent échappés. Les rapports d’erreur `report` sont
  reconnus et leurs seuls codes techniques sont exportés, sans contenu brut.

## Résultats

| Contrôle | Résultat local |
| --- | --- |
| TypeScript : `npm run check` | Réussi |
| Tests sans serveur : `npm test` | 61 tests réussis |
| Préparation, même job, LIBL et témoin QTEMP dans une requête | Réussi |
| Deux contextes successifs avec le même nom QTEMP et des jetons distincts | Réussis lors de la campagne ciblée précédente |
| Deux scénarios simultanés isolés | 2/2 réussis lors de l’essai isolé ; chevauchement des fenêtres serveur vérifié |
| Préparation SQL invalide (`SQLCODE -204`) puis témoin cible | Réussi ; rapport partiel ne contenant aucune exécution de la commande cible |
| Dernier lancement complet `npm run proof:context` | 4 réussis, 2 échecs SSH avant authentification, 3 tests hors sélection |
| Ancien scénario de messages adapté en une requête | Échec XMLSERVICE de commande ; reste à diagnostiquer dans le job hôte stateless |
| Mapping RPGLE PGM/SRVPGM | Non exécuté ; fixtures CTMAPP/CTMAPS à qualifier séparément |
| Mot de passe, passphrase de clé, CI et pannes réellement injectées | Non qualifiés |

La campagne complète finale n’est donc pas verte. Ses deux échecs sont des
timeouts pendant la négociation SSH, avant envoi du scénario, pour un cas
successif et un cas simultané. Ils ne sont ni ignorés ni reclassés en succès.
Le test de chevauchement a réussi séparément avec une pause PASE de cinq secondes
dans chaque requête et deux horodatages SQL côté serveur. Aucune assertion de
simultanéité ne repose seulement sur le lancement parallèle des promesses client.

Les attentes n’ont pas été remplacées par les observations. Les corrections de
syntaxe/encodage et d’isolation SQL ont été appliquées aux preuves, puis exercées
dans de nouveaux contextes ; aucun scénario incertain n’a été repris automatiquement.

## Artefacts et suite

`artifacts/ibmi-junit.xml` décrit la campagne finale ;
`artifacts/ibmi-stateless-parallel.xml` conserve l’essai simultané réussi.
Les inventaires sont dans `artifacts/contexts/`, avec mode, état, identité relevée,
réponse reçue ou résultat indéterminé, et absence de propriété de la bibliothèque.
Ces artefacts ignorés par Git doivent être conservés avec un accès restreint.

Reste à stabiliser la négociation SSH pendant une campagne complète, qualifier
les messages dans le job stateless et exécuter les preuves restantes en local et
en CI. Le ticket #9 reste ouvert. Aucune disparition physique du job hôte n’est
exigée par le contrat stateless ; aucun `*immed` n’est envoyé.
