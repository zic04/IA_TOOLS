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

Les adaptateurs de couverture de `coverage` (configuration) listent ce que contient l'application : les routes d'une
application Next.js ou React Router, les entrées d'un registre avec leurs libellés, les fichiers d'un dossier. Un
élément est **couvert** quand l'un de ses textes apparaît dans la documentation (`content/**/*.md` et `*.json`, les
`routes` du sommaire comprises), sans tenir compte de la casse ni des espaces. Une route `/orders/[id]` est couverte
par `/orders/[id]`, `/orders/:id`, `/orders/{id}` ou son préfixe statique `/orders/`.

```text
✔ Routes : 14/14
✖ Widgets : 9/11
    manque : revenue-by-region (« Revenue by region »)
    manque : overdue-invoices (« Overdue invoices »)

23/25 éléments couverts.
  → citez chaque élément manquant dans une page, ou dans les routes du sommaire
```

Un adaptateur qui ne trouve pas sa source (l'application n'est pas à côté de la documentation) est **ignoré**, pas en
échec. Sans aucun adaptateur, `check all` ignore la couverture et `check coverage` s'arrête avec le code de sortie 2.
Une page qui contient encore des consignes de gabarit n'est pas encore écrite : ni son texte ni son entrée dans le
sommaire (titre, `routes`) ne comptent, si bien que les exemples d'un squelette neuf ne couvrent jamais une route de
l'application.
`doc-kit inventory` liste ce que voient les adaptateurs, couvert ou non ; `doc-kit inventory --json` est un bon point
de départ pour un sommaire. Ce site contrôle sa propre couverture : chaque clé de configuration, option de la ligne
de commande, adaptateur intégré et commande est cité ([Les adaptateurs](#/reference/adapters~ecrire-un-adaptateur)).

## Liens

```bash
doc-kit check links
```

Chaque lien `#/page` et `#/page~ancre` de chaque page, et chaque étape des parcours de la page d'accueil. Le build
strict bloque sur les mêmes erreurs ; ce contrôle tourne sur un brouillon, il peut donc servir alors que des pages
manquent.

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
