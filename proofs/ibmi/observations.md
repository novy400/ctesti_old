# Attribution des observations — ticket #10

Les [attentes](../../docs/issue-10-expectations.md) précèdent les essais.
L’[ADR 0001](../../docs/adr/0001-stateless-test-request.md) reste applicable.
Les [résultats du 23 octobre](qualification-observations-2026-10-23.md)
consignent dix preuves réussies, le délai nominal réussi et les deux seuils
de volume non qualifiés sur la cible disponible.

```powershell
npm run check
npm test
npm run proof:observations
```

Chaque test construit toute sa séquence, compile deux programmes RPG cTestI
dans QTEMP, puis soumet une seule requête. Les commandes vérifient les
collisions ; créations sans remplacement. Les seuls objets supplémentaires
sont le source physique, ses alias SQL, un fichier de messages et les tables
de collecte QTEMP. Aucune création de bibliothèque, modification d’objet
applicatif, modification de ckool ou opération Python.

`ObservationScript.call(id, commande)` enregistre le préfixe du joblog,
exécute la commande avec QSYS2.QCMDEXC puis collecte, dans un même bloc SQL PL.
La compilation du bloc et les observations XMLSERVICE restent hors de
l’intervalle. Les clés de tous les messages du préfixe sont vérifiées avec
leurs positions, avant d’attribuer les lignes suivantes à l’appel. Aucune
fenêtre horaire ni sélection par texte, programme, type ou sévérité n’intervient.
Les messages d’erreur associés à l’exécution restent donc visibles eux aussi.

Le résultat contient `contextId`, `callId`, le job vérifié avant et après la
requête, l’issue de l’appel et l’état de collecte. Les messages portent clé,
ordinal, identifiant, type, sévérité, texte, programme émetteur et données de
substitution hexadécimales brutes, dans leur CCSID IBM i. `null` signale une
valeur indisponible ; aucune valeur RPG n’est inventée. Le contrat de mapping
des paramètres et retours relève des tickets #11 et #12.

`CollectionError.observation` préserve l’issue connue de l’appel et les
messages déjà récupérés. Une ligne mal formée ou une réponse manquante ne
devient jamais une collecte complète. Une liste vide utilise un témoin SQL
`null` explicite, car XMLSERVICE traite un premier fetch sans ligne comme
SQLCODE 100 avec `error="on"`. Les appels suivants du scénario sont bloqués
côté serveur après une panne technique ; une erreur IBM i correctement
collectée permet l’appel suivant.

## Budgets et campagne nominale

Les budgets initiaux par collecte sont 15 s, 10 000 messages et 10 Mio de JSON
UTF-8 (texte et tokens hex compris). Atteindre un seuil n’est pas un succès.
Les seuils réduits suivent exactement le même chemin serveur. Les injections
de panne et d’incohérence sont déclarées avant soumission et identifiées comme
telles dans les tests ; ce ne sont pas des pannes de production qualifiées.

La campagne nominale est séparée pour rendre sa charge explicite :

```powershell
$env:CTESTI_COLLECTION_STRESS = '1'
npm run proof:observations:limits
Remove-Item Env:CTESTI_COLLECTION_STRESS
```

Elle produit 10 001 messages courts, puis, dans un autre test, 1 500 messages
dont les données de substitution occupent 4 000 octets chacun. Un message de
fixture CT10001 à texte fixe permet d’exercer 10 Mio sans rencontrer d’abord
la troncature du texte CPF9898. Le troisième test retarde volontairement la
collecte de 16 s. Chaque test exige une `CollectionError` portant la raison
exacte, et ne réexécute aucun appel.

L’enveloppe du transport est distincte : elle réserve les octets de messages
plus les balises et le scénario XMLSERVICE, avec un maximum de 64 Mio par
requête. Un budget supérieur est refusé avant connexion. Le défaut du
transport générique reste 10 Mio. Une réponse perdue ou trop grosse reste
indéterminée sans rejeu ; elle ne prouve pas une collecte complète.

## Portée et limites

- JOBLOG_INFO ne voit pas les messages supprimés avant sa lecture. Une
  suppression ou une réorganisation du préfixe est détectée ; un message
  créé et supprimé entièrement pendant l’appel peut rester invisible.
  Ce mécanisme ne qualifie donc pas les programmes qui retirent leurs messages.
- Le service limite les textes et les tokens. Une longueur de texte atteignant
  1 024 caractères est traitée prudemment comme une troncature ; les tokens
  sont comparés à leur longueur annoncée. D’autres troncatures que le service
  ne permettrait pas de détecter restent une limite du backend.
- La durée se vérifie au retour de chaque fetch. Un appel SQL bloqué ne peut
  être interrompu par cette boucle ; le timeout SSH laisse alors l’exécution
  indéterminée. Le délai de 15 s n’est pas une garantie d’interruption serveur.
- Ce banc de preuves n’est pas encore l’API publique `ibmi.call`. La validation
  CI, les intentions d’appel et le verdict irrécupérable relèvent aussi des
  tickets #13 et #14. Les fixtures négatives interceptent explicitement les
  erreurs attendues pour vérifier leurs observations.

Références IBM : [JOBLOG_INFO](https://www.ibm.com/docs/ssw_ibm_i_75/rzajq/rzajqudfjobloginfo.htm),
[QCMDEXC](https://www.ibm.com/docs/en/i/7.5.0?topic=services-qcmdexc-scalar-function),
[QMHSNDPM](https://www.ibm.com/docs/en/i/7.4.0?topic=ssw_ibm_i_74%2Fapis%2FQMHSNDPM.html).
