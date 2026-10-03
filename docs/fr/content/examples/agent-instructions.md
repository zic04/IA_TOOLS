> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `agent-instructions`, écrit pour Acme Orders, le produit fictif du kit. Le tableau ci-dessous est généré à partir de `facts/agents.json`, écrit par `doc-kit facts --source agents`.

## En bref

Deux fichiers d'instructions, 760 mots au total ; aucun caractère caché trouvé. La plupart des règles de `AGENTS.md` correspondent encore au code ; l'une est déjà contredite.

## Les fichiers

::faits{source="agents" colonnes="file,lines,words"}

## Chaque règle

| Règle | Fichier:ligne | Statut | Preuve |
|---|---|---|---|
| « Filtrer par `region_id` sur toute requête liée à un client » | `AGENTS.md:14` | Contredite (C2) | [[verifie approvalService.ts:88]] |
| « Utiliser `acme-date-utils`, jamais une bibliothèque de dates tierce » | `AGENTS.md:22` | Confirmée, pas suivie une fois | [[verifie approvalService.ts:3]] |
| « Toute tâche planifiée est déclarée dans `infra/jobs.tf` » | `orders.md:4` | Contredite (C1) | [[verifie infra/jobs.tf:8]] |

## Caractères invisibles

Aucun caractère caché n'a été trouvé dans l'un ou l'autre des fichiers d'instructions.

## Ce qu'il faut garder

- Garder « filtrer par `region_id` » et « utiliser `acme-date-utils` » : les deux décrivent la conception prévue, même là où le code ne la suit pas encore. Les reprendre dans [Règles d'accès à la base de données](#/examples/api-surface~regles-d-acces-a-la-base-de-donnees) et [Dépendances directes](#/examples/dependencies~dependances-directes), puis retirer les fichiers d'instructions une fois chaque règle statuée ici.
