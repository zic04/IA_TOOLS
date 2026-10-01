## En bref

`content/toc.json` est le plan du site. Le build en tire tout : le menu, les sections, le fil d'Ariane, l'ordre des
pages, les liens précédent et suivant, les parcours de lecture de la page d'accueil et les suggestions de la recherche.

1. **Les sections** sont les grandes parties du site (`utiliser`, `configurer`, `administrer`, `reprendre` dans le
   standard).
2. **Les groupes** réunissent 2 à 12 pages d'une section sur un même sujet.
3. **Les pages** sont des fichiers `content/<id>.md` ; une page avec `"level": 2` est une **sous-page** de la page de
   niveau 1 placée au-dessus d'elle.
4. **Les parcours** sont les chemins de lecture guidés de la page d'accueil.
5. **Les suggestions** sont les pages que propose la recherche quand son champ est vide.

La page d'accueil est `content/home.md` ; chaque section peut avoir une introduction, `content/<id-de-section>/index.md`.

## Le fichier

```json
{
  "title": "Documentation d'Acme Orders",
  "tagline": "Chaque écran, chaque réglage, et leur fonctionnement réel.",
  "sections": [
    {
      "id": "utiliser", "title": "Utiliser Acme Orders", "shortTitle": "Utiliser", "icon": "screen",
      "subtitle": "Le quotidien du commercial.", "highlights": ["La fiche commande", "Les validations"], "featured": true,
      "groups": [
        { "title": "Commandes", "pages": [
          { "id": "utiliser/commandes", "title": "La liste des commandes", "menuTitle": "Commandes", "summary": "Trouver, filtrer et ouvrir les commandes.",
            "template": "screen", "routes": ["/orders"], "permissions": ["orders:read"] },
          { "id": "utiliser/commandes/export", "title": "Exporter les commandes", "level": 2, "summary": "L'export CSV et ses colonnes." }
        ] }
      ]
    }
  ],
  "journeys": [{ "title": "Découvrir Acme Orders", "description": "Les pages à lire en premier.", "steps": ["utiliser/commandes"] }],
  "suggestions": ["utiliser/commandes"]
}
```

## Les champs d'une section

| Champ | Obligatoire | Rôle |
|---|---|---|
| `id` | oui | L'adresse de la section (`#/utiliser`) et le premier segment des ids de ses pages |
| `title` | oui | Titre de la vue d'ensemble de la section et de sa carte sur la page d'accueil |
| `shortTitle` | non | Libellé dans la barre du haut |
| `icon` | non | Une icône du kit, par son nom : `screen`, `book`, `sliders`, `shield`, `code`, `map`, `play`, `gear`, `info`, `tip`, `warning`, `lock`, `recipe`, `link`, `clock`, `search`… ou une icône déclarée dans `theme.icons` |
| `subtitle` | non | Une phrase sous le titre |
| `highlights` | non | Trois points forts courts, sur la carte de la page d'accueil |
| `featured` | non | `true` : la carte est mise en avant, et le bouton principal de la page d'accueil mène à cette section |
| `groups` | oui | Liste de `{ title, pages }` ; `title` est facultatif |

## Les champs d'une page

| Champ | Obligatoire | Rôle |
|---|---|---|
| `id` | oui | Adresse de la page (`#/utiliser/commandes`) et fichier `content/<id>.md` ; ni espace, ni `~`, ni `#` |
| `title` | oui | Titre de la page ; le fichier Markdown n'a pas de titre `#` |
| `menuTitle` | non | Libellé plus court dans le menu |
| `summary` | non | Une phrase, affichée sous le titre, dans la vue d'ensemble de la section et dans la recherche |
| `level` | non | `2` pour une sous-page |
| `template` | non | Le type de la page ([Les gabarits de page](#/write/page-templates)) |
| `routes` | non | Les routes de l'application documentées ici : des badges en haut de la page, et du texte pour le contrôle de couverture |
| `permissions` | non | Des codes de permission : des badges en haut de la page |
| `file` | non | Le fichier source, relatif à `content/`, quand ce n'est pas `<id>.md` |

## Les sous-pages

Une page avec `"level": 2` appartient à la dernière page de niveau 1 placée au-dessus d'elle **dans le même groupe**.
Dans le menu, la parente affiche le nombre de ses sous-pages, et les sous-pages apparaissent pendant que vous lisez la
parente ou l'une d'elles. Le fil d'Ariane montre la parente.

Découpez une page en sous-pages quand elle dépasse environ 2 000 mots : la parente garde la réponse courte
(« En bref ») et un tableau « Dans cette partie » avec un lien vers chaque sous-page ; chaque sous-page porte un seul
mécanisme. Remplacez par un lien chaque « ci-dessous » et chaque « plus haut » qui vise désormais une autre page.

## Les parcours : les chemins de lecture de la page d'accueil

```json
"journeys": [
  { "title": "Essayer en cinq minutes", "description": "Installer, capturer, lire.",
    "steps": ["start/install", "start/first-five-minutes", "start/generated-site"] }
]
```

Chaque parcours est une carte de la page d'accueil, avec ses pages numérotées. Le standard recommande un parcours par
lecteur, de 5 à 7 pages, et `doc-kit audit` attend au moins 3 parcours pour le niveau 3. Chaque étape doit être un id
de page du plan : une étape inconnue est une erreur du build (« parcours « … » : page inconnue … »).

## Pièges et écarts constatés

> [!ATTENTION] Changer un id casse ses liens
> Un id est une adresse. Renommer `utiliser/commandes` en `utiliser/commandes/liste` casse chaque lien qui y mène ; le
> build les liste. Renommez aussi le fichier (ou renseignez `file`).

> [!NOTE] `product` est obsolète
> Les plans plus anciens ont un champ `product`. Le nom du produit vient désormais de `doc.config.mjs` ; le build
> avertit quand les deux diffèrent, et la configuration l'emporte.

> [!NOTE] Les anciennes clés françaises
> Un plan écrit avant le kit (`contenu/sommaire.json`, avec `titre`, `groupes`, `niveau`…) est lu tel quel ;
> `doc-kit migrate` le réécrit ([Migrer un projet ancien](#/migrate/legacy-project)).

## Pour aller plus loin

- [Les gabarits de page](#/write/page-templates) : le champ `template` et `doc-kit new`.
- [Le glossaire](#/write/glossary) : l'autre fichier central du contenu.
- [Le site généré](#/start/generated-site) : où chaque champ apparaît.
