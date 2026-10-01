## À quoi ça sert

Le **site généré** est ce que reçoivent vos lecteurs : un seul fichier HTML, `dist/<Produit>-Documentation.html`, qui
s'ouvre hors ligne dans n'importe quel navigateur récent. Il ne demande ni serveur, ni accès à internet, ni
installation : il peut être envoyé par e-mail, rangé dans une bibliothèque de documents ou joint à un ticket.

> [!NOTE] Où trouver ce fichier
> Après `doc-kit build`, dans le dossier `dist/` du projet de documentation (la clé `output` change son nom).
> `doc-kit open` l'ouvre dans votre navigateur par défaut.

## Comment ça marche

Tout ce dont le site a besoin est dans le fichier : les pages déjà converties en HTML, l'index de recherche, le
glossaire, les images (en WebP base64), les schémas (en SVG intégré), le style et le script. Rien n'est chargé depuis
le réseau.

> [!MECANISME] Ce qui se passe quand un lecteur ouvre le fichier
> 1. Le thème est choisi **avant le premier affichage** : le dernier choix du lecteur, gardé dans le stockage local du
>    navigateur sous `theme.key`, sinon la préférence du système (clair ou sombre).
> 2. Le script lit l'adresse après `#` : `#/` est la page d'accueil, `#/write/markdown` une page,
>    `#/write/markdown~encadres` une section d'une page, `#/capture` la vue d'ensemble d'une section.
> 3. La page est affichée à partir des données embarquées ; ses images ne sont décodées qu'au moment où elles
>    s'affichent.
> 4. La première occurrence de chaque terme du glossaire dans la page reçoit une infobulle.

Chaque adresse est un lien que vous pouvez partager : il ouvre la même page, à la même section, pour quiconque a le
fichier.

## L'écran

:::ecran{capture="site-page" titre="Une page du site généré"}
1. **Sections** : les titres courts des sections (`shortTitle` dans le sommaire) ; la section courante est mise en
   valeur.
2. **Recherche** : une recherche plein texte dans chaque section de chaque page, ouverte avec [[touche Ctrl+K]] ou
   [[touche /]] ; les flèches choisissent un résultat, Entrée l'ouvre, Échap ferme.
3. **Thème** : bascule entre clair et sombre ; le choix est mémorisé pour ce fichier dans ce navigateur.
4. **Imprimer** : imprime la page courante, ou **toute la documentation** avec son plan, prête à être enregistrée en
   PDF.
5. **Menu** : chaque section, ses groupes et ses pages. Une sous-page apparaît sous sa parente pendant que vous lisez
   la parente ou l'une de ses sœurs ; le nombre à côté d'une parente est son nombre de sous-pages.
6. **Visite guidée** : parcourt les pastilles de l'écran une à une, avec **Précédent**, **Suivant** et **Terminer**,
   ou les flèches gauche et droite du clavier.
7. **Écran annoté** : survoler une pastille numérotée met en valeur l'élément de sa légende, et inversement ; un clic
   sur l'image l'ouvre en plein écran.
8. **Sur cette page** : les titres `##` et `###` de la page ; le titre courant suit votre lecture.
:::

## Chaque action

### La visite guidée

La visite ouvre l'écran en grand et cadre une zone à la fois, avec l'élément de sa légende dans une carte.

::capture{id="site-tour" titre="La visite guidée, à l'étape 2 de la liste des commandes"}

### La recherche

Chaque résultat est une section d'une page, avec son chemin, son titre et un extrait ; les mots que vous avez tapés
sont mis en valeur. Un mot trouvé dans un titre est mieux classé qu'un mot trouvé dans le texte. Quand le champ est
vide, la recherche propose les pages listées dans `suggestions` (sommaire).

::capture{id="site-search" titre="La recherche, pendant la saisie d'un mot"}

### Les thèmes clair et sombre

Chaque couleur du site, schémas compris, vient des jetons de couleur du thème. Faites glisser la poignée pour comparer.

::avant-apres{avant="site-light" apres="site-dark" libelle-avant="Clair" libelle-apres="Sombre" titre="La même page dans les deux thèmes"}

## Référence de chaque réglage

Le lecteur a deux réglages ; tout le reste est décidé par la configuration du projet.

| Réglage | Contrôle | Valeurs · défaut | Effet |
|---|---|---|---|
| **Thème** | Bouton de la barre du haut | Clair · Sombre · défaut : celui du système | Les couleurs de tout le site, mémorisées par navigateur |
| **Imprimer** | Bouton de la barre du haut | Cette page · toute la documentation | Ce que reçoit la boîte de dialogue d'impression |

## Pas à pas : partager une section précise

:::etapes
1. Ouvrez la page et faites défiler jusqu'à la section.
2. Cliquez sur le signe `#` qui apparaît à côté de son titre : l'adresse se termine maintenant par `~` et l'ancre de
   la section.
3. Copiez l'adresse depuis la barre d'adresse du navigateur.
4. Envoyez-la avec le fichier : le lien ouvre la même section.
:::

## Cas d'usage courants

:::etapes
1. **Un utilisateur demande comment marche un écran** : envoyez l'adresse de sa page ; la visite guidée se charge des
   explications.
2. **Un auditeur veut un PDF** : **Imprimer**, puis **OK** pour toute la documentation, puis « Enregistrer au format
   PDF ».
3. **Un lecteur est perdu** : [[touche Ctrl+K]] et un mot de l'écran ; chaque titre de chaque page est indexé.
:::

## Pièges et limites à connaître

> [!ATTENTION] Un fichier, un poids
> Les images sont dans le fichier. Un site de plusieurs centaines de captures peut peser des dizaines de mégaoctets :
> gardez les captures cadrées sur leur panneau et lancez `doc-kit optimize` pour recompresser les plus lourdes.

> [!NOTE] Des liens entre deux fichiers
> Un lien vers un autre fichier de documentation ne peut pas être vérifié par le build. Préférez un site par produit,
> avec des liens entre ses pages.

La page d'accueil du site montre les sections, les chiffres de la documentation et les parcours de lecture guidés
(`journeys` du sommaire) :

::capture{id="site-home" titre="La page d'accueil de cette documentation"}

## Droits requis

> [!DROITS] Qui peut lire le site
> - **Quiconque a le fichier.** Le site n'a aucun contrôle d'accès : partagez-le comme vous partageriez les captures
>   d'écran de l'application.
> - Le fichier ne contient ni la session ni aucun secret de la capture ; `doc-kit check secrets` contrôle son texte
>   avant la livraison.
