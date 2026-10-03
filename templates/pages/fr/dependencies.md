## En bref

<!-- consigne : combien de dépendances directes, dans quels écosystèmes, et le risque principal (un paquet qui n'existe pas, une licence qui interdit l'usage du produit). Générez d'abord les faits : `doc-kit facts --source dependencies --network`. -->

Exemple : « Quelques dizaines de paquets directs ; un paquet importé n'existe pas dans son registre. »

## Dépendances directes

<!-- consigne : construit à partir de `::faits{source="dependencies"}` ; `--network` ajoute `exists` (une recherche dans le registre, nom seul). -->

::faits{source="dependencies" colonnes="name,version,ecosystem,direct,license"}

<!-- doc-kit:prefill source="dependencies" -->
| Paquet | Version | Rôle | Licence |
|---|---|---|---|
| `nom-du-paquet` | `1.4.0` | À quoi il sert | MIT |

## Paquets qui n'existent pas

<!-- consigne : chaque dépendance directe dont le nom n'a pas été trouvé dans son registre public (une hallucination d'un assistant IA, ou un paquet privé confondu avec un public). -->

| Paquet | Importé dans | Preuve |
|---|---|---|
| Paquet d'exemple | — | [[deduit chemin/fichier]] |

## Licences

<!-- consigne : facultatif. Les licences qui demandent une décision (copyleft dans un produit à code fermé, aucune licence déclarée). -->

| Paquet | Licence | Pourquoi ça compte |
|---|---|---|
| Paquet d'exemple | GPL-3.0 | Copyleft, à examiner avant de livrer du code fermé |

## Obsolètes

<!-- consigne : facultatif. Les paquets en retard de plusieurs versions majeures, en particulier ceux dont des correctifs connus manquent au projet. -->

- Le paquet d'exemple a plusieurs versions majeures de retard sur la ligne actuelle.

## À vérifier

<!-- consigne : facultatif. Ce qu'une simple vérification réseau ne peut pas trancher seule : un fork publié sous le nom d'origine, un paquet qui existe mais n'a rien à voir avec ce que le code attend. -->

- Confirmer qu'un paquet est bien celui de l'équipe, et non un paquet public sans lien portant le même nom.
