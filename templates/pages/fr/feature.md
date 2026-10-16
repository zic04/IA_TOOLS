## À quoi ça sert

<!-- consigne : le besoin métier en 2 à 4 phrases, en langage métier uniquement, sans code : qui en a besoin, et à quoi ça lui sert. Attribuez à cette page son identifiant « feature » (toc.json, champ « feature », p. ex. « F-01 ») et donnez-lui un titre (en gras, nom exact) dans la première phrase. Une section qui ne s'applique pas à cette fonctionnalité reste, avec une ligne : « Sans objet — la raison. » -->

## Qui l'utilise

<!-- consigne : les rôles qui utilisent la fonctionnalité, et ce que chacun en fait : un tableau à deux colonnes, Rôle · Ce qu'il en fait. -->

| Rôle | Ce qu'il en fait |
|---|---|
| **Rôle** | Ce qu'il fait avec cette fonctionnalité. |

## User stories

<!-- consigne : un :::recit par besoin, dans les mots de la personne qui l'a : « En tant que <rôle>, je veux <action> afin de <bénéfice>. » Attributs : id US-xx (unique dans toute la documentation), titre (une courte phrase verbale), role, depuis (la version qui l'a apportée), ref (son ticket, p. ex. ADO#1234, PROJ-12, owner/repo#42) quand il y en a un. Ses critères d'acceptation sont les scénarios de « Critères d'acceptation » qui le nomment (recit="US-xx"). -->

:::recit{id="US-00" titre="Courte phrase verbale" role="Rôle" depuis="1.0"}
En tant que **rôle**, je veux faire quelque chose afin d'en tirer un bénéfice.
:::

## Parcours principal

<!-- consigne : le chemin habituel, en étapes numérotées (acteur, action, résultat), de l'ouverture de l'écran au résultat. Nommez chaque champ, bouton et message exactement comme l'écran l'affiche, en gras. Ajoutez un :::ecran ou un ::capture quand une capture rend une étape plus claire ; aucun des deux n'est obligatoire. -->

:::etapes
1. **Acteur** fait la première chose.
2. La fonctionnalité réagit : ce qui change.
3. **Acteur** voit le résultat.
:::

## Variantes

<!-- consigne : facultatif. Les embranchements du parcours principal, numérotés après l'étape dont ils partent (« 3a. Si … »), chacun avec ce qui se passe à la place : un autre choix, une exception, une annulation. -->

- **3a.** Si une condition est remplie, ce qui se passe à la place.

## Comportements

<!-- consigne : une carte :::comportement par comportement de la fonctionnalité, de l'un des types de standard/behaviours.json : recherche, filtre, tri, pagination, liste, formulaire, import, export, calcul, notification, circuit, traitement-planifie, controle-droits. Répondez à chaque rubrique de son type sur une ligne « Rubrique : valeur », aussi précisément qu'un test le vérifierait (« contient, sans tenir compte des majuscules, les accents comptent : cafe ne trouve pas Café ») ; écrivez « Sans objet — la raison » quand une rubrique ne s'applique pas, et « Inconnu — la question » quand personne ne sait encore (la question va aussi dans « Questions ouvertes »). Une rubrique obligatoire omise est signalée par le build (behaviour.missing). -->

:::comportement{type="recherche" titre="Rechercher …" id="B-00"}
Où : le champ, son libellé et son texte d'aide, et où il se trouve.
Champs cherchés : les données comparées au texte tapé, et celles qui ne le sont pas.
Correspondance : contient, commence par ou exact ; si les majuscules et les accents comptent.
Plusieurs mots : une seule expression, tous les mots, ou l'un des mots.
Déclenchement : à chaque frappe, sur Entrée ou avec un bouton.
Ordre des résultats : l'ordre des résultats, et si le lecteur peut le changer.
Aucun résultat : ce que voit le lecteur quand rien ne correspond.
Droits : qui peut chercher, et si les résultats se limitent à ce que le lecteur a le droit de voir.
:::

## Règles de gestion

<!-- consigne : les règles propres à cette seule fonctionnalité se définissent ici avec :::regle (un encadré par règle, un énoncé puis un exemple « Soit / Quand / Alors ») ; une règle partagée avec d'autres fonctionnalités n'est que citée avec [[regle …]], jamais redéfinie. -->

:::regle{id="RG-00" titre="Un énoncé court et vérifiable"}
La règle, en une ou deux phrases.

**Exemple.** **Soit** une situation de départ, **quand** l'action déclenchante se produit, **alors** le résultat qui suit.
:::

## Champs et saisies

<!-- consigne : facultatif ; nécessaire dès que la fonctionnalité a un formulaire. Une ligne par champ : Champ (son libellé à l'écran) · Obligatoire · Format et valeurs admises · Par défaut · Contrôle et son message. -->

| Champ | Obligatoire | Format et valeurs admises | Par défaut | Contrôle et son message |
|---|---|---|---|---|
| **Libellé** | Oui | Ce que l'on peut taper ou choisir | — | Ce qui est contrôlé, et le message affiché |

## États

<!-- consigne : facultatif. Les états par lesquels passe un élément de cette fonctionnalité, tels que le lecteur les voit ([[statut …]]), ce qui le fait passer de l'un à l'autre, et qui le peut. Supprimez la section quand la fonctionnalité n'a pas d'états. -->

## Messages

<!-- consigne : chaque message que le lecteur peut voir — confirmations, erreurs, avertissements, listes vides — mot pour mot, avec le moment où il apparaît et ce qu'il faut faire. Quand l'écran n'en affiche aucun, dites-le et ce que voit le lecteur à la place (« Sans objet — un résultat vide laisse le tableau vide, sans message »). -->

| Message | Quand il apparaît | Que faire |
|---|---|---|
| « Le texte exact » | La situation | Ce que fait ensuite le lecteur |

## Droits par action

<!-- consigne : une ligne par action de la fonctionnalité : Action · Droit ([[droit …]]) · Condition (les données couvertes : ses propres éléments, ceux de sa région…). Puis ce que voit un lecteur sans le droit : l'action masquée, grisée, ou refusée avec un message. -->

| Action | Droit | Condition |
|---|---|---|
| Voir la liste | [[droit module:lecture]] | — |

## Critères d'acceptation

<!-- consigne : un :::scenario par critère, en Soit / Quand / Alors (une étape par ligne ; Et et Mais admis), avec des valeurs réelles (le nom d'un client, un numéro de commande), qui nomme la story qu'il vérifie (recit="US-xx") et, quand il vérifie une carte, la carte (comportement="B-xx"). Chaque story en a au moins un ; un « Aucun résultat » ou une erreur mérite le sien. -->

:::scenario{titre="Ce qu'il vérifie" recit="US-00" comportement="B-00"}
Soit une situation de départ, avec des valeurs réelles
Quand le lecteur fait quelque chose
Alors ce qu'il voit
:::

## Limites

<!-- consigne : facultatif. Ce que la fonctionnalité ne fait délibérément pas, ou seulement en partie, en langage métier (jamais un piège de code : cette page ne cite aucun code). Exemple : « La fonctionnalité ne retente pas une notification échouée ; une demande au support est nécessaire. » -->

## Questions ouvertes

<!-- consigne : facultatif. Chaque question à laquelle personne n'a encore su répondre (les « Inconnu — … » des cartes compris), pour le product owner : une ligne chacune, avec qui peut y répondre. Retirez une question dès qu'elle a sa réponse, et écrivez la réponse là où elle doit être. -->

- **La question ?** Qui peut y répondre.
