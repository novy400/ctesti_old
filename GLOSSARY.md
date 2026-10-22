# cTestI

cTestI permet de vérifier le comportement de programmes RPGLE à partir de tests TypeScript.

## Language

**Corpus de validation du MVP**:
Ensemble des scénarios de référence et de leurs résultats attendus dont la réussite sur IBM i réel, en local et en CI, établit la validation du MVP.

**Référence ckool**:
Scénario fondé sur un comportement existant de ckool, utilisé dans le corpus sans modification du projet ckool.

**Contexte IBM i de test**:
Contexte d’exécution dédié à un seul test, conservé de sa préparation jusqu’à la collecte de ses observations.

**Résultat d’appel**:
Issue observable d’un appel RPGLE, terminé normalement ou avec une erreur IBM i, sur laquelle le test peut formuler des assertions.

**Observations d’appel**:
Valeurs et messages recueillis pour un appel RPGLE identifié dans son contexte IBM i de test. Les messages de préparation sont distincts de ceux de l’appel.
