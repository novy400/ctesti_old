# Preuve locale du verdict final — ticket #13

`npm run proof:verdict` exécute la validation : elle doit réussir. Elle lance
de vrais processus Vitest et vérifie leurs codes de sortie, la console,
les diagnostics JSON et chaque cas JUnit. `npm test` inclut cette validation.

`npm run proof:verdict:negative` lance directement les démonstrations :
**le code de sortie attendu est 1**, avec 11 échecs contrôlés et 2 succès.
Ces démonstrations sont exclues de la découverte de la suite de validation.

Les scénarios couvrent la préparation, l'assertion initiale, le hook,
la copie QTEMP, la terminaison et deux suppressions successives. Ils vérifient
aussi une panne interceptée, une erreur IBM i inattendue, une erreur IBM i
attendue et vérifiée, une terminaison normale contraire à cette intention
et une panne technique qui ne doit pas satisfaire cette intention.

Le verdict provisoire reflète la préparation, le corps et les erreurs
mémorisées. Le verdict final inclut la clôture. Dès l'échec, les étapes
destructives restantes sont omises ; la première suppression réussie reste
enregistrée si la seconde échoue. L'assertion initiale et les erreurs du hook
et de copie restent toutes visibles. Les erreurs imbriquées sont aplaties
avant leur transmission aux reporters Vitest.

La validation lance aussi des processus séparés pour prouver le succès
(code 0) et le rejet de `test.fails`, des retries numériques ou objets,
des répétitions et des options globales correspondantes. Le runner rejette
ces options avant toute création de contexte.

Chaque lancement de validation crée un dossier unique sous
`artifacts/verdict/run-*`, contenant `console.txt`, `junit.xml` et les
diagnostics JSON. Le lancement direct écrit dans `artifacts/verdict`.
Les assertions de validation sont fixées dans `tests/verdict.test.ts` ;
les sorties générées ne deviennent pas les résultats attendus.

La fixture `src/proofs/fixture.ts`, le cycle de vie
`src/proofs/lifecycle.ts` et le runner `src/proofs/runner.ts` sont partagés
avec le banc IBM i. Seules les opérations externes sont contrôlées localement.
Cette preuve ne qualifie ni la copie réelle QTEMP, ni la fin effective d'un
job, ni le décodage d'une erreur RPGLE réelle. Leur raccordement et la
qualification local/CI sur IBM i restent à effectuer. Le MVP n'est pas
déclaré validé. Aucun accès à ckool n'est nécessaire.
