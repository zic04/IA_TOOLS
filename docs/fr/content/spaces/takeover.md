## En bref

Le dossier de reprise réunit ce dont une équipe a besoin pour reprendre une application — surtout une
application écrite en grande partie par des assistants IA (« vibe-codée »), dont les risques habituels sont :

| Risque | Où il se cache habituellement |
|---|---|
| Contrôle d'accès manquant | Une route sans vérification de locataire ou de ligne, le filtrage laissé à l'interface seule |
| Secrets dans le code ou le client | Une clé committée, ou envoyée au navigateur au lieu d'être lue côté serveur |
| Paquets qui n'existent pas | Un nom inventé par un assistant, importé mais jamais publié |
| Code dupliqué ou mort | La même logique copiée plutôt que partagée, ou gardée après avoir cessé d'être appelée |
| Tests manquants ou trompeurs | Un test qui n'affirme rien, ou un parcours critique sans aucun test |
| Fichiers d'instructions des agents comme spécification cachée | `AGENTS.md`, `CLAUDE.md` et semblables, jamais lus par l'équipe qui reprend |

Ses pages vivent dans l'espace Développer — architecture, parcours, sécurité, risques, maintenance — sauf celles de
l'exploitation, lues par les exploitants : le DAT, le manuel d'exploitation, les variables, les ressources, les
accès et la propriété se rangent dans la partie Exploiter de l'espace Administrer. Chaque affirmation du dossier
s'appuie sur une preuve (`file:line`), ou est marquée déduite ou inconnue — jamais affirmée sur la foi ; l'audit
attend ces preuves sur les pages de l'espace Développer.

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
doc-kit facts                      # toutes les sources
doc-kit facts --source dependencies --network
doc-kit facts --tools              # aussi gitleaks, osv-scanner, syft, knip, quand ils sont installés
```

| Source | Ce qu'elle lit | Jamais |
|---|---|---|
| `dependencies` | Chaque manifeste et fichier de verrouillage trouvé sous l'application, jusqu'à 4 dossiers de profondeur ; pour une licence qu'aucun fichier de verrouillage ne donne, la copie installée (`node_modules/`, `.venv/`) | Exécuter quoi que ce soit d'installé, suivre un lien qui sort de l'application |
| `env` | Les noms lus par le code, et par un fichier `.env` d'exemple | Une valeur |
| `api` | Les gestionnaires de route : Next.js, FastAPI, Express — avec `auth` et `guards` (voir plus bas) | — |
| `db` | Tables, colonnes, sécurité au niveau ligne et politiques : Prisma, SQLAlchemy, migrations SQL | — |
| `behaviours` | Le comportement d'une recherche, d'un filtre, d'un tri, d'une pagination, d'un formulaire : des indices lus dans le code de chaque pile (filtres de tableaux, Prisma, SQL, Django, SQLAlchemy, zod, pydantic, formulaires HTML, OpenAPI), pour les fiches de fonctionnalité | Une chaîne telle qu'écrite, un test, un commentaire |
| `agents` | `AGENTS.md`, `CLAUDE.md` et semblables : taille, et tout caractère Unicode invisible | — |
| `secrets` | Fichier et règle d'un secret probable | La valeur |
| `security` | Onze heuristiques de l'OWASP Top 10 : règle, fichier, ligne, sévérité | Une valeur |
| `quality` | Fonctions, complexité, duplication, TODO, par fichier ; notes A à E globales | — |
| `tests` | Un décompte approximatif par fichier, et un rapport de couverture quand il en existe un | — |

`auth` de `api` (`"none"` \| `"user"` \| `"role"` \| `"unknown"`) et `guards` (les noms de garde trouvés)
alimentent la matrice d'accès statique de la revue de sécurité, et ce qu'attend `doc-kit probe` de chaque route
quand il vérifie une instance locale ou de démo en cours d'exécution : voir [Revues de sécurité et de
maintenabilité](#/spaces/reviews).

Le `license` de `dependencies` est le nom d'une licence ou une expression SPDX, jamais son texte, et `licenseFrom`
dit où il a été lu : `"lock"`, l'entrée de l'élément lui-même dans un `package-lock.json` ou un `composer.lock` ;
sinon, pour npm et pip, `"installed"`, sa copie installée, lue hors ligne — `node_modules/<nom>/package.json`, la
copie que Node chargerait, du dossier du manifeste jusqu'à celui de l'application, ou le `*.dist-info/METADATA` d'un
dossier `.venv/` ou `venv/` (`License-Expression`, un `License` d'une ligne, les classificateurs de licence). Cette
copie ne compte que si elle se trouve dans l'application (un lien qui en sort n'est jamais suivi), porte le nom de
l'élément et, quand l'élément indique une version exacte, cette version ; un `package.json` de plus de 1 Mo n'est
pas lu, ni un METADATA au-delà de son en-tête. Une application récupérée sans ses installations (ni `node_modules/`,
ni environnement virtuel) n'a que les licences que donnent ses fichiers de verrouillage.

Chaque source écrit `facts/<source>.json` dans le projet de documentation, **jamais dans l'application** ; le même
code lancé sur le même commit écrit le même fichier, donc il peut être committé sans risque avec les pages qu'il
alimente. `--network` n'envoie **que les paquets que vous listez** dans `doc.config.mjs`, un par un, sans joker :

```js
facts: { network: { allow: ["npm:react", "npm:@types/node", "pip:fastapi"] } },
```

Sans liste, rien n'est envoyé : `doc-kit facts --network` dit combien de paquets directs il a retenus, et
`doc-kit facts --network --json` les donne dans `network.candidates` — seulement des noms qu'un fichier de
verrouillage prouve publics et que rien ne déclare privés. Relisez-les avec le responsable de l'application, puis
listez ceux que vous acceptez d'envoyer. Un élément que la liste retient reçoit `unlisted: true`. Un nom listé reste
jugé comme ci-dessous : lister un paquet privé ou non prouvé ne l'envoie jamais. Pour un nom listé, `--network`
demande au registre de chaque dépendance directe, une requête par paquet, sa dernière version : chaque élément reçoit `exists`, `latest` et `majorsBehind` (combien de versions majeures de retard sur la dernière ;
`null` quand la version utilisée ou la réponse ne le dit pas, comme pour un paquet jamais demandé) et, quand ni son
fichier de verrouillage ni sa copie installée n'ont donné sa licence, celle que déclare la dernière version (`licenseFrom: "registry"` : ce
n'est pas forcément celle de la version installée) ; la réponse du registre n'est gardée que si elle se lit comme une
version et un nom de licence. Il n'envoie que le nom d'une dépendance, jamais sa version, et seulement si un fichier
de verrouillage prouve que le registre public l'a servie (`package-lock.json`, `yarn.lock` de Yarn 1,
`poetry.lock`, `uv.lock`) — un nom connu par un manifeste seul, `pnpm-lock.yaml`, un lock de Yarn berry ou
un `Pipfile.lock` n'est jamais envoyé — et jamais le nom d'un paquet privé (un paquet de l'application elle-même, une portée à registre propre, un
index privé, un paquet de workspace, local ou hébergé en privé), lu dans l'application, ses fichiers de
verrouillage, chaque dossier jusqu'à chaque manifeste, et votre propre configuration npm, yarn, bun, pip, uv et
Poetry (quand vos installations passent par un registre ou un miroir d'entreprise que les fichiers de verrouillage
ne nomment pas — `replace-registry-host` de npm, le plugin de miroir PyPI de Poetry —, déclarez-le là, ou dans une
variable, avant `--network`) ;
`--tools` lance ceux de `gitleaks`, `osv-scanner`, `syft` et `knip` qui sont sur le `PATH` — jamais un de
l'application, du projet de documentation ni d'un `node_modules/.bin` : un `knip` installé seulement dans les
`devDependencies` de l'application n'est pas lancé, installez-le en dehors —, chacun dans son propre
`facts/tool-<nom>.json` avec un état (`ok`, `findings`, `failed`, `missing`) et seulement les champs utiles (règle,
fichier, ligne, paquet, version…), jamais un secret ni une ligne de code. `osv-scanner` fonctionne hors ligne : sa
base n'est téléchargée qu'avec `--network`. Sans `app.dir` configuré, `doc-kit facts` refuse de s'exécuter.

## Citer les faits sans les ressaisir : `::faits`

```markdown
::faits{source="api" colonnes="method,route,file"}
```

Construit un tableau à partir de `facts/<source>.json` au moment du build — une ligne par élément, les colonnes
listées, une légende avec la date de génération et le commit de l'application. Une source ou une colonne inconnue
fait échouer un build strict ; les dix types de pages de reprise sont construits autour de cette directive :
[Exemple · Surface d'API](#/examples/api-surface) et les autres exemples de la reprise la montrent complétée
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

- [Quatre espaces, une seule source](#/spaces/overview) : déclarer `develop` et `admin`, l'export, `counterpart`.
- [Documenter chaque fonctionnalité](#/spaces/business) : l'espace Produit, le pendant de celui-ci.
- [Suivre l'évolution de l'application](#/publish/sync) : la suite, une fois les faits et les constats en place.
- [Exemple · Surface d'API](#/examples/api-surface), [Exemple · Dépendances](#/examples/dependencies), [Exemple ·
  Fichiers d'instructions des agents](#/examples/agent-instructions).
