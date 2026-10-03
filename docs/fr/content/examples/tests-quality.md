> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `tests-quality`, écrit pour Acme Orders, le produit fictif du kit. Le tableau ci-dessous est généré à partir de `facts/tests.json`, écrit par `doc-kit facts --source tests`.

## En bref

46 tests répartis sur 4 fichiers, environ 61 % de couverture de lignes. Le circuit de validation est bien testé ; la tâche de relance, celle qui ne tourne jamais réellement en production (C1 des constats), n'a qu'un seul test — et ce test vérifie seulement que la fonction existe.

## Ce qui est testé

::faits{source="tests" colonnes="file,tests"}

## Parcours critiques

| Parcours | Testé ? | Preuve |
|---|---|---|
| Création et recherche de commandes | Oui, y compris le correctif du filtrage par région | [[verifie lib/services/searchService.test.ts:1]] |
| Décision de validation | Oui, 9 cas, mais aucun ne couvre le contrôle de périmètre manquant (C2) | [[verifie lib/services/approvalService.test.ts:1]] |
| Génération de factures | Partiellement : seulement le cas heureux, pas le comportement de nouvelle tentative (I5) | [[verifie jobs/invoiceJob.test.ts:1]] |
| E-mail de relance | Aucune couverture réelle : voir ci-dessous | [[verifie jobs/reminderJob.test.ts:1]] |

## Tests qui ne testent rien

- `jobs/reminderJob.test.ts:8` vérifie seulement que `sendReminder` est une fonction ; il ne l'appelle jamais et ne vérifie jamais qu'un e-mail serait envoyé ([[verifie jobs/reminderJob.test.ts:8]]).

## Comment les lancer

`npm test` lance toute la suite en environ 20 secondes contre une base de données en mémoire ; `npm run test:e2e` demande en plus l'application et un Postgres local en cours d'exécution.
