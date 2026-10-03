## En bref

<!-- consigne : combien de fichiers d'instructions, leur taille globale, et si quelque chose de caché a été trouvé. Générez d'abord les faits : `doc-kit facts --source agents`. -->

Exemple : « Un fichier d'instructions de quelques centaines de mots ; aucun caractère caché trouvé. »

## Les fichiers

<!-- consigne : construit à partir de `::faits{source="agents"}`. -->

::faits{source="agents" colonnes="file,lines,words"}

<!-- doc-kit:prefill source="agents" -->
| Fichier | Lignes | Mots | Caractères cachés |
|---|---|---|---|
| `AGENTS.md` | `42` | `310` | `0` |

## Chaque règle

<!-- consigne : une ligne par règle énoncée par le fichier, son statut une fois vérifiée face au code réel : confirmée, obsolète (le code a évolué), ou contredite (le code fait l'inverse). -->

| Règle | Fichier:ligne | Statut | Preuve |
|---|---|---|---|
| Règle d'exemple | `chemin/fichier.md:12` | Confirmée | [[verifie chemin/fichier.ts:5]] |

## Caractères invisibles

<!-- consigne : tout caractère invisible pour un relecteur humain trouvé dans un fichier d'instructions (ARCHITECTURE.md §6.9) : une technique connue d'injection de prompt. Listez chacun ; une section vide est une bonne nouvelle, dites-le plutôt que de supprimer la section. -->

Aucun caractère caché n'a été trouvé dans un fichier d'instructions.

## Ce qu'il faut garder

<!-- consigne : une fois chaque règle statuée, ce qu'il faut reprendre dans cette documentation et ce que le fichier d'instructions peut abandonner sans risque. -->

- Garder les règles qui correspondent au code ; abandonner celles que le code a dépassées.
