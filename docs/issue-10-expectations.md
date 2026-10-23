# Ticket #10 — attentes fixées avant campagne

Le 23 octobre 2026, avant les essais : appliquer l’ADR 0001, une seule
requête `*here *cdata` contenant préparation, appels et collecte. ckool est
strictement en lecture seule. Aucune bibliothèque créée, aucun objet
applicatif modifié. Les sources et programmes témoins appartiennent à cTestI
et sont créés seulement dans QTEMP, après contrôle des collisions.

Attentes :

- Deux appels identifiés, même contexte et même identité qualifiée que les
  contrôles encadrant la requête. Aucune attribution par fenêtre horaire.
- Le premier programme produit `CT10:first`, puis son programme imbriqué
  produit deux fois `CT10:nested`. Le second produit `CT10:second`.
  Ordre et doublons conservés. `CT10:preparation` absent des deux collectes.
- Un programme silencieux termine normalement avec liste vide et collecte complète.
- Un programme émet `CT10:before-error`, puis CPF9898 en échappement.
  Son résultat reste une erreur IBM i, même si la collecte échoue ensuite.
- Une panne injectée après une ligne conserve ce préfixe et expose une erreur
  technique distincte. Une collecte inaccessible n’est jamais une liste vide complète.
- Valeurs indisponibles à `null` : identifiant, type, sévérité, texte,
  données de substitution (hexadécimal). Clé et position exposées.
- Aucun filtrage des messages de l’intervalle d’appel. La préparation et
  l’infrastructure restent hors de cet intervalle ; les messages IBM associés
  à l’exécution restent visibles. Les positions sont contrôlées avec les clés
  du préfixe, car JOBLOG_INFO recalcule ses ordinaux. Toute incohérence ou
  troncature connue rend la collecte partielle.
- Budgets par collecte : 15 s, 10 000 messages, 10 Mio de JSON UTF-8.
  Les seuils réduits exercent les mêmes branches ; les seuils nominaux ont
  une campagne explicite séparée. Le budget temps détecte un dépassement
  après retour du service SQL ; il ne prétend pas interrompre un service bloqué.

Les résultats observés seront consignés séparément, sans réécrire ces attentes.
Un échec ne valide pas le critère concerné. Une perte de réponse reste
indéterminée sans rejeu ni nettoyage automatique.

Référence : [JOBLOG_INFO IBM](https://www.ibm.com/docs/ssw_ibm_i_75/rzajq/rzajqudfjobloginfo.htm).
Le service ne voit pas les messages supprimés avant sa lecture ; une suppression
entièrement entre les deux instantanés reste une limite à expliciter.

Précision avant la campagne de validation : les chaînes ci-dessus sont les
données de substitution de CPF9898. Le texte rendu ajoute le point final
défini par IBM ; les assertions de texte attendent donc `CT10:first.`, etc.
Cette précision provient de la [documentation IBM CEEMSG](https://public.dhe.ibm.com/systems/power/docs/systemi/v5r2/sk_SK/ile.pdf),
qui indique explicitement que CPF9898 ajoute un point, et ne change pas les
données émises ni l’ordre attendu.

Pour exercer une troncature du service, le témoin T utilise un message
immédiat de 6 000 octets, permis par QMHSNDPM, face à la colonne texte de
1 024 caractères de JOBLOG_INFO. Un CPF9898 avec 1 500 octets de données ne
prouve pas cette troncature : sa définition ne rend que sa substitution
prévue, tandis que les données restent accessibles intégralement.
