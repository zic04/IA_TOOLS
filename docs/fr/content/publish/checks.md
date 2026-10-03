## En bref

`doc-kit check` lance les contrôles que le build ne fait pas, ou ne fait qu'en partie. Sans argument, il les lance
tous (`doc-kit check all`) ; le code de sortie vaut 1 dès que l'un d'eux échoue.

| Contrôle | La question à laquelle il répond | Navigateur |
|---|---|---|
| `coverage` | Chaque route, entrée de registre ou fichier de l'application est-il cité dans la documentation ? | non |
| `links` | Chaque lien interne, ancre et étape de parcours mène-t-il quelque part ? | non |
| `tables` | Un tableau défile-t-il en largeur à 1 440 px ? | oui |
| `images` | Y a-t-il des images orphelines, absentes, lourdes ou périmées ? | non |
| `secrets` | Y a-t-il une clé, un jeton, un GUID ou une valeur du `.env` local dans les pages ou dans le site ? | non |

Chaque contrôle travaille sur un build brouillon fait en mémoire : il peut tourner alors que des pages manquent
encore.

## Couverture

```bash
doc-kit check coverage
```

Les adaptateurs de couverture de `coverage` (configuration) listent ce que contient l'application : les routes
d'une application Next.js ou React Router (l'option `api: true` de `next-app-router` ajoute ses gestionnaires de
route comme seconde famille), les gestionnaires de route FastAPI (`fastapi`), les opérations d'un document
OpenAPI ou Swagger (`openapi`), les entrées d'un registre avec leurs libellés (`i18n-registry`), les
fonctionnalités métier candidates de `features.json` (`features`), un élément par fait lu par `doc-kit facts`
(`facts`, [Reprendre une application vibe-codée](#/spaces/takeover)), ou les fichiers d'un dossier (`glob`). Un
élément est **couvert** quand l'un de ses textes apparaît dans une page **écrite** (`content/**/*.md` et `*.json`,
les `routes` de son entrée du sommaire comprises), sans tenir compte de la casse ni des espaces. Une route
`/orders/[id]` est couverte par `/orders/[id]`, `/orders/:id`, `/orders/{id}` ou son préfixe statique `/orders/`.
Chaque adaptateur intégré et ses options sont listés sur [Les adaptateurs](#/reference/adapters~les-adaptateurs-de-couverture).

```text
✔ Routes : 14/14
✖ Widgets : 9/11
    manque : revenue-by-region (« Revenue by region »)
    manque : overdue-invoices (« Overdue invoices »)

23/25 éléments couverts.
  → citez chaque élément manquant dans une page, ou dans les routes du sommaire
```

Tant que des pages restent à écrire, les éléments que seules leurs entrées citent sont affichés à part : c'est le
plan, pas encore la documentation.

```text
✖ Routes : 2/14
    manque : /commandes — prévu dans utiliser/commandes, pas encore écrite
    …
2/14 éléments couverts.
  12 éléments de plus ne sont cités que par les entrées de pages pas encore écrites (14/14 une fois écrites)
```

Un adaptateur qui ne trouve pas sa source (l'application n'est pas à côté de la documentation) est **ignoré**, pas en
échec. Sans aucun adaptateur, `check all` ignore la couverture et `check coverage` s'arrête avec le code de sortie 2.
Une page déclarée sans son fichier, ou qui contient encore des consignes de gabarit, n'est pas encore écrite : ni
son texte ni son entrée dans le sommaire (titre, `routes`) ne comptent, si bien que ni le plan seul ni les exemples
d'un squelette neuf ne couvrent une route de l'application.
`doc-kit inventory` liste ce que voient les adaptateurs, couvert ou non ; `doc-kit inventory --json` est un bon point
de départ pour un sommaire. Ce site contrôle sa propre couverture : chaque clé de configuration, option de la ligne
de commande, adaptateur intégré et commande est cité ([Les adaptateurs](#/reference/adapters~ecrire-un-adaptateur)).

## Liens

```bash
doc-kit check links
```

Chaque lien `#/page` et `#/page~ancre` de chaque page, chaque étape des parcours de la page d'accueil, et le
`counterpart` de chaque page (`link.counterpart` : une page inconnue, une ancre inconnue, ou une page qui se cite
elle-même). Le build strict bloque sur les mêmes erreurs ; ce contrôle tourne sur un brouillon, il peut donc
servir alors que des pages manquent.

## Tableaux

```bash
doc-kit check tables --width 1280
```

Ouvre chaque page du site construit (ou d'un build brouillon) dans un Chromium sans interface, à la largeur donnée
(1 440 par défaut), et signale les tableaux plus larges que la colonne de lecture, avec le titre qui les précède :
`utiliser/commandes › Référence de chaque réglage : 1012 px pour 840 px`. Moins de colonnes, des cellules plus
courtes, ou deux tableaux.

## Images

```bash
doc-kit check images --threshold 300
```

| Constat | Niveau |
|---|---|
| Une capture citée par une page mais introuvable, ou dont l'image manque | erreur |
| Une image orpheline : dans `images/` mais citée par aucune page | erreur |
| Un fichier de zones dont l'image manque, et qu'aucune page ne cite | erreur |
| Une image lourde : au-delà du seuil (`--threshold`, en Ko, 200 par défaut) | avertissement |
| Une capture périmée : la `version` de son fichier de zones diffère de la version documentée | avertissement |

## Secrets

```bash
doc-kit check secrets
```

Le contrôle des secrets cherche dans les **sources texte** (`content/`, fichiers de zones, plans de capture, schémas)
et dans le **texte du site construit** (pages, introductions des sections, page d'accueil, glossaire) :

- les valeurs des fichiers de `masking.env` dont la clé semble sensible, les GUID (sauf
  `00000000-0000-0000-0000-000000000000`) et les `masking.patterns` ;
- de vraies valeurs secrètes : un bloc de clé privée avec son contenu, un JWT, le mot de passe d'une chaîne de
  connexion ou d'une URL, une clé d'accès cloud, la valeur affectée à une clé, un jeton ou un mot de passe, la
  signature d'une URL signée.

Une simple mention n'est pas un secret : un texte de remplacement (`<password>`, `****`, `${SECRET}`, `example`,
`exemple`, `motdepasse`, un nom de variable en capitales) est ignoré. Un constat indique où il se trouve, et seulement
les premiers caractères et la longueur de la valeur. Le contrôle signale aussi un fichier de session trouvé hors de
`.doc-kit/`, et un fichier de session suivi par git.

Jamais signalés non plus, quel que soit le détecteur :

| Pas un secret | Exemple |
|---|---|
| Une adresse locale ou privée, seule, avec un port, ou comme hôte d'une URL sans identifiants | `0.0.0.0`, `127.0.0.1:8000`, `http://192.168.1.20/api` |
| Une valeur à l'intérieur d'un modèle d'URL, une URL à variables `{…}` | `https://tiles.example.org/{z}/{x}/{y}.png?key=…` |
| Une valeur qui correspond à `masking.exclude` | `localhost` avec la valeur par défaut |
| Une valeur connue pour être publique, listée dans `masking.allow` | la clé navigateur d'un service de cartes |

Les GUID restent signalés tant que `masking.allow` ne les nomme pas
([Le masquage](#/capture/masking~valeurs-connues-pour-etre-publiques)) ; un mot de passe dans une URL reste
signalé, même quand l'hôte est privé. Avec `--json`,
`secrets.ignored` compte ce qui a été écarté, par règle : `local`, `template`, `exclude`, `allow`.

## Métier, reprise et espaces : contrôlés par le build, pas par `check`

Ces barrières s'exécutent dans `doc-kit build` lui-même (strict ou `--draft`), pas comme une catégorie séparée de
`doc-kit check` — `standard/quality.md` dans le kit les liste toutes en détail :

| Barrière | Échoue sur |
|---|---|
| `space.*` | Une section sans `space` ; `space` nommant un identifiant inconnu ou non déclaré ; un espace déclaré deux fois, ou un espace personnalisé sans `title` — seulement une fois `spaces` déclaré ([Deux espaces, une seule source](#/spaces/overview~declarer-les-espaces)) |
| `feature.*`, `rule.*` | Un identifiant `feature` déclaré sur le mauvais gabarit, ou deux fois ; `[[feature …]]` ou `[[rule …]]` citant un identifiant inconnu ; un `:::rule` sans `id` ni `title`, ou défini deux fois ([Documenter chaque fonctionnalité](#/spaces/business)) |
| `facts.*` | `::facts{source="…"}` nommant une source sans fichier `facts/<source>.json`, ou une entrée `columns` que le fichier n'a pas ([Reprendre une application vibe-codée](#/spaces/takeover~lire-le-code-automatiquement-doc-kit-facts)) |
| `business.technical` (avertissement) | Une page dont l'espace effectif est `business` contient une preuve `file:line` : déplacez-la derrière le `counterpart` de la page |

Correction : écrivez ou déclarez l'identifiant manquant une seule fois, lancez `doc-kit facts` d'abord, ou
corrigez l'identifiant, la colonne ou le nom de l'espace.

## Pièges et écarts constatés

> [!ATTENTION] Les images ne sont pas lues
> `check secrets` ne lit que du texte. Un secret visible **dans une capture** n'est pas trouvé : le masquage et la
> relecture de chaque image sont la seule protection ([Le masquage](#/capture/masking)).

> [!NOTE] En intégration continue
> `doc-kit check all` a besoin de Chromium pour les tableaux. Sans lui, lancez les autres contrôles un par un, ou
> installez le navigateur dans le pipeline ([L'intégration continue](#/publish/ci)).

## Pour aller plus loin

- [Construire le site](#/publish/build) : ce que le build strict bloque déjà.
- [L'audit et les niveaux de maturité](#/publish/audit) : les contrôles traduits en niveau.
- [Commandes : rédiger et vérifier](#/reference/cli/write-check) : les options de `check`.
- [Les adaptateurs](#/reference/adapters) : chaque adaptateur de couverture, intégré ou le vôtre.
- [Deux espaces, une seule source](#/spaces/overview) : les barrières `space.*`, en contexte.
