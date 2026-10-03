## L'objectif

En cinq minutes, vous créez le projet de documentation d'une vraie application (fictive), vous capturez son premier
écran avec des pastilles numérotées, et vous ouvrez le site avec rechargement automatique. L'application est
**Acme Orders**, la petite démo livrée avec le kit dans `examples/demo-app` : une page de connexion, une liste de
commandes, une fiche commande et une page de réglages.

> [!RECETTE] Ce qu'il vous faut
> - Le kit installé, et `doc-kit doctor` sans ✖ ([Installer doc-kit](#/start/install)).
> - Un terminal où vous pouvez taper : `connect` attend que vous appuyiez sur Entrée.
> - Cinq minutes libres. La démo ne demande ni base de données ni compte : elle accepte n'importe quels e-mail et
>   mot de passe.

## Qui fait quoi

| Étape | Commande | Ce que vous obtenez |
|---|---|---|
| 1 | `node serve.mjs` | L'application de démo sur `http://127.0.0.1:4173` |
| 2 | `doc-kit init` | `docs/manual/`, un squelette de projet complet avec ses deux espaces |
| 3 | `npm install` | Le projet relié au kit |
| 4 | `doc-kit connect` | Votre session, enregistrée dans `.doc-kit/session.json` |
| 5 | `doc-kit capture --preview` | `images/home.webp` et ses zones |
| 6 | `doc-kit dev` | Le site dans votre navigateur, reconstruit à chaque modification |

## Étape 1 — Démarrer l'application de démo

Copiez la démo hors du kit, pour que le projet de documentation ne soit pas créé dans le dépôt du kit, puis
démarrez-la et laissez le terminal ouvert :

```bash
cp -r <dossier du kit>/examples/demo-app acme-orders
node acme-orders/serve.mjs
```

Le terminal affiche `Acme Orders (demo) on http://127.0.0.1:4173`. Pour un autre port :
`node acme-orders/serve.mjs --port 4180`.

## Étape 2 — Créer le projet de documentation

Dans un deuxième terminal :

```bash
doc-kit init acme-orders --url http://127.0.0.1:4173
```

`init` examine le dossier de l'application (framework, routes, port, nom du produit), puis demande le **nom du
produit** (`Acme Orders`, d'après le nom du dossier), la **langue de la documentation** (`en` ou `fr`), **où prendre
les captures** (réponse 1, « application locale ou de démo » ; 2 est une production, en lecture seule) et la **méthode
de connexion** (`manual` : vous vous connectez, puis vous appuyez sur Entrée) ; il demande aussi l'**adresse de
l'application** quand `--url` n'est pas donné. Appuyez sur Entrée pour accepter chaque proposition. Avant d'écrire quoi
que ce soit, il affiche un **récapitulatif** : le nom du produit et sa provenance, l'identifiant, la langue, l'URL, la
version et le fichier où elle est lue, la connexion, la couverture, les fichiers `.env` masqués et le dossier de
l'application. Vérifiez-le, puis confirmez. Il écrit 27 fichiers dans `acme-orders/docs/manual/` et affiche les
commandes suivantes. Pour renommer le produit ensuite, changez `product.name` dans `doc.config.mjs` et les titres de
`content/toc.json`.

> [!NOTE] Un squelette dont les deux espaces sont déjà déclarés
> `content/toc.json` déclare déjà `spaces: ["business", "takeover"]` : **Utiliser**, **Fonctionnalités**,
> **Configurer** et **Administrer** dans `business` (une fiche de fonctionnalité d'exemple,
> `fonctionnalites/exemple-fonctionnalite`, identifiant `F-01`) ; **Reprendre** dans `takeover` (le dossier de
> reprise d'exemple : accès et propriété, manuel d'exploitation, instructions des agents, et
> `reprendre/architecture/exemple-fonctionnalite`, le pendant technique de la fonctionnalité d'exemple).
> `doc-kit build` et `doc-kit dev` produisent déjà un export par espace en plus du site complet —
> [Deux espaces, une seule source](#/spaces/overview) explique le mécanisme.

Une fois les fichiers écrits, `init` propose de continuer : « Ouvrir le navigateur maintenant pour vous connecter ? »
fait les étapes 3 et 4 pour vous, puis « Prendre une première capture de test avec --preview ? » fait l'étape 5.
Répondez `n` pour suivre les étapes une à une ci-dessous.

> [!ASTUCE] Sans questions
> `doc-kit init acme-orders --url http://127.0.0.1:4173 --name "Acme Orders" --auth manual --yes` prend les valeurs
> détectées et les options telles quelles, et affiche le même récapitulatif. La langue du site est alors celle de
> `--lang`, ou celle de votre système. Ajoutez `--capture none` pour une documentation sans aucune capture : les
> étapes 4 et 5 ne s'appliquent plus, et chaque écran est décrit par un tableau de ses éléments.

## Étape 3 — Relier le projet au kit

```bash
cd acme-orders/docs/manual
npm install
```

Le `package.json` du projet dépend du kit par un chemin `file:`. Sous Windows, npm le relie par une jonction de
répertoire : le projet exécute toujours le kit que vous avez installé.

## Étape 4 — Se connecter une fois

```bash
doc-kit connect
```

Une fenêtre Chromium s'ouvre sur l'application. Connectez-vous sur la page ci-dessous avec n'importe quels e-mail et
mot de passe, puis revenez au terminal et appuyez sur Entrée. Le kit vérifie que le navigateur n'est plus sur une
page de connexion, puis enregistre la session.

:::ecran{capture="sign-in" titre="Acme Orders · page de connexion de la démo"}
1. **E-mail** : n'importe quelle adresse ; la démo ne la vérifie pas.
2. **Password** : n'importe quelle valeur.
3. **Sign in** : ouvre la liste des commandes. De retour dans le terminal, appuyez sur Entrée.
:::

Le terminal confirme `✔ Session enregistrée : .doc-kit/session.json` et rappelle que ce fichier est un secret. Il est
ignoré par git.

## Étape 5 — Prendre la première capture

```bash
doc-kit capture --preview
```

Le plan du squelette, `captures/plans/example.mjs`, déclare une capture, `home`, avec trois zones : la barre du haut,
le menu et le contenu. La campagne se fait **en lecture seule** : toute requête autre que `GET`, `HEAD` et `OPTIONS`
est bloquée.

```text
1 capture · http://127.0.0.1:4173 · session : .doc-kit/session.json · lecture seule : activée
✔ home (3 zones, 30 Ko, 3.5 s)

1/1 capture produite.
Aperçus (zones en rouge, jamais publiés) : .doc-kit/<id>.zones.png
Lecture seule : 0 requête d'écriture bloquée
```

Ouvrez `.doc-kit/home.zones.png` : chaque zone y est tracée en rouge avec son numéro.

## Étape 6 — Ouvrir le site

```bash
doc-kit dev
```

Le site s'ouvre dans votre navigateur sur `http://127.0.0.1:4400/`. Ouvrez **Utiliser › Prise en main** : la capture
y est, avec ses trois pastilles et un bouton **Visite guidée**. La barre du haut affiche aussi un sélecteur
d'espace (« Tout », « Métier », « Reprise ») ; avec des espaces, `dev` sert aussi chaque export, sur
`/space/business` et `/space/takeover`. Modifiez `content/utiliser/prise-en-main.md` et enregistrez : la page se
recharge toute seule. Arrêtez le serveur avec [[touche Ctrl+C]].

## Comment savoir que ça marche

- **Projet** : `doc-kit doctor` dans `docs/manual` affiche ✔ pour la configuration, le sommaire et la session.
- **Capture** : `images/home.webp` et `images/zones/home.json` existent ; le fichier de zones contient trois zones.
- **Site** : la page **Prise en main** montre la capture avec les pastilles 1 à 3 ; survoler une pastille met en
  valeur l'élément de sa légende.
- **Mode guidé** : `doc-kit` seul dit maintenant que le projet est en place et propose `dev`, `audit`, `build`,
  `doctor`.

## Erreurs fréquentes et remèdes

| Symptôme | Cause probable | Remède |
|---|---|---|
| « l'application est injoignable » | La démo ne tourne pas, ou tourne sur un autre port | Refaites l'étape 1 ; ou `doc-kit connect --url http://127.0.0.1:4180` |
| « pas de session : .doc-kit/session.json » | Étape 4 sautée | `doc-kit connect` |
| « les dépendances du projet ne sont pas installées » | Étape 3 sautée | `npm install` dans `docs/manual` |
| « le dossier … existe déjà et n'est pas vide » | `init` a déjà été lancé | Utilisez le projet existant, ou `--dir docs/autre` |

## Pièges et limites à connaître

> [!ATTENTION] Le squelette n'est pas un site terminé
> Les pages d'exemple du squelette contiennent encore les consignes de leur gabarit et citent des captures et des
> schémas qui n'existent pas encore. `doc-kit dev` et `doc-kit build --draft` fonctionnent tout de suite ; le
> `doc-kit build` strict passe une fois les pages d'exemple écrites ou retirées. `doc-kit audit` liste ce qu'il reste
> à faire.

> [!NOTE] Une vraie application
> Avec votre propre application, `init` détecte Next.js (App Router) et React Router et écrit le contrôle de
> couverture correspondant. Sur une production, lisez [Démo ou production : capturer sans risque](#/capture/safety)
> avant votre première capture.

## Droits requis

> [!DROITS] Ce que demande cette recette
> - Sur la démo : rien, n'importe quels e-mail et mot de passe sont acceptés.
> - Sur une vraie application : un compte qui voit les écrans à documenter, utilisé **par vous** dans la fenêtre
>   ouverte par `connect`. Jamais un compte de service partagé.
> - Le droit d'écrire dans le dossier de l'application, où `init` crée `docs/manual/`.
