## En bref

1. **Déclarez `languages`** dans `doc.config.mjs` : la première est la langue source — `content/` la porte,
   exactement comme dans un projet mono-langue — chaque autre est une traduction. Un projet qui ne déclare jamais
   `languages` reste strictement inchangé : pas de sélecteur, pas de dossier de traductions.
2. **Traduisez dans `translations/<langue>/`**, un dossier qui reprend l'arborescence de `content/`, fichier par
   fichier : les pages, les introductions de section, `home.md`, `toc.json`, `glossary.json`, chaque fichier
   facultatif.
3. **Un seul fichier, chaque langue embarquée** : le site construit porte un sélecteur de langue et change sans
   recharger ; l'adresse porte toujours la langue courante, `#/fr/…`.
4. **Quatre états** comparent un fichier traduit à sa source : `missing` (manquante), `unmarked` (non marquée),
   `stale` (en retard), `current` (à jour) — `doc-kit translate status` les liste.
5. **Aucun appel à un LLM depuis le kit** : une personne, ou le brief `translate` du skill, écrit la page à partir
   du dossier que construit `doc-kit context <page> --translate <langue>`. Marquer une traduction
   (`translate --mark`) reste toujours une étape à part, délibérée.

## Déclarer les langues

```js
export default defineConfig({
  languages: ["fr", "en"],
});
```

- `languages[0]` est la langue source ; la `language` propre au site en est alors déduite.
- Un id de section, ou le premier segment d'un id de page, égal à une langue déclarée est l'erreur bloquante
  `languages.idClash`, même avec `--draft` : la grammaire d'URL ci-dessous réserve ces segments.
- Un projet neuf peut les déclarer dès sa création, au lieu de modifier la configuration à la main :
  `doc-kit init --languages fr,en` (`--lang` doit alors être absent ou égal au premier de la liste). Chaque
  langue sauf la première démarre avec un `translations/<langue>/.sources.json` vide : rien n'est pré-traduit, et
  `translate status` liste chaque fichier comme `missing` juste après `init`.

## Le dossier des traductions

`translations/<langue>/` (`paths.translations`, défaut `"translations"`) reprend `content/`, fichier par
fichier :

- `toc.json` : les **textes** seuls du sommaire — `title`, `tagline`, pour les sections `title`/`shortTitle`/
  `subtitle`/`highlights`, pour les groupes `title`, pour les pages `title`/`menuTitle`/`summary`, et les champs
  textuels propres aux parcours et aux espaces. Tout autre champ (ids, routes, permissions, `counterpart`,
  `spaces[].id`…) vient toujours de la **source** : une valeur traduite qui en diffère est ignorée, avec un
  avertissement. Un titre absent retombe silencieusement sur la source (un `toc.json` traduit partiel ne pose pas
  de problème) ; une section, un groupe, une page, un parcours ou un espace manquant, ajouté ou réordonné, ou un
  nombre d'étapes différent, est l'erreur bloquante `translation.toc.structure` — même avec `--draft`, comme un
  sommaire invalide.
- `glossary.json` : les mêmes entrées, dans le même ordre ; `term`, `def` et `pattern` traduits, `technical`
  toujours repris de la source. Un nombre d'entrées différent est une erreur en build strict, un avertissement
  avec `--draft` (le glossaire source est alors utilisé à sa place).
- `home.md`, `<section>/index.md`, `<page>.md` : le Markdown de cette langue — même syntaxe, mêmes ids de
  capture, mêmes ids de schéma, mêmes ids de règle que le fichier source qu'il traduit.
- `diagrams/<id>.svg` : un schéma traduit ; un schéma sans traduction reste partagé par toutes les langues.
- `.sources.json` : `{ "<fichier>": "<empreinte>" }`, une entrée par fichier traduit — de la comptabilité
  interne seulement, écrite uniquement par `translate --mark`. Ne le modifiez jamais à la main.

## Le sélecteur de langue et l'URL

Le site construit ajoute un sélecteur (barre du haut, ou tête du menu latéral sur un écran étroit), un bouton par
langue déclarée, étiqueté par son autonyme, la langue courante marquée. Chaque adresse gagne un préfixe de langue
facultatif : `#/[<langue>/]<chemin>`, par exemple `#/fr/`, `#/fr/@business`, `#/fr/utiliser/commandes~validation`.
Un lien écrit dans le Markdown, ou généré par le site, ne porte jamais ce préfixe : il signifie « la langue
affichée en ce moment ». Après avoir suivi un tel lien, la barre d'adresse est tout de même réécrite pour porter
la langue courante, sans ajouter d'entrée d'historique — une adresse partagée ou mise en favori nomme donc
toujours sa langue. Une page traduite seulement en partie affiche un bandeau, « Pas encore traduite — affichée en
{langue} », sur une page, une introduction de section ou la page d'accueil construites depuis la source à sa
place (seulement en build `--draft` ; un build strict refuse carrément une traduction manquante, voir plus bas).

## Les quatre états d'un fichier traduit

| État | Signification |
|---|---|
| `missing` (manquante) | Aucun fichier dans `translations/<langue>/`. |
| `unmarked` (non marquée) | Un fichier existe, mais n'a jamais été enregistré par `translate --mark`. |
| `stale` (en retard) | Un fichier a été marqué, mais sa source a changé depuis (l'empreinte enregistrée ne correspond plus au hachage actuel de la source) : à retraduire. |
| `current` (à jour) | Marqué, et sa source n'a pas changé depuis. |

## Vérifier l'état : `doc-kit translate`

```bash
doc-kit translate status [--lang <l>] [--check]
doc-kit translate --mark <page…> | --mark --all [--lang <l>]
doc-kit translate --fix-anchors [page…] [--lang <l>]
```

- **`status`** : pour chaque langue sauf la source (ou seulement `--lang <l>`), l'état de chaque fichier
  traduisible, les décomptes, puis les fichiers `stale` ou `missing`. Code de sortie 0 toujours ; `--check` le
  porte à 1 quand une langue listée a un fichier `stale` ou `missing` — une barrière qu'un projet peut ajouter à
  sa CI.
- **`--mark <page…>`** ou **`--mark --all`** : enregistre l'empreinte actuelle de la source de chaque élément
  dans `translations/<l>/.sources.json`. Un élément est un id de page, ou un chemin relatif à `content/` dès
  qu'il contient un point (`home.md`, `use/index.md`, `toc.json`, `glossary.json`) ; `--all` marque chaque
  fichier dont la traduction existe. Marquer un élément dont le fichier traduit manque fait échouer cette langue
  (`translate.missingFile`, code de sortie 1) sans rien écrire pour elle ; appeler `--mark` sans élément ni
  `--all` est une erreur d'usage (code de sortie 2).
- **`--fix-anchors [page…]`** : dans chaque page traduite, réécrit un lien `#/<cible>~<ancre>` dont l'ancre est
  un id de titre de la page cible **source** mais pas de la page traduite, vers le titre de la page traduite à la
  même position — seulement quand les deux pages ont le même nombre de titres. Un lien qu'il ne peut pas reporter
  reste tel quel et est signalé (cible non traduite, nombre de titres différent, ou ancre inconnue des deux
  pages).
- Marquer une traduction ne se produit jamais sans `--mark` ; le `doc-kit sync --mark` des pages, sans rapport
  avec celui-ci, ne touche jamais `.sources.json`.

## Écrire une traduction : le dossier et le brief

```bash
doc-kit context use/orders --translate fr
```

Écrit le dossier du traducteur, sans aucun code de l'application : l'id de la page, ses titres (source et
traduit), son gabarit, ses fichiers source et cible, et son état ; les titres à écrire, déjà dans la langue
cible, tirés du gabarit de la page ; une table de glossaire, terme source → terme traduit, pour les termes dont
le motif correspond à la page ; tout le Markdown source ; la traduction précédente, entière, quand elle existe ;
et, dans un projet de documentation qui est un dépôt git, le diff de la source depuis l'empreinte que
`translate --mark` a enregistrée en dernier — une ligne disant qu'il n'y en a pas, sinon. `--translate <langue>`
est exclusif avec `--update` (le dossier propre au rédacteur), et refuse la langue source ou une langue non
déclarée (code de sortie 2 dans les deux cas). `--budget` ne coupe jamais que le diff, puis la traduction
précédente : la page, ses sections, le glossaire et la source ne sont jamais coupés.

Le brief `translate` du skill (variables `{{lang}}`, `{{pages}}`, `{{contextFiles}}` ; agent `doc-kit-writer`)
lit ce dossier et au plus un fichier supplémentaire (la page source, en entier, quand le dossier seul ne suffit
pas) par page, garde chaque titre, directive, id, badge, portion de code, preuve et id de capture exactement
comme la source les a, ne traduit que la prose, puis lance `translate --fix-anchors`, `translate --mark`, et un
`build --draft` sur le lot qu'il vient d'écrire.

## Construire et capturer par langue

`doc-kit build` écrit toujours le fichier multilingue, chaque langue embarquée ; deux options en donnent un seul :

- **`doc-kit build --lang <l>`** : un fichier mono-langue, la sortie configurée avec `-<l>` avant son extension
  (`Acme-Orders-Documentation.html` → `Acme-Orders-Documentation-fr.html` ; `--output` le remplace). Ses données
  sont exactement ce que le fichier multilingue embarque pour `<l>`, sans les autres langues.
- **`doc-kit capture --lang <l>`** : prend les plans avec `capture.languages.<l>` (`locale`, `cookies`,
  `storage`, chacun fusionné par-dessus `capture.locale`/`capture.cookies`/`capture.storage` du haut ; `locale`
  prend par défaut la locale propre à cette langue) et écrit `<images>/<l>/<id>.webp` et
  `<images>/<l>/zones/<id>.json`. Une capture sans fichier pour `<l>` est partagée : chaque langue montre alors
  l'image source et ses zones. `check images` et `optimize` parcourent aussi `<images>/<l>/`.

`doc-kit view --lang <l>` et `doc-kit open --lang <l>` ouvrent le site sur `#/<l>/…` ; `doc-kit dev` surveille
aussi `<paths.translations>/`.

## Le cycle de mise à jour

Tout l'intérêt de l'empreinte enregistrée par `translate --mark` est que seules les pages dont la **source** a
changé depuis le dernier marquage ont besoin d'un traducteur : `doc-kit translate status` les montre, et elles
seules, comme `stale` — une page dont la source n'a pas bougé reste `current`, même des mois plus tard. Le
rapport de `doc-kit sync` gagne de la même façon une catégorie `translations`, qui liste chaque fichier `stale`
et `missing` sans jamais toucher git, et `doc-kit doctor` affiche une ligne de résumé par langue (`⚠` dès qu'un
fichier est en retard ou manquant, `✖` quand `translations/<l>/toc.json` lui-même manque) ; le mode guidé propose
`translate status` comme étape suivante dans ce cas. `doc-kit audit` ajoute un tableau « Traductions » (langue, à
jour, en retard, manquantes, et le ratio de fichiers à jour sur le total) — informatif seulement, il ne change
jamais le niveau de maturité.

## Pièges et écarts constatés

> [!ATTENTION] Un écart de structure bloque même un build brouillon
> Ajouter, retirer ou réordonner une section, un groupe, une page, un parcours ou un espace dans un `toc.json`
> traduit est `translation.toc.structure`, bloquant quel que soit le mode de build — seul le sommaire source peut
> changer de forme ; une traduction ne fournit jamais qu'un texte différent pour la même forme.

> [!NOTE] Une ancre non reportée est signalée, jamais devinée
> `translate --fix-anchors` ne réécrit une ancre que quand la page cible source et la page cible traduite ont
> exactement le même nombre de titres ; sinon il laisse le lien tel quel et nomme la raison
> (`translate.anchorUnmapped`). Traduire d'abord la page cible, puis relancer `--fix-anchors`, est le correctif
> habituel.

## Pour aller plus loin

- [Deux espaces, une seule source](#/spaces/overview) : `spaces`, l'autre mécanisme transversal qui refaçonne le
  même build.
- [Commandes : livrer et maintenir](#/reference/cli/deliver~doc-kit-translate) : la référence complète de
  `translate`.
- [La configuration](#/reference/configuration) : `languages`, `paths.translations`, `capture.languages`.
