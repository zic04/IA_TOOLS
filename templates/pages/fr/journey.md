## En bref

<!-- consigne : la réponse courte à la question du parcours, en 3 à 6 lignes : ce qu'on suit, en combien d'étapes, d'après quelle version du code. Puis un encadré MECANISME qui répond à la question que tout le monde se pose. Exemple : « Que se passe-t-il quand un commercial soumet une commande ? Moins qu'on ne le croit : rien ne bouge tant qu'un valideur n'a pas ouvert sa boîte. » -->

> [!MECANISME] Que se passe-t-il quand on fait l'action de départ ?
> La réponse réelle, avec sa preuve (`chemin/fichier.ts:139-142`).

## Le schéma

<!-- consigne : un schéma SVG des étapes. Distinguez visuellement ce qui s'enchaîne tout seul (trait plein, d-line), ce qui attend une personne (pointillé, d-dashed) et ce qui dépend d'une tâche planifiée (couleur d'alerte, d-warn ou d-danger). Seulement les classes d-* du site, aucune couleur en dur. La légende dit comment le lire. -->

::schema{id="r-parcours-nom" titre="Les étapes du parcours : déclencheur, écritures et services appelés. Trait plein : enchaîné ; pointillé : attend une personne ; en rouge : ce qui dépend d'une tâche planifiée."}

## Dans cette partie

<!-- consigne : une ligne par sous-page (étape), dans l'ordre ; colonne 1 = lien « n. Titre ». -->

| Étape | Déclencheur | Automatique ou humain | Ce qui change |
|---|---|---|---|
| 1. Titre de l'étape | Le geste ou l'événement | Humain, automatique, ou tâche planifiée | Écritures et statuts |

## Les états

<!-- consigne : facultatif. Un tableau étape × objet suivi, avec les valeurs techniques (code) et les libellés affichés (en gras). -->

| Étape | Objet suivi | Autre objet |
|---|---|---|
| 1. Titre de l'étape | `VALEUR` (**Libellé**) | — |

## Ce qui se fait tout seul, et ce qui attend quelqu'un

<!-- consigne : facultatif mais très lu. Deux listes : ce que le code enchaîne sans personne, et ce qui reste en attente d'un geste. Signalez ce qui dépend d'un planificateur, et s'il tourne réellement. -->

### Tout seul

- Ce qui s'enchaîne, et à quel moment.

### Attend une personne

- Le geste attendu, avec son libellé exact en gras.

## Les surprises à connaître

<!-- consigne : 6 à 10 points numérotés, chacun : la surprise en une phrase en gras, l'explication, le numéro du constat s'il existe (I17), et le lien vers la sous-page qui la détaille. -->

1. **La surprise, en une phrase.** L'explication, le constat lié s'il existe, et la sous-page qui la détaille.

## Pour aller plus loin

<!-- consigne : 3 à 6 liens : architecture d'ensemble, DAT, écrans concernés, parcours guidé de l'accueil qui suit le même objet à l'écran. -->

- Titre de la page liée : ce qu'on y trouve.
