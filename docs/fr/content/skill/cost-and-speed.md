## En bref

Le kit lui-même ne fait appel à aucun LLM : `build`, `check`, `audit`, `facts` et `sync` s'exécutent sur du code
ordinaire, gratuitement, quelle que soit la taille du projet. Les jetons ne sont dépensés que là où le skill met un
agent au travail — lire le contexte d'une page, puis écrire ou relire son Markdown. Quatre choses réduisent ce
coût : lire **moins** (`doc-kit context`), partir de ce qui est déjà connu (`new --prefill`), faire correspondre
le **modèle** à la tâche, et tenir un **budget d'étapes** plutôt que d'explorer — mesuré comme le plus gros des
quatre leviers (voir « Mesuré, pas estimé » ci-dessous).

## Lire moins : `doc-kit context`

```bash
doc-kit context use/orders/approval --budget 8000
```

Écrit `.doc-kit/context/<page>.md` : la seule lecture dont un agent a besoin pour cette page, au lieu de tout
l'inventaire du code et de la table des matières. Construit à partir des dépendances propres de la page (les mêmes
que calcule `doc-kit sync`) — les fichiers directs avant les partagés, chacun réduit aux lignes proches d'une
preuve citée, un fichier court donné en entier — plus les sections requises de son gabarit, les libellés exacts et
lignes de faits que ces fichiers touchent, et les termes du glossaire qui correspondent. Les jetons sont estimés en
caractères ÷ 4 ; au-delà du budget (16 000 par défaut ; 24 000 pour une fiche de fonctionnalité), les extraits les plus éloignés sont coupés en premier,
chaque coupe laissant une ligne.

Un dossier de contexte tient de quelques centaines de jetons, pour une page avec une ou deux petites dépendances,
à quelques milliers pour la plupart des pages — toujours bien en dessous des environ 15 000 jetons qu'un agent
lisait en entier (tout l'inventaire et la table des matières) avant chaque page qu'il écrivait.

## Partir des faits : `new --prefill`

```bash
doc-kit new take-over/deployment/variables --template variables --prefill
```

Pour les cinq types de reprise construits directement à partir d'une source de faits (`variables` depuis `env`,
`api-surface` depuis `api`, `data-model` depuis `db`, `dependencies` depuis `dependencies`, `agent-instructions`
depuis `agents`), le tableau principal de la page est rempli ligne par ligne à partir de `facts/<source>.json`
avant même que l'agent n'ouvre le fichier : les cellules clés (nom de variable, route, table, paquet, fichier
d'instructions) et leur preuve ; les autres cellules gardent la consigne du gabarit jusqu'à ce que quelqu'un —
personne ou agent — les écrive. Sans le fichier de faits, `--prefill` refuse de s'exécuter (`doc-kit facts`
d'abord) ; sur un type sans rien à préremplir, c'est une erreur d'usage.

## Quatre types d'agents, trois prix

| Agent | Modèle | Outils | Utilisé pour |
|---|---|---|---|
| `doc-kit-triage` | Haiku | Read, Grep, Glob (lecture seule) | Décider si une page est intacte, à modifier, à réécrire ou (fiche de fonctionnalité) à approfondir |
| `doc-kit-writer` | Sonnet | Read, Grep, Glob, Edit, Write, Bash | Écrire et mettre à jour les pages, et les briefs de fonctionnalité `feature-mechanism` et `deepen` (ce dernier routé sur Haiku) |
| `doc-kit-analyst` | Sonnet | Read, Grep, Glob, Edit, Write, Bash | Suivre une fonctionnalité dans le code et écrire son analyse (`behaviour-analysis`), rien d'autre |
| `doc-kit-reviewer` | Opus | Read, Grep, Glob, Edit, Write, Bash (usage en lecture seule) | L'inventaire, les revues de santé du code et de sécurité, la vérification des constats (sur Sonnet par défaut), le dossier de production, le DAT face à la réalité |

`doc-kit skill install` copie les quatre définitions d'agent Claude Code près du dossier des skills ; `doctor` les
signale comme le skill lui-même (actuels, absents, périmés, modifiés). Chaque brief nomme son type d'agent dans une
ligne d'en-tête, et est découpé pour que sa partie commune (règles, sécurité, syntaxe) vienne en premier, identique
au caractère près quelles que soient les variables. Lancez le premier agent d'une vague seul et les autres dans le
message suivant : un agent lancé après un autre lit dans le cache de prompt ce que leurs consignes partagent avant
le brief — la définition de l'agent et les outils de Claude Code, 23 000 à 24 000 jetons de ses 37 000 à 38 000 premiers,
mesuré — quand des agents lancés ensemble l'écrivent chacun à nouveau. Le brief lui-même, envoyé en un seul message
avec ses variables, est écrit à nouveau par chaque agent.

## Estimer avant de dépenser : `brief.mjs --estimate`

```bash
node <skill>/scripts/brief.mjs writing-batch --project docs/manual --var code=u1 --var pages=@pages-u1.txt --estimate
```

Jetons d'entrée : le brief lui-même, plus chaque fichier de contexte et les fichiers qu'il liste, ÷ 4. Jetons de
sortie : 1,4 par mot du `maxWords` du gabarit pour une page neuve, 0,3 par mot pour une mise à jour. Chiffré en
coût seulement quand `llm.prices` est renseigné dans `doc.config.mjs` — **il n'y a pas de prix par défaut**, parce
que les prix changent et diffèrent selon le contrat :

```js
llm: { currency: "EUR", prices: { haiku: { input: 0.9, output: 3.6 }, sonnet: { input: 3, output: 15 } } }
```

Sans `llm.prices`, l'estimation affiche encore les comptes de jetons ; elle omet seulement un coût. Une estimation
compte une lecture de ce qu'on donne à l'agent : ni sa propre définition, ni la relecture de son contexte à chaque
aller-retour. Mesuré sur les analyses ci-dessous, les agents ont dépensé 2 à 5 fois leur estimation. `doc-kit sync
--estimate` chiffre de la même façon les pages qu'un rapport sync liste à relire, un agent `doc-kit-writer` par
page.

## Mesurer ce qui a vraiment été dépensé

```bash
node <skill>/scripts/usage.mjs log --brief writing-batch --agent doc-kit-writer --model sonnet --tokens 42000
node <skill>/scripts/usage.mjs report
```

`log` ajoute une ligne à `.doc-kit/usage.jsonl` (l'orchestrateur enregistre ce que Claude Code rapporte quand un
agent se termine) ; `report` totalise par phase, brief, type d'agent, modèle et page, avec le coût quand
`llm.prices` est renseigné, à côté de la dernière estimation ; `scan --transcripts <dossier>` lit les transcriptions
de Claude Code pour répartir les jetons d'entrée, de sortie et de cache : la dépense elle-même, dont `log` donne
un plancher. Avec un `scan`, le total de `report` est celui des `scan`, les jetons enregistrés affichés à part et
jamais ajoutés.

Ce que Claude Code rapporte quand un agent se termine est la taille de son dernier contexte, pas ce qu'il a
consommé : chaque aller-retour relit ce contexte, surtout depuis le cache — mesuré, le chiffre rapporté valait un
sixième à un tiers des jetons consommés. La dépense elle-même vient des transcriptions : le hook de statistiques
(`doc-kit skill install --hooks`) lit celle de chaque agent à sa fin, et `scan` en lit un dossier — les agents
d'une session sont dans `~/.claude/projects/<projet>/<session>/subagents/` ; parcourez-le une fois, à la fin
(chaque `scan` ajoute une entrée). Claude Code écrit une réponse sur plusieurs lignes, une par bloc, chacune
répétant son usage : les deux comptent chaque réponse une fois. Une transcription garde un compte de sortie partiel
pour une réponse qui appelle un outil : les deux comptent au moins ce que la réponse a écrit (caractères ÷ 4), et
disent quelle part de la sortie vient de cette estimation.

## Mesuré, pas estimé

Mesuré sur une application réelle (FastAPI + Next.js, 81 pages) : neuf pages d'écran d'administration, un agent
`doc-kit-writer` par page, trois méthodes comparées.

| Méthode | Coût moyen (équivalent jetons) | Allers-retours | Durée | Mots | Preuves | Conformes |
|---|---|---|---|---|---|---|
| Ancien brief : guide de rédaction + page de référence + inventaire complet + exploration libre + vérifications répétées | 1 039 000 | 47 | 13,6 min | 1 719 | 52 | 3/3 |
| + un dossier de contexte (`doc-kit context`), même exploration libre | 890 000 (−14 %) | 42 | 11,4 min | 1 652 | 54 | 3/3 |
| **Sobre** : dossier de contexte + gabarit seulement, au plus 3 lectures ciblées, page écrite en une fois, un seul build, `view` seulement avec captures | **323 000 (−69 %)** | **21** | **7 min (−49 %)** | 1 303 | 42 | 3/3 |

Coût « équivalent jetons » : entrée × 1 + écriture du cache × 1,25 + lecture du cache × 0,1 + sortie × 5. Les
lectures du cache sont les moins chères, jeton pour jeton — mais chaque aller-retour relit tout le contexte
accumulé jusque-là, si bien qu'il y en a bien plus que de toute autre nature : **le coût d'un agent ≈ ses
allers-retours × la taille de son contexte**. Le dossier de contexte seul a rapporté 14 % ; plafonner le budget
d'étapes — au plus 3 lectures supplémentaires par page, un seul `Write`, un seul build, pas de `view` à
mi-parcours — a rapporté les 55 points restants. La conformité au standard n'a pas bougé (3/3 de bout en bout) :
moins d'étapes a voulu dire moins d'étapes *d'exploration*, pas moins de vérifications. `writing-batch` et
`update` (ARCHITECTURE.md §6.11, `references/agent-orchestration.md` §8 du skill) énoncent ce budget d'étapes
dans leur propre texte : un agent qui le dépasserait s'arrête et le signale plutôt que de continuer à explorer.

### L'analyse d'une fonctionnalité (pilote de la 0.4.0)

Mesuré sur la démo (Acme Orders) : deux fonctionnalités de taille S au niveau `standard`, un analyste par
fonctionnalité sur Sonnet (`behaviour-analysis`), lancé deux fois — la seconde avec le brief corrigé de ce que la
première a appris, et le second agent lancé après le premier. Sortie estimée d'après ce que les agents ont écrit
(caractères ÷ 4).

| Passe | Fonctionnalité | Allers-retours | Durée | Cache écrit | Cache lu | Sortie | Équivalent jetons |
|---|---|---|---|---|---|---|---|
| 1, lancés ensemble | F-01 Suivre les commandes (2 comportements) | 7 | 97 s | 69 845 | 338 043 | 8 751 | 164 900 |
| 1 | F-02 Approuver une commande (1 comportement) | 6 | 71 s | 59 459 | 247 428 | 6 703 | 132 600 |
| 2, brief corrigé, F-02 après F-01 | F-01 | 7 | 93 s | 63 028 | 297 624 | 8 132 | 149 200 |
| 2 | F-02 | 4 | 41 s | 31 400 | 157 338 | 3 253 | **71 300 (−46 %)** |

- **Le fichier écrit une fois.** À la passe 1, les deux analystes ont d'abord écrit leur analyse par un heredoc du
  shell, qui a cassé sur une apostrophe, puis à nouveau avec `Write` : 2 900 à 4 100 jetons de sortie perdus
  chacun, la nature la plus chère. Le brief interdit maintenant le shell pour cela, même si la session le suggère
  (le mode auto de Claude Code le fait) ; à la passe 2, l'un des deux a encore essayé.
- **Ce que l'analyse nomme, dans le contexte.** Une analyse nomme types et rubriques par leurs identifiants, que les
  cartes du contexte ne donnaient pas : un analyste a lu tout le registre des types (27 Ko) pour les trouver. Les
  cartes les donnent maintenant.
- **Le premier agent seul.** À la passe 2, F-02 a lu 23 154 jetons de sa première consigne dans le cache ; à la
  passe 1, lancés en même temps, chacun a écrit ses 37 000.
- **L'estimation est un plancher.** `brief.mjs --estimate` donnait 10 241 jetons d'entrée et 5 000 de sortie
  (35 200 en équivalent jetons) : les agents ont dépensé 2 à 5 fois plus. Le budget de sortie de la taille S
  correspondait à une écriture du fichier (2 800 à 4 100 jetons).
- **La qualité a tenu.** Chaque constat, relu dans le code, était juste — une chaîne d'approbation créée par un
  `GET` que la page de la commande précharge, le droit de lire les commandes jamais vérifié, une erreur de la liste
  avalée. Les questions ouvertes étaient celles que la fiche de la démo laisse ouvertes, et la boucle de profondeur
  n'avait rien à approfondir. D'une passe à l'autre sur une même fonctionnalité, les constats différaient d'un (un
  statut inséré en HTML brut, que les faits de sécurité du contexte donnaient) : le brief demande maintenant de
  vérifier chacun de ces faits.

Les tailles M et L restent à mesurer, sur un projet réel.

## Pièges et écarts constatés

> [!NOTE] Pas de prix ne veut pas dire pas de coût
> Sans `llm.prices`, chaque estimation et chaque rapport affichent encore des jetons — seule la colonne de la
> devise reste vide. Renseignez-le une fois les prix réels du contrat connus, pour qu'un chiffre ne soit jamais
> deviné.

> [!WARNING] Le total rapporté à la fin d'un agent n'est pas sa dépense
> C'est son dernier contexte : un sixième à un tiers des jetons consommés, dans le pilote. Enregistrez-le faute
> de mieux, puis prenez la dépense dans les transcriptions (le hook de statistiques, ou un `scan` à la fin).

## Pour aller plus loin

- [Les phases du skill](#/skill/phases) : où le triage, la rédaction et la relecture s'insèrent dans la méthode.
- [Suivre l'évolution de l'application](#/publish/sync) : `--estimate` sur les pages qu'un rapport sync liste.
- [Commandes : rédiger et vérifier](#/reference/cli/write-check~doc-kit-context) : `doc-kit context`, en détail.
