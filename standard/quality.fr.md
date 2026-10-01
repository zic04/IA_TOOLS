# Contrôles de qualité

Il y a deux niveaux :
- les **barrières bloquantes**, qui empêchent de produire ou de remettre le site (code de sortie 1) ;
- les **avertissements**, qui sont signalés et doivent être traités ou justifiés avant la remise.

Chaque contrôle ci-dessous a fait ses preuves sur des sites réels : il attrape une erreur qu'un lecteur trouverait sinon le premier.

## Barrières bloquantes

| Contrôle | Commande | Ce qui bloque | Remède |
|---|---|---|---|
| **Build strict** | `doc-kit build` | Une page déclarée sans son fichier ; une capture citée introuvable, ou dont l'image manque ; un schéma introuvable ; un parcours guidé de l'accueil qui pointe vers une page inconnue | Écrire la page, faire la capture, ou retirer la référence. Pendant la rédaction : `doc-kit build --draft` (tolère et signale) |
| **Liens et ancres** | `doc-kit build`, `doc-kit check links` | Un lien vers un id absent du sommaire ; une ancre `~…` absente de la page visée | Corriger l'id ou l'ancre (titre en minuscules, sans accents, avec des tirets) |
| **Légende = zones** | `doc-kit build` | Un `:::screen` dont la liste n'a pas autant d'éléments que la capture a de zones ; un `::capture` utilisé sur une capture qui a des zones | Ajuster la liste, ou ajuster les zones du plan et recapturer |
| **Couverture** | `doc-kit check coverage` | Un élément inventorié par un adaptateur (route, bloc, widget, outil…) n'est cité ni dans le sommaire (`routes`) ni dans une page | Documenter l'élément. Le contrôle est ignoré quand l'application est introuvable |
| **Sections obligatoires** | `doc-kit build` | Une page qui déclare un `template` n'a pas l'une de ses sections obligatoires (un titre `##` qui commence par le libellé ou par un alias) | Ajouter la section, renommer le titre, ou retirer `template` d'une page qui n'est pas de ce type |
| **Secrets** | `doc-kit check secrets` | Un secret dans les sources textuelles (pages, glossaire, fichiers de zones, plans, schémas) : clé, mot de passe, jeton, chaîne de connexion, valeur du `.env` local ; un fichier de session hors de `.doc-kit/`, ou suivi par git | Retirer la valeur, la masquer et recapturer ; supprimer la session |

Le build strict est la barrière principale : **le site n'est pas produit** tant qu'une erreur subsiste (« N erreur(s) — site NON généré »).

## Avertissements

| Contrôle | Commande | Seuil | Remède |
|---|---|---|---|
| **Tableaux trop larges** | `doc-kit check tables` | Un tableau défile horizontalement à 1 440 px (changer la largeur avec `--width`) | Moins de colonnes, des cellules plus courtes, ou deux tableaux |
| **Images lourdes** | `doc-kit check images` | Une image de plus de 200 Ko | `doc-kit optimize` : recompresse au-delà du seuil et garde la nouvelle version quand elle gagne au moins 20 % |
| **Pages trop longues** | `doc-kit audit` | Plus de mots que le `maxWords` du gabarit (2 000 pour une page sans type) | Découper en sous-pages (voir [structure.fr.md](structure.fr.md#les-sous-pages)) |
| **Captures d'une version antérieure** | `doc-kit check images`, `doc-kit audit` | Le champ `version` du fichier de zones diffère de la version courante de l'application | Recapturer, ou dire dans la page de quelle version date l'écran |
| **Consignes restées dans une page** | `doc-kit audit`, `doc-kit build` | Un commentaire `<!-- consigne :` (ou `<!-- guidance:` en anglais) laissé par un gabarit ; le build strict le signale aussi | Écrire la section et retirer la consigne, ou supprimer la section facultative |
| **Encadré de type inconnu** | `doc-kit build` | Un encadré `> [!TYPE]` hors de la liste des encadrés | Corriger le type (voir [writing.fr.md](writing.fr.md#7-la-syntaxe-étendue)) |

## Ce qui ne se contrôle pas automatiquement

| Vérification | Comment |
|---|---|
| Chaque zone encadre le bon élément | `doc-kit capture "<motif>" --preview`, puis regarder `<id>.zones.png` dans `.doc-kit/` |
| Aucun secret ni donnée personnelle **dans les images** | Relire chaque image : le masquage ne connaît pas les valeurs de production |
| Lisibilité en thème clair et en thème sombre ; schémas qui ne débordent pas | `doc-kit view <page> --theme dark`, `doc-kit view <page> --tour 2` |
| Chaque affirmation est vraie | La preuve `fichier:ligne` ; une relecture croisée des pages de Reprendre |
| La session est supprimée | `doc-kit connect --forget`, puis `doc-kit doctor` |

## Les commandes

| Commande | Rôle | Codes de sortie |
|---|---|---|
| `doc-kit build` | Produit le site ; strict par défaut | 0 : site produit ; 1 : erreurs de contenu |
| `doc-kit build --draft` | Tolère les pages et les captures manquantes, et les signale | 0 |
| `doc-kit check all` | Liens, tableaux, images, secrets, couverture | 0 ; 1 si un contrôle bloquant échoue |
| `doc-kit audit` | Score, niveau de maturité, avertissements (voir [maturity.fr.md](maturity.fr.md)) | 0 ; `--json` pour l'intégration continue |

Codes communs à toutes les commandes : 2 = usage ou configuration invalide ; 3 = problème d'environnement (navigateur absent, application injoignable, session expirée, kit incompatible).

## Avant la remise

Tous les contrôles bloquants sont verts, chaque avertissement est traité ou justifié dans la page « Maintenir la doc », et la checklist de [delivery.fr.md](delivery.fr.md) est faite.
