## En bref

`content/glossary.json` liste les termes du produit. Dans chaque page, la **première occurrence** de chaque terme est
soulignée en pointillés et reçoit une infobulle avec sa définition ; le même terme, plus loin dans la page, est laissé
tel quel.

```json
[
  { "term": "Circuit de validation", "pattern": "circuits? de validation", "def": "La liste ordonnée des personnes qui valident une commande avant son envoi." },
  { "term": "Périmètre", "pattern": "périmètres?", "def": "Les clients et les commandes qu'un utilisateur a le droit de voir, fixés par son équipe." }
]
```

| Champ | Obligatoire | Rôle |
|---|---|---|
| `term` | oui | Le terme, affiché en gras en haut de l'infobulle |
| `def` | oui | Une phrase, compréhensible sans le reste du site |
| `pattern` | non | Une expression régulière JavaScript pour les pluriels et les variantes (les drapeaux `i` et `u` sont ajoutés) ; par défaut : le terme lui-même |

## Ce qui reçoit une infobulle

- Des mots entiers seulement : `commande` ne correspond pas à l'intérieur de `recommande`.
- Jamais dans les titres, les liens, le code, les touches, les badges, les légendes, les en-têtes de tableau ni les
  schémas.
- Chaque terme une fois par page, à sa première correspondance dans l'ordre de lecture.
- La recherche n'utilise pas le glossaire ; le lecteur survole le terme ou lui donne le focus (il est accessible au
  clavier).

## Choisir les termes

Un terme entre au glossaire quand il a un sens **propre au produit** (« Circuit de validation », « Périmètre ») ou
quand il est **ambigu** (« Délégué » : une personne qui valide pour le compte de quelqu'un d'autre, pas un rôle). Ne
définissez pas les mots courants du métier : une infobulle tous les deux mots fatigue le lecteur.

`doc-kit audit` compte les termes : au moins 1 pour le niveau 1, au moins 20 pour le niveau 3. Le glossaire est géré
de façon centrale : quand plusieurs personnes rédigent, elles proposent des termes avec leur définition, et une seule
personne les ajoute.

## Pièges et écarts constatés

> [!ATTENTION] Un motif qui en attrape trop
> Un mot est entier quand il n'est pas collé à une lettre, un chiffre ou `_` : `"pattern": "commandes?"` attrape aussi
> le « commande » de « sous-commande », et `"pattern": "app"` attrape chaque « app » du site. Préférez le terme exact,
> avec son pluriel.

> [!ERREUR] Un motif invalide arrête le build
> « glossaire : motif invalide pour « Périmètre » (…) » : le motif est une expression régulière ; échappez `(`, `)`,
> `.` et `?` quand vous voulez ces caractères tels quels.

> [!NOTE] Les anciens fichiers
> Un ancien `glossaire.json` (`terme`, `motif`, `def`) est lu tel quel ; `doc-kit migrate` le réécrit en
> `glossary.json`.

## Pour aller plus loin

- [Sommaire, sous-pages et parcours](#/write/table-of-contents) : l'autre fichier central du contenu.
- [L'audit et les niveaux de maturité](#/publish/audit) : l'indicateur `glossary`.
