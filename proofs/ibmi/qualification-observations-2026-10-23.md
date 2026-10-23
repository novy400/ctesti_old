# Qualification des observations du 23 octobre 2026

Implémentation du [ticket #10](https://github.com/novy400/ctesti/issues/10),
selon l’[ADR 0001](../../docs/adr/0001-stateless-test-request.md) et les
[attentes écrites avant campagne](../../docs/issue-10-expectations.md).
Cette qualification locale ne clôt ni le ticket ni la validation du MVP.

## Résultats

| Contrôle | Résultat |
| --- | --- |
| `npm run check` | Réussi |
| `npm test` | 94 tests réussis |
| `npm run proof:observations` | 10 tests IBM i réussis, 3 limites nominales hors sélection |
| Deux appels RPGLE, dont un programme imbriqué | Réussi : ordre exact, doublons et attribution séparée |
| Appel silencieux | Réussi : liste vide, collecte complète |
| Erreur IBM i suivie d’un appel normal | Réussi : erreur et messages conservés, même job vérifié |
| Erreur IBM i puis panne de collecte injectée après une ligne | Réussi : issue IBM i, préfixe partiel et erreur technique visibles ensemble |
| Collecte inaccessible injectée | Réussi : erreur technique, jamais vide complète |
| Seuil réduit de messages atteint exactement et seuil réduit d’octets | Réussis : motifs distincts et préfixes explicites |
| Délai réduit dépassé | Réussi : `time-limit` |
| Message immédiat de 6 000 octets | Réussi : troncature détectée, collecte partielle |
| Préfixe volontairement invalidé | Réussi : attribution incertaine |
| Appel programmé après chacune des pannes techniques | Réussi : bloqué côté serveur, issue inconnue, aucun message attribué |
| Limite nominale 15 s, délai injecté de 16 s | Réussi |
| Limite nominale 10 000 messages | **Échec de qualification** : perte du préfixe avant le seuil |
| Limite nominale 10 Mio | **Échec de qualification** : perte du préfixe avant le seuil |
| CI, autres profils et configurations IBM i | Non qualifiés |

Les deux échecs nominaux restent des échecs : `uncertain-boundary` n’a pas été
substitué à `message-limit` ou `byte-limit` dans leurs assertions. Le protocole
reste exécutable dans la [campagne dédiée](observations.md), avec les seuils
initialement attendus. Il faut une rétention de joblog suffisante pour pouvoir
qualifier ces seuils sur une cible. Aucune JOBD, valeur système ou configuration
du job hôte n’a été changée pour les faire passer.

Un diagnostic supplémentaire a constaté 73 messages de préfixe, commençant
par la clé `00000001`, puis 6 144 messages après l’appel de volume, commençant
par `00001223`. La disparition du préfixe est certaine ; un rebouclage du
joblog est une explication possible, pas une configuration système vérifiée.
La réponse est complète au sens transport, mais les observations d’appel
ne sont pas complètes. Le contexte n’a été ni rejoué ni nettoyé.

## Corrections issues des essais

- La fixture RPG respecte une instruction par ligne, selon les diagnostics
  du compilateur réel. Les appels dynamiques sont qualifiés : QTEMP/CT10NEST
  et QSYS/QMHSNDPM. La preuve des deux appels a été revérifiée après cette
  qualification explicite.
- La préparation, le repère initial, l’appel et la collecte utilisent des
  blocs ordonnés ; le repère, l’appel et la collecte sont dans un même bloc
  SQL PL. Les messages de compilation de ce bloc précèdent le repère.
- Le nom `result`, réservé par SQL PL, est remplacé par `v_result`.
- La fin de curseur est initialisée après les opérations susceptibles de
  produire SQLCODE 100. Les listes vides passent par un témoin SQL explicite,
  sans désactiver les erreurs de requête ou de fetch.
- CPF9898 rend une substitution avec point final ; cette propriété est
  confirmée par la documentation IBM référencée dans les attentes. Son rendu
  de 513 caractères avec 1 500 octets de tokens ne prouve pas une troncature
  de collecte : les tokens sont disponibles. Le cas de troncature utilise
  donc un message immédiat de 6 000 octets, conformément à QMHSNDPM.
- Les erreurs techniques bloquent les appels suivants côté serveur. L’issue
  de l’appel précédent reste indépendante de l’état de collecte.
- Le budget XML prévoit les balises en plus du budget de messages par appel.
  La limite générique reste 10 Mio, avec enveloppe explicite plafonnée à
  64 Mio. Une perte de transport reste indéterminée, sans rejeu.

La première campagne avait six réussites et deux erreurs SSH avant
authentification, sans requête soumise. La deuxième a permis d’identifier le
mauvais témoin de troncature. Leurs résultats restent conservés séparément ;
aucun échec n’a été effacé ou reclassé en succès.

## Contraintes et artefacts

Authentification par clé et empreinte approuvée ; bibliothèque de référence
NOVY4002, CCSID configuré 273, budget SSH configuré 30 s. Node 24.16.0 et
XML Toolkit 2.0.2-dev. Les droits du profil existant ont suffi aux compilations
et aux lectures de son joblog.

Les fixtures créent seulement leurs objets dans QTEMP après contrôle de
collision et sans remplacement. NOVY4001/NOVY4002 ne reçoivent aucun objet ;
aucune bibliothèque créée. Aucun fichier, test ou paramètre de ckool modifié.
Aucune opération Python. Aucun arrêt de job, remplacement de contexte ou
nettoyage automatique d’anciennes ressources.

Artefacts locaux ignorés par Git, à conserver :

- `artifacts/issue10-observations-final.xml` : dix preuves réussies.
- `artifacts/issue10-limits-first-campaign.xml` : deux seuils non qualifiés,
  délai nominal réussi.
- `artifacts/issue10-volume-diagnostic.json` : métadonnées de perte du préfixe.
- `artifacts/issue10-first-campaign.xml` et `issue10-second-campaign.xml` :
  historique des essais en échec.
- `artifacts/contexts/*.json` : identités et états des contextes.
- `artifacts/issue10-request.xml` et `issue10-response.xml` : traces de
  diagnostic des seules fixtures, conservées localement et non exportées.

## Limites restantes

JOBLOG_INFO ne peut prouver la présence de messages créés puis supprimés
entièrement pendant un appel. Ce backend reste qualifié pour les fixtures
qui conservent leurs messages ; il ne justifie pas une garantie universelle.
Les troncatures connues sont détectées ; les limites du service doivent
rester prises en compte. Le délai SQL est vérifié après chaque fetch et ne
permet pas d’interrompre un service bloqué. Les pannes injectées testent le
contrat du collecteur, sans qualifier toutes les pannes réelles du système.

La suite de la qualification doit traiter la rétention sous charge et la CI,
sans changer les attentes ni présenter une collecte partielle comme complète.
