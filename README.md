# cTestI

Vérifier le comportement de programmes RPGLE avec des tests TypeScript et Vitest.

Le banc IBM i soumet une seule requête XMLSERVICE stateless par test :
préparation, appels et collecte dans le même job, puis assertions TypeScript.

- [Reprise de session — 22 octobre 2026](docs/handoff-2026-10-22.md)
- [Contrat stateless](docs/adr/0001-stateless-test-request.md)
- [Configuration et preuves IBM i](proofs/ibmi/README.md)
- [Dernière qualification SSH et messages](proofs/ibmi/qualification-ssh-messages-2026-10-22.md)
- [Attribution par appel — résultats du 23 octobre](proofs/ibmi/qualification-observations-2026-10-23.md)
- [Preuves du verdict Vitest](proofs/verdict/README.md)
- [Vocabulaire](GLOSSARY.md)

Avec Node >= 24 :

```powershell
npm ci
npm run check
npm test
```

Ces vérifications locales ne nécessitent aucune connexion IBM i. Pour les
preuves réelles, renseigner localement `.env` à partir de `.env.example`,
puis suivre le guide IBM i. Les secrets et `artifacts/` restent exclus de Git.
ckool reste strictement en lecture seule.
