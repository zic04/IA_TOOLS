## En bref

L'espace reprise technique est le dossier dont une équipe a besoin pour reprendre une application — surtout une
application écrite en grande partie par des assistants IA (« vibe-codée »), dont les risques habituels sont :

| Risque | Où il se cache habituellement |
|---|---|
| Contrôle d'accès manquant | Une route sans vérification de locataire ou de ligne, le filtrage laissé à l'interface seule |
| Secrets dans le code ou le client | Une clé committée, ou envoyée au navigateur au lieu d'être lue côté serveur |
| Paquets qui n'existent pas | Un nom inventé par un assistant, importé mais jamais publié |
| Code dupliqué ou mort | La même logique copiée plutôt que partagée, ou gardée après avoir cessé d'être appelée |
| Tests manquants ou trompeurs | Un test qui n'affirme rien, ou un parcours critique sans aucun test |
| Fichiers d'instructions des agents comme spécification cachée | `AGENTS.md`, `CLAUDE.md` et semblables, jamais lus par l'équipe qui reprend |

Chaque affirmation de cet espace s'appuie sur une preuve (`file:line`), ou est marquée déduite ou inconnue — jamais
affirmée sur la foi.

## Par où commencer

:::etapes
1. **Lancez `doc-kit facts`** : il lit le code une fois, ne coûte aucun jugement, et donne à chaque autre page de
   quoi s'appuyer.
2. **Écrivez la page accès et propriété** : qui possède quoi est souvent le fil le plus long à tirer (un compte de
   registrar, un fournisseur de paiement), et la passation ne peut pas se clore avant.
3. **Construisez les pages que les faits préremplissent** : surface d'API, modèle de données, dépendances,
   instructions des agents — `doc-kit new --prefill` fait la part mécanique.
4. **Ajoutez ce que les faits ne voient pas** : la carte du code, la revue des tests, le modèle de menaces — lisez
   le code, puis écrivez.
5. **Consolidez le registre des risques en dernier** : une fois les autres pages écrites, leurs manques deviennent
   des constats numérotés.
:::

## Lire le code automatiquement : `doc-kit facts`

```bash
doc-kit facts                      # les neuf sources
doc-kit facts --source dependencies --network
doc-kit facts --tools              # aussi gitleaks, osv-scanner, syft, knip, quand ils sont installés
```

| Source | Ce qu'elle lit | Jamais |
|---|---|---|
| `dependencies` | Chaque manifeste et fichier de verrouillage trouvé sous l'application, jusqu'à 4 dossiers de profondeur | — |
| `env` | Les noms lus par le code, et par un fichier `.env` d'exemple | Une valeur |
| `api` | Les gestionnaires de route : Next.js, FastAPI, Express — avec `auth` et `guards` (voir plus bas) | — |
| `db` | Tables, colonnes, sécurité au niveau ligne et politiques : Prisma, SQLAlchemy, migrations SQL | — |
| `agents` | `AGENTS.md`, `CLAUDE.md` et semblables : taille, et tout caractère Unicode invisible | — |
| `secrets` | Fichier et règle d'un secret probable | La valeur |
| `security` | Onze heuristiques de l'OWASP Top 10 : règle, fichier, ligne, sévérité | Une valeur |
| `quality` | Fonctions, complexité, duplication, TODO, par fichier ; notes A à E globales | — |
| `tests` | Un décompte approximatif par fichier, et un rapport de couverture quand il en existe un | — |

`auth` de `api` (`"none"` \| `"user"` \| `"role"` \| `"unknown"`) et `guards` (les noms de garde trouvés)
alimentent la matrice d'accès statique de la revue de sécurité, et ce qu'attend `doc-kit probe` de chaque route
quand il vérifie une instance locale ou de démo en cours d'exécution : voir [Revues de sécurité et de
maintenabilité](#/spaces/reviews).

Chaque source écrit `facts/<source>.json` dans le projet de documentation, **jamais dans l'application** ; le même
code lancé sur le même commit écrit le même fichier, donc il peut être committé sans risque avec les pages qu'il
alimente. `--network` n'envoie que le nom d'une dépendance à son registre public, pour vérifier qu'elle existe ;
`--tools` lance ceux de `gitleaks`, `osv-scanner`, `syft` et `knip` qui sont sur le `PATH`, chacun dans son propre
`facts/tool-<nom>.json` (un outil absent est seulement signalé). Sans `app.dir` configuré, `doc-kit facts` refuse
de s'exécuter.

## Citer les faits sans les ressaisir : `::faits`

```markdown
::faits{source="api" colonnes="method,route,file"}
```

Construit un tableau à partir de `facts/<source>.json` au moment du build — une ligne par élément, les colonnes
listées, une légende avec la date de génération et le commit de l'application. Une source ou une colonne inconnue
fait échouer un build strict ; les dix types de pages de reprise sont construits autour de cette directive :
[Exemple · Surface d'API](#/examples/api-surface) et les autres exemples de l'espace reprise la montrent complétée
à la main avec l'authentification, le rôle et l'isolation par locataire.

## Dire ce que vous savez, ce que vous déduisez, ce qui reste ouvert

```markdown
La route accepte tout utilisateur connecté, de n'importe quelle région ([[verifie lib/orders.ts:42]]) ; si tous
les appelants passent bien par elle d'abord est [[inconnu]].
```

| Puce | Signifie |
|---|---|
| `[[verifie …]]` | Vérifiée directement dans le code ; la preuve après le mot est facultative |
| `[[deduit …]]` | Découle de ce qui a été lu, sans vérification ligne par ligne |
| `[[inconnu …]]` | Personne n'a pu le dire, dans le temps disponible |

`doc-kit audit` les additionne sur les pages de reprise écrites (`claims` : vérifiées, déduites, inconnues, et le
taux de vérifiées) et signale un fichier de faits dont le commit enregistré ne correspond plus au HEAD de
l'application (`facts` : périmé) — tous deux informatifs, sans jamais bloquer un niveau à eux seuls.

## Le registre des risques

`findings` devient un **registre des risques** : en plus du constat numéroté et de sa recommandation, chaque
ligne porte une colonne combinée « Suivi » — propriétaire, décision (corriger, accepter, transférer, éviter),
statut (ouvert, en cours, terminé, accepté), échéance. La gravité vient toujours de la famille du constat :

| Famille | Signification |
|---|---|
| **C** Critique | Un risque actuel pour la sécurité des données, la confidentialité ou la promesse centrale du produit |
| **I** Important | Un vrai défaut, un contournement possible, une fonctionnalité cassée ou trompeuse |
| **M** Mineur | Dette, incohérence, affichage ou hygiène |
| **P** Production | La configuration réelle diffère de ce que le code attend |
| **R** Sans effet (**N** en anglais) | Un réglage enregistré, ou un écran affiché, sans l'effet annoncé |

Un numéro ne change jamais une fois attribué : [Exemple · Points d'attention](#/examples/findings) montre le
registre complet, avec sa colonne « Suivi », pour Acme Orders.

## L'accès et la propriété, d'abord

La page `access-ownership` liste chaque actif qui doit changer de mains — domaine, dépôt, hébergement, base de
données, fournisseur de paiement, e-mail, **les comptes des outils IA utilisés en construisant l'application** —
avec son propriétaire, où il vit, comment le transmettre, et son statut. La page est complète quand « Propriétaires
inconnus » est vide : [Exemple · Accès et propriété](#/examples/access-ownership) en a encore deux.

## Pièges et écarts constatés

> [!ATTENTION] Ne jamais corriger l'application depuis le dossier de documentation
> Un écart trouvé en écrivant une page de reprise devient un constat numéroté, cité par les pages qui l'ont
> trouvé — jamais une modification du code de l'application.

> [!NOTE] Les outils IA sont aussi des actifs
> Un identifiant partagé `ci-claude@example.org`, ou le siège Copilot personnel d'un développeur avec accès en
> écriture au dépôt, sont des lignes de propriété comme les autres : la checklist de passation n'est pas terminée
> tant qu'ils sont encore partagés.

## Pour aller plus loin

- [Deux espaces, une seule source](#/spaces/overview) : déclarer `takeover`, l'export, `counterpart`.
- [Documenter chaque fonctionnalité](#/spaces/business) : l'espace pendant.
- [Suivre l'évolution de l'application](#/publish/sync) : la suite, une fois les faits et les constats en place.
- [Exemple · Surface d'API](#/examples/api-surface), [Exemple · Dépendances](#/examples/dependencies), [Exemple ·
  Fichiers d'instructions des agents](#/examples/agent-instructions).
