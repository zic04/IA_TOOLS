## En bref

<!-- consigne : l'exposition globale en un paragraphe : ce qu'un attaquant pourrait réellement atteindre, et la mesure d'atténuation principale déjà en place. -->

Exemple : « Le risque principal est un accès aux données d'un autre locataire par un contrôle d'isolation manquant sur une route. »

## Le schéma de flux de données

<!-- consigne : un schéma montrant les flux de données et les frontières de confiance qu'ils traversent (les menaces ci-dessous sont organisées par la frontière traversée). -->

::schema{id="threat-dfd" titre="Flux de données et frontières de confiance qu'ils traversent."}

## Frontières de confiance

<!-- consigne : chaque frontière que montre le schéma (navigateur vers serveur, serveur vers base de données, serveur vers un tiers), dans l'ordre utilisé ci-dessous. -->

| Frontière | Ce qui la traverse |
|---|---|
| Navigateur → serveur | La session, à chaque requête |

## Menaces

<!-- consigne : organisées par frontière de confiance, en catégories STRIDE (Usurpation, Altération, Répudiation, Divulgation d'information, Déni de service, Élévation de privilège) ; chaque menace avec sa preuve ou son statut quand elle n'est pas vérifiée. -->

### Navigateur → serveur

- **Divulgation d'information** : un contrôle manquant permettrait à un utilisateur de lire les données d'un autre locataire ([[verifie chemin/fichier.ts:42]]).

## Mesures d'atténuation

<!-- consigne : facultatif. Ce qui répond déjà à une menace ci-dessus, chacune renvoyant à sa menace. -->

- Une mesure d'atténuation, renvoyant à la menace qu'elle traite.

## Risques acceptés

<!-- consigne : facultatif. Un risque sciemment laissé ouvert, qui l'a accepté et quand (alimente la colonne « Décision » du registre des constats). -->

- Un risque, qui l'a accepté, et quand.
