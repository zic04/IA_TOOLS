## L'objectif

Donner au kit tout ce qu'une équipe possède déjà sur l'application, en plus du code d'`app.dir` : l'autre code
(services, bibliothèques, le **code d'infrastructure**), ses **dépôts partagés** (GitHub, GitLab, Azure Repos),
l'application **en ligne** par environnement, les documents (un **dossier d'architecture technique** en Word ou en
PDF, des spécifications, des schémas), les **espaces collaboratifs** (Confluence, SharePoint, Teams, Notion) et le
**backlog**. Le kit les lit pour que la documentation parte de ce qui est connu — et le vérifie dans le code.

Les sources vivent dans `inputs.json`, à la racine du projet de documentation. `doc-kit init` les demande (toutes
facultatives), `doc-kit inputs add` en déclare une à tout moment, `doc-kit inputs` montre leur état.

## Qui fait quoi

| Qui | Fait |
|---|---|
| Vous | Déclarez les sources (`init` ou `inputs add`) ; gardez vos accès git (gestionnaire d'identifiants, clé SSH) |
| Le kit | Clone ou met à jour les dépôts (`inputs fetch`), convertit les documents (`inputs ingest`), dit ce qui n'est plus à jour (`inputs`, `bricks`) |
| Les agents du skill | Lisent les documents convertis et, grâce aux connecteurs de la session (Claude Code, Claude Cowork), les pages données par leur adresse — chaque affirmation vérifiée dans le code |

## Étape 1 — Déclarer les sources

```text
doc-kit inputs add code https://github.com/acme/orders-infra.git --role infra
doc-kit inputs add code ../payments-service --role lib
doc-kit inputs add app https://commandes.acme.example --env prod --read-only
doc-kit inputs add document docs/DAT-commandes-v2.docx --kind dat --title "DAT v2.3"
doc-kit inputs add document https://acme.atlassian.net/wiki/spaces/ORD/pages/123 --kind spec
doc-kit inputs add workspace https://acme.sharepoint.com/sites/commandes
doc-kit inputs add backlog https://dev.azure.com/acme/Commandes/_backlogs
```

L'adresse d'un dépôt est **https sans utilisateur ni jeton** (git interroge votre gestionnaire d'identifiants),
`ssh://…` ou `git@hôte:chemin`. L'outil d'un espace ou d'un backlog est déduit de son adresse (`--tool` pour le
préciser).

## Étape 2 — Récupérer les dépôts

```text
doc-kit inputs fetch
```

Chaque dépôt est cloné dans `.doc-kit/inputs/repos/<nom>` (le dossier de travail, jamais commité), ou mis à jour
s'il y est déjà. git utilise vos propres identifiants : le kit ne voit jamais de jeton. Quand le code de
l'application elle-même vient d'un dépôt, indiquez son clone dans `app.dir` de `doc.config.mjs` — la commande le
rappelle.

## Étape 3 — Convertir les documents

```text
doc-kit inputs ingest
```

Word, Markdown, texte, HTML et schémas (draw.io, PlantUML, Mermaid) deviennent du texte dans
`.doc-kit/inputs/docs/`, secrets retirés ; un PDF est indexé et lu par les agents page par page. Une page donnée par
son adresse n'est jamais récupérée par le kit : le skill la lit grâce aux connecteurs de la session, avec votre
accord.

### Puis, avec un DAT : le rapprochement

Une fois le DAT converti et `doc-kit facts` lancé, `doc-kit inputs reconcile` confronte ce que nomme le DAT à ce que
montre le code : technologies trouvées dans le code, dites par le DAT sans trace, dans le code mais pas dans le DAT,
et les hôtes de ses adresses. C'est une première passe, dans `.doc-kit/inputs/reconcile.json` : une trace est un
indice, jamais une preuve. Le skill lance ensuite le brief `architecture-reconcile`, qui vérifie chaque item et
rédige la page des écarts entre le DAT et la réalité.

## Comment savoir que ça marche

`doc-kit inputs` liste chaque source avec son état : un dossier **présent**, un dépôt **récupéré**, un document
**converti, à jour**. `doc-kit bricks` montre les briques `inputs.repos` et `inputs.docs` : `bricks run --stale
--network` récupère et convertit ce qui n'est plus à jour avant que les faits soient relus (`--network` permet
aussi à `facts` d'interroger les registres publics de paquets, pour les seuls paquets publics : voir SECURITY.md).

## Erreurs fréquentes et remèdes

| Symptôme | Cause | Remède |
|---|---|---|
| « “…” n'est pas une adresse que le kit confie à git » | Un utilisateur ou un jeton dans l'adresse, `http://`, ou une forme que git lirait comme une option | Utilisez `https://hôte/chemin` sans identifiants, `ssh://` ou `git@hôte:chemin` |
| « git s'est terminé avec le code 128 : fatal: Authentication failed » | Pas d'accès, ou aucun identifiant enregistré | Connectez-vous une fois avec git lui-même (gestionnaire d'identifiants, clé SSH) ; le kit ne demande jamais rien |
| « refusé — … pas une archive ZIP » | Un `.docx` qui n'en est pas un (un ancien `.doc`, un fichier renommé) | Enregistrez-le de nouveau en `.docx`, ou fournissez le PDF |
| « le kit ne lit pas les fichiers .xlsx » | Un format que le kit ne convertit pas | Exportez-le en PDF, `.docx` ou Markdown |

## Pièges et limites à connaître

- Un document est une **information à vérifier**, jamais la vérité : un dossier d'architecture décrit souvent ce qui
  était prévu. Les agents le citent (« Source : DAT v2.3 § 4.1 ») et signalent chaque écart avec le code.
- Un clone est une copie complète du dépôt : il reste dans le dossier de travail ; supprimez `.doc-kit/inputs/`
  quand la documentation est remise.
- Les lecteurs du kit refusent ce qu'ils ne peuvent pas lire sans risque (une archive chiffrée ou trop grosse, une
  bombe ZIP) : voir SECURITY.md.

## Droits requis

Un accès en lecture à chaque dépôt avec votre propre compte git, et aux documents. Rien d'autre : aucun jeton n'est
confié au kit, et le kit n'écrit rien dans les dépôts.
