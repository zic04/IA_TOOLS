## À quoi ça sert

<!-- consigne : le besoin métier en 2 à 4 phrases : ce que l'éditeur permet de définir, et ce qui se passe sans aucun réglage. Exemple : « Sans aucun circuit de validation, chaque commande suit la règle intégrée : une seule validation, par le responsable du commercial. » -->

> [!NOTE] Où se trouve ce réglage
> [[menu Administration › Éditeur]] ([[route /exemple/editeur]]). Les pages liées : celle qui exécute ce qui est réglé ici.

## Comment ça marche

<!-- consigne : le mécanisme réel, lu dans le code : quand le réglage est lu, par qui (serveur ou navigateur), dans quel ordre, avec quelles limites, et ce que l'utilisateur final voit changer. Un schéma si le mécanisme a plus de trois étapes ; un tableau comparatif s'il y a plusieurs modes. -->

::schema{id="nom-du-schema" titre="Légende complète : ce que montre le schéma et comment le lire."}

> [!MECANISME] Quand et comment le réglage s'applique
> 1. Première étape réelle, dans l'ordre du code.
> 2. Deuxième étape.
> 3. Troisième étape.

## L'écran

<!-- doc-kit:capture=app -->
<!-- consigne : une capture interactive par panneau ou par fenêtre (sous-titres ### s'il y en a plusieurs). La liste a EXACTEMENT autant d'éléments que la capture a de zones (3 à 12), dans l'ordre de lecture. Chaque élément : le libellé exact en gras, puis son rôle, ses valeurs, son défaut et son effet, en 1 à 3 phrases. -->

:::ecran{capture="id-de-la-capture" titre="Administration › Éditeur"}
1. **Libellé exact**. Rôle, valeurs, défaut, effet.
2. **Libellé exact**. Rôle, valeurs, défaut, effet.
3. **Libellé exact**. Rôle, valeurs, défaut, effet.
:::
<!-- doc-kit:capture=none -->
<!-- consigne : pas de capture dans ce projet (capture.mode "none") : un tableau par panneau ou par fenêtre (sous-titres ### s'il y en a plusieurs), une ligne par élément dans l'ordre de lecture, de haut en bas puis de gauche à droite. Chaque ligne : le libellé exact en gras, puis son rôle, ses valeurs, son défaut et son effet, en 1 à 3 phrases. -->

| Élément | Ce qu'il montre |
|---|---|
| **Libellé exact** | Rôle, valeurs, défaut, effet. |
| **Libellé exact** | Rôle, valeurs, défaut, effet. |
| **Libellé exact** | Rôle, valeurs, défaut, effet. |
<!-- doc-kit:end -->

## Ce que ça change

<!-- doc-kit:capture=app -->
<!-- consigne : facultatif. L'effet visible pour l'utilisateur final : un curseur avant / après, ou la capture de l'écran concerné. Exemple : « Même commande, deux circuits : la boîte des validations montre un valideur, puis deux à la suite. » En production en lecture seule, l'après ne peut pas être produit : décrivez l'effet d'après le code. -->

::avant-apres{avant="id-avant" apres="id-apres" libelle-avant="Avant" libelle-apres="Après" titre="Ce que l'utilisateur voit changer."}
<!-- doc-kit:capture=none -->
<!-- consigne : facultatif. L'effet visible pour l'utilisateur final, décrit d'après le code : ce qui change, sur quel écran, pour qui et à partir de quand. Exemple : « Même commande, deux circuits : la boîte des validations montre un valideur, puis deux à la suite. » Supprimez la section si rien de visible ne change. -->
<!-- doc-kit:end -->

## Référence de chaque réglage

<!-- consigne : un tableau par groupe de réglages (sous-titres ###) ; une ligne par réglage ; valeurs, bornes et défauts lus dans le code (schémas de validation, modèle de données, composants). -->

| Réglage | Contrôle | Valeurs · défaut | Effet |
|---|---|---|---|
| **Libellé** | Champ texte | Bornes · défaut | Ce qui change |

## Pas à pas : nom de la tâche

<!-- consigne : facultatif. La configuration la plus courante, de bout en bout, en 5 à 8 étapes à l'impératif, jusqu'à la vérification. Exemple : « Cliquez **Créer**, puis vérifiez que l'interrupteur **Actif** est allumé. » -->

:::etapes
1. Ouvrez [[menu Administration › Éditeur]] et cliquez **Nouveau**.
2. Deuxième geste.
3. Vérifiez le résultat.
:::

## Pièges et limites à connaître

<!-- consigne : un encadré ATTENTION par piège réel, titré par le piège en une ligne ; puis l'encadré NOTE des écarts constatés, avec la version et une preuve fichier:ligne par écart. Dites ce que deviennent les objets déjà existants quand le réglage change. On décrit, on ne corrige pas. -->

> [!ATTENTION] Le piège, en une ligne
> Ce qui se passe, pourquoi, et comment l'éviter.

> [!NOTE] Écarts constatés (vX.Y.Z)
> - Écart entre l'écran, la documentation et le code (`chemin/fichier.tsx:69`).

## Droits requis

<!-- consigne : toujours la dernière section. Voir et modifier le réglage ; exécuter ce qu'il produit ; la trace des modifications au journal d'audit. -->

> [!DROITS] Qui peut faire quoi sur cet écran
> - **Voir et modifier** : [[droit settings:manage]].
> - **Exécuter** ce que le réglage produit : la permission concernée.
> - Chaque modification est inscrite au journal d'audit (libellés exacts).
