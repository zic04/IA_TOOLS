> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `feature`, écrit pour Acme Orders, le produit fictif du kit : ses user stories, ses cartes de comportement, ses règles de gestion et ses critères d'acceptation. Les pages métier ne citent aucun code : comparez avec [l'exemple d'écran](#/examples/screen), qui en cite.

## À quoi ça sert

**La validation des commandes** protège Acme des erreurs coûteuses sur les grosses commandes : dès que le total d'une commande franchit le seuil de validation, elle attend la décision d'un responsable commercial avant de pouvoir être expédiée. Un commercial crée et modifie la commande normalement ; la validation ne verrouille que l'étape qui lui permet d'avancer.

## Qui l'utilise

| Rôle | Ce qu'il en fait |
|---|---|
| **Commercial** | Soumet la commande ; voit pourquoi elle attend, et la décision du responsable une fois prise. |
| **Responsable commercial** | Relit les commandes en attente de sa région et approuve ou rejette chacune. |
| **Finance** | Fixe et revoit le seuil de validation ([[regle RG-12]]). |

## User stories

:::recit{id="US-01" titre="Soumettre une grosse commande" role="Commercial" depuis="2.0" ref="ADO#1201"}
En tant que **commercial**, je veux qu'une grosse commande attende la décision de mon responsable afin qu'une erreur coûteuse soit arrêtée avant l'expédition.
:::

:::recit{id="US-02" titre="Décider d'une commande en attente" role="Responsable commercial" depuis="2.0" ref="ADO#1202"}
En tant que **responsable commercial**, je veux voir les commandes de ma région qui m'attendent, et les approuver, afin qu'elles partent sans retard.
:::

:::recit{id="US-03" titre="Rejeter avec un motif" role="Responsable commercial" depuis="2.4" ref="ADO#1240"}
En tant que **responsable commercial**, je veux rejeter une commande avec un motif afin que le commercial sache quoi changer.
:::

:::recit{id="US-04" titre="Savoir pourquoi une commande attend" role="Commercial" depuis="2.4"}
En tant que **commercial**, je veux voir qui doit décider et, après un rejet, pourquoi, afin de ne pas relancer la mauvaise personne.
:::

## Parcours principal

:::etapes
1. Un **commercial** soumet une commande dont le total atteint ou dépasse le seuil.
2. La commande passe **En attente de validation** et ne peut plus être expédiée ; le commercial lit « Cette commande attend la validation d'un responsable. »
3. Un **responsable commercial** de la région de la commande l'ouvre depuis sa **File de validation**.
4. Le responsable l'**approuve** : la commande passe **Approuvée** et peut être expédiée.
:::

## Variantes

- **1a.** Le total est sous le seuil : la commande est expédiée sans validation.
- **4a.** Le responsable **rejette** la commande avec un motif : elle revient en **Brouillon**, le motif joint, et le commercial peut la reprendre et la soumettre à nouveau.
- **4b.** Aucun responsable de la région n'agit sous deux jours ouvrés : une relance part ([le processus de validation](#/examples/process)).

## Comportements

:::comportement{type="circuit" titre="De la soumission à l'approbation, ou le retour" id="B-01"}
États : **Brouillon**, **En attente de validation**, **Approuvée**, tels qu'ils s'affichent sur la commande et dans les listes.
Passages : soumettre une commande qui atteint le seuil la fait passer de **Brouillon** à **En attente de validation** ; l'approuver la fait passer **Approuvée** ; la rejeter la renvoie en **Brouillon**.
Qui agit : le commercial soumet ; seul un responsable commercial de la région de la commande approuve ou rejette ([[regle RG-01]]).
Passages automatiques : Sans objet — rien ne bouge tout seul : une commande en attente le reste jusqu'à la décision d'un responsable.
Délais et relances : après deux jours ouvrés sans décision, une relance part vers les responsables de la région ; il n'y en a pas de deuxième.
Retour en arrière : une commande rejetée revient en **Brouillon** ; une commande approuvée ne peut pas revenir en validation.
Historique : chaque décision est gardée avec son auteur, sa date et le motif d'un rejet ; le commercial et tout responsable qui ouvre la commande la voient.
:::

:::comportement{type="controle-droits" titre="Seule la région de la commande décide" id="B-02"}
Qui est autorisé : un **responsable commercial** ([[droit orders:approve]]).
Actions contrôlées : approuver, rejeter.
Portée des données : les seules commandes de sa propre région ; la commande d'une autre région n'apparaît jamais dans sa **File de validation**.
En cas de refus : ouverte depuis un lien partagé, la commande d'une autre région n'affiche ni **Approuver** ni **Rejeter**, mais la ligne « Seul un responsable de la région Nord peut décider de cette commande. »
Délégation : Inconnu — un responsable peut-il confier sa file à quelqu'un d'autre pendant une absence ?
:::

:::comportement{type="liste" titre="La file de validation" id="B-03"}
Ce qui est listé : les commandes qui attendent une décision, au statut **En attente de validation**.
Portée : la seule région du responsable ([[regle RG-01]]).
Colonnes : **Commande**, **Client**, **Total** (dans la devise de la commande), **Soumise le** (date et heure), **Commercial**.
Ordre : la soumission la plus ancienne d'abord, pour que rien n'attende plus que nécessaire.
Liste vide : « Aucune commande n'attend votre validation. »
Actions par ligne : ouvrir la commande, où se trouvent **Approuver** et **Rejeter**.
Actualisation : Sans objet — la file est lue à son ouverture ; une nouvelle soumission apparaît à la visite suivante.
:::

## Règles de gestion

:::regle{id="RG-01" titre="Seul le responsable de la région de la commande peut l'approuver"}
Un responsable commercial ne voit, et ne peut décider, que les commandes de sa propre région.

**Exemple.** **Soit** un responsable de la région Nord, **quand** il ouvre sa file de validation, **alors** elle ne contient que des commandes de la région Nord.
:::

[[regle RG-12]] fixe le seuil lui-même.

## Champs et saisies

| Champ | Obligatoire | Format et valeurs admises | Par défaut | Contrôle et son message |
|---|---|---|---|---|
| **Motif** (au rejet) | Oui | Texte libre, de 10 à 500 caractères | — | Vide ou trop court : « Indiquez le motif du rejet (10 caractères au moins). » |

## États

[[statut Brouillon]] → [[statut En attente de validation]] → [[statut Approuvée]], ou retour en [[statut Brouillon]] après un rejet : les passages sont ceux de la carte **De la soumission à l'approbation, ou le retour**, plus haut.

## Messages

| Message | Quand il apparaît | Que faire |
|---|---|---|
| « Cette commande attend la validation d'un responsable. » | Sur la commande, pour le commercial, après la soumission | Rien ; la décision vient du responsable de la région |
| « Commande approuvée. » | Pour le responsable, après l'approbation | Rien |
| « Indiquez le motif du rejet (10 caractères au moins). » | Au rejet avec un motif vide ou trop court | Écrire le motif |
| « Aucune commande n'attend votre validation. » | Une **File de validation** vide | Rien |
| « Seul un responsable de la région Nord peut décider de cette commande. » | La commande d'une autre région, ouverte depuis un lien | Demander au responsable de cette région |

## Droits par action

| Action | Droit | Condition |
|---|---|---|
| Soumettre une commande | [[droit orders:write]] | — |
| Voir la **File de validation** | [[droit orders:approve]] | Les commandes de sa seule région |
| Approuver, rejeter | [[droit orders:approve]] | Les commandes de sa seule région ([[regle RG-01]]) |
| Changer le seuil | [[droit orders:admin]] | La finance |

Un commercial sans [[droit orders:approve]] ne voit jamais la **File de validation** dans le menu.

## Critères d'acceptation

:::scenario{titre="Une grosse commande attend" recit="US-01" comportement="B-01"}
Soit le seuil à 10 000 €
Quand un commercial soumet la commande n° 2087, de 12 400 €
Alors elle passe **En attente de validation**
Et le commercial lit « Cette commande attend la validation d'un responsable. »
:::

:::scenario{titre="Sous le seuil, pas de validation" recit="US-01"}
Soit le seuil à 10 000 €
Quand un commercial soumet la commande n° 2088, de 9 990 €
Alors elle passe directement **Approuvée**
:::

:::scenario{titre="Le responsable de la région approuve" recit="US-02" comportement="B-01"}
Soit la commande n° 2087, de la région Nord, en attente de validation
Quand Dana Lee, responsable de la région Nord, l'approuve
Alors elle passe **Approuvée** et peut être expédiée
:::

:::scenario{titre="La commande d'une autre région n'est pas dans la file" recit="US-02" comportement="B-02"}
Soit la commande n° 2091, de la région Sud, en attente de validation
Quand Dana Lee, responsable de la région Nord, ouvre sa **File de validation**
Alors la commande n° 2091 n'y figure pas
:::

:::scenario{titre="Un rejet exige un motif" recit="US-03" comportement="B-01"}
Soit la commande n° 2087 en attente de validation
Quand son responsable la rejette avec le motif « Trop court »
Alors le rejet est refusé avec « Indiquez le motif du rejet (10 caractères au moins). »
Et la commande reste **En attente de validation**
:::

:::scenario{titre="Le commercial lit le motif" recit="US-04" comportement="B-01"}
Soit la commande n° 2087 rejetée avec le motif « Remise au-delà des 15 % autorisés »
Quand son commercial l'ouvre
Alors elle est en **Brouillon**, avec le motif, le nom du responsable et la date de la décision
:::

## Limites

- La validation est tout ou rien : un responsable ne peut pas approuver une partie seulement des lignes d'une commande.
- Une commande approuvée ne peut pas être reprise : un changement après l'approbation demande une nouvelle commande.

## Questions ouvertes

- **Un responsable peut-il confier sa file de validation à quelqu'un d'autre pendant une absence ?** Le directeur commercial.
