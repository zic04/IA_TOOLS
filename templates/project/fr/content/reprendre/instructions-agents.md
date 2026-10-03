## En bref

<!-- consigne : combien de fichiers d'instructions, leur taille globale, et si quelque chose de caché a été trouvé. Générez d'abord les faits : `doc-kit facts --source agents`. -->

Exemple : « Un fichier d'instructions de quelques centaines de mots ; aucun caractère caché trouvé. »

## Les fichiers

<!-- consigne : une ligne par fichier d'instructions trouvé (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`…), sa taille. Lancez `doc-kit facts --source agents` et remplissez ce tableau depuis `facts/agents.json`. -->

| Fichier | Lignes | Mots |
|---|---|---|
| `AGENTS.md` | `42` | `310` |

## Chaque règle

<!-- consigne : une ligne par règle énoncée par le fichier, son statut une fois confrontée au code réel : confirmée, obsolète (le code a évolué), ou contredite (le code fait l'inverse). -->

| Règle | Fichier:ligne | Statut | Preuve |
|---|---|---|---|
| Règle d'exemple | `chemin/fichier.md:12` | Confirmée | [[verifie chemin/fichier.ts:5]] |

## Caractères invisibles

<!-- consigne : tout caractère invisible pour un relecteur humain trouvé dans un fichier d'instructions (ARCHITECTURE.md §6.9) : un piège connu d'injection de prompt. Listez chacun ; une section vide est une bonne nouvelle, dites-le au lieu de supprimer la section. -->

Aucun caractère caché n'a été trouvé dans un fichier d'instructions.

## Ce qu'il faut garder

<!-- consigne : une fois chaque règle statuée, ce qu'il faut verser dans cette documentation et ce que le fichier d'instructions peut abandonner sans risque. -->

- Gardez les règles qui correspondent au code ; abandonnez celles que le code a dépassées.
