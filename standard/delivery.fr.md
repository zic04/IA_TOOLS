# Checklist de remise

Parcourez-la avant de remettre un site à son propriétaire, ou à l'équipe qui reprend le projet. Chaque ligne vient d'une remise réelle ; la colonne « Preuve » dit comment montrer que c'est fait.

## 1. Contrôles

| ✓ | Point | Commande | Preuve |
|---|---|---|---|
| ☐ | Build strict sans erreur | `doc-kit build` | « site généré », aucune ligne ✖ |
| ☐ | Tous les contrôles bloquants verts | `doc-kit check all` | Code de sortie 0 |
| ☐ | Avertissements traités ou justifiés | `doc-kit audit` | Les avertissements restants sont expliqués dans « Maintenir la doc » |
| ☐ | Niveau de maturité visé atteint (3 au minimum, 4 pour une reprise) | `doc-kit audit` | Niveau affiché ; voir [maturity.fr.md](maturity.fr.md) |
| ☐ | Relecture visuelle d'au moins une page par section, en thème clair et en thème sombre, et d'une visite guidée | `doc-kit view <page> --theme dark`, `--tour 2` | Images de relecture regardées, puis supprimées |

## 2. Sécurité

| ✓ | Point | Comment |
|---|---|---|
| ☐ | **Session de production supprimée** | `doc-kit connect --forget` ; aucun fichier de session restant dans le projet |
| ☐ | Aucun secret dans les images | Chaque image relue après la dernière campagne de captures |
| ☐ | Décision sur les données réelles écrite | Dans le guide de rédaction du projet (par exemple : « données réelles de la production, par décision du propriétaire le <date> ») |
| ☐ | Aucune écriture laissée en production | Les bilans « Lecture seule : N requête(s) d'écriture bloquée(s) » relus ; les écritures serveur connues listées en constats (pour Acme Orders : P9) |
| ☐ | `.doc-kit/` vide ou exclu de l'export | Il contient la session, les aperçus et les fichiers de travail |

## 3. Contenu de reprise à jour

| ✓ | Point | Où |
|---|---|---|
| ☐ | Version documentée de l'application, et date de la campagne de captures | « Maintenir la doc » (par exemple : version 2.4.0, captures du 1er octobre 2026) |
| ☐ | Fiches déjà ouvertes en production listées (écritures serveur au rendu) | « Maintenir la doc » |
| ☐ | Limites connues de l'outillage | « Maintenir la doc », section « Limites connues » |
| ☐ | Constats consolidés : candidats des rédacteurs revérifiés, dédupliqués, numérotés | `reprendre/points-attention` |
| ☐ | Termes proposés ajoutés au glossaire | `content/glossary.json` |
| ☐ | Mémoire du projet à jour : notes de reprise, mémoire de l'assistant s'il y en a une, `CHANGELOG` de la documentation | Selon le projet |

## 4. Export

| ✓ | Point | Commande ou règle |
|---|---|---|
| ☐ | Une copie **autonome** du projet, sans `node_modules/`, `.doc-kit/` ni session | `doc-kit export <cible>` ; `--with-dist` pour joindre le site produit, `--zip` pour une archive |
| ☐ | Un README de remise à la racine | Ce qu'est le site, comment l'ouvrir, comment le régénérer (`npm ci`, `npm run site`), comment refaire les captures, où se trouve le guide de rédaction |
| ☐ | L'export se régénère ailleurs | Dans la copie : `npm ci`, puis `npm run site` ; Node.js 20 ou plus récent ; `npx playwright install chromium` si le navigateur manque |
| ☐ | Le contrôle de couverture est documenté comme ignoré hors du dépôt | Il a besoin du code de l'application |

## 5. Diffusion

Le livrable est **un seul fichier HTML** qui s'ouvre hors ligne. Son poids décide de son mode de diffusion.

| Site | Poids typique | Diffusion |
|---|---|---|
| Environ 200 images | Environ 18 Mo | Dépôt du projet, espace documentaire partagé, hébergement statique |
| Environ 400 images | Environ 35 Mo | Idem ; trop lourd pour la plupart des messageries |

| ✓ | Point | Règle |
|---|---|---|
| ☐ | Poids du fichier relevé | Au-delà d'environ 10 Mo, pas de pièce jointe : un lien vers un espace partagé |
| ☐ | Images allégées | `doc-kit optimize` (recompresse au-delà de 200 Ko) avant le dernier build |
| ☐ | Accès restreint si le site montre des données réelles | Un espace partagé limité aux personnes autorisées par le propriétaire |
| ☐ | Destinataires et date de remise notés | Dans « Maintenir la doc » ou dans le README de remise |
