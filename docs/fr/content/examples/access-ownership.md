> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `access-ownership`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

## En bref

La moitié de ce qu'une reprise demande est déjà connue : le dépôt, l'hébergement et la base de données ont un propriétaire nommé. Le domaine, le fournisseur de paiement et deux des comptes d'outils IA utilisés pour construire Acme Orders n'en ont pas — commencez la reprise par la checklist ci-dessous.

## Qui possède quoi

| Actif | Propriétaire | Où | Comment le transmettre | Statut |
|---|---|---|---|---|
| Domaine `orders.example.org` | — | Console du registraire | Transférer ou ajouter un nouveau contact admin | Propriétaire inconnu |
| Dépôt | Priya Shah (équipe plateforme) | GitHub, `acme/orders` | Ajouter la nouvelle équipe comme propriétaire, puis retirer l'ancienne | Connu |
| Hébergement (application conteneur) | Équipe plateforme | Console cloud, groupe de ressources `rg-orders-prod` | Ajouter la nouvelle équipe aux droits du groupe de ressources | Connu |
| Base de données de production | Équipe plateforme | `infra/db.tf:1-22` | Réinitialiser le mot de passe de connexion, créer un rôle par opérateur | Connu |
| Compte du fournisseur de paiement | — | Tableau de bord du fournisseur | Trouver d'abord le contact facturation ; le compte détient des jetons de carte réels | Propriétaire inconnu |
| Compte du fournisseur d'e-mail transactionnel | Équipe plateforme | Tableau de bord du fournisseur | Faire tourner la clé d'API, ajouter la nouvelle équipe | Connu |

## Secrets et où ils vivent

| Secret | Où il vit | Preuve | Statut |
|---|---|---|---|
| Mot de passe de la base de données | Variable CI `DB_PASSWORD` | [[verifie infra/db.tf:6]] | À faire tourner à la reprise |
| Clé d'API du fournisseur de paiement | Secret de l'application conteneur `PAYMENT_KEY` | [[verifie infra/jobs.tf:14]] | À faire tourner ; existe aussi dans le gestionnaire de mots de passe d'un collègue (à confirmer et retirer) |
| Clé de signature des cookies de session | Secret de l'application conteneur `SESSION_SECRET` | [[deduit lib/auth/index.ts:1]] | À faire tourner |

## Comptes des outils IA

| Outil | Compte | Accès | Propriétaire |
|---|---|---|---|
| Claude Code | `ci-claude@example.org` | Dépôt (écriture), aucun identifiant cloud trouvé | Équipe plateforme |
| GitHub Copilot | Sièges individuels par développeur | Dépôt (lecture/écriture), lié au compte propre de chaque développeur | — |

## Propriétaires inconnus

- Domaine `orders.example.org` : trouver qui détient le compte registraire, ou lancer une récupération auprès du registraire.
- Compte du fournisseur de paiement : demander à la finance l'e-mail d'inscription d'origine avant de tenter une réinitialisation de mot de passe (elle peut bloquer le compte).

## Checklist de passation

:::etapes
1. **Réinitialiser chaque secret partagé** : mot de passe de la base de données, clé du fournisseur de paiement, clé de signature des sessions.
2. **Créer un compte nominatif par opérateur** : retirer la connexion partagée `ci-claude@example.org` une fois remplacée.
3. **Révoquer l'accès de l'équipe précédente** : dépôt, hébergement, base de données, fournisseur de paiement, une fois que la nouvelle équipe confirme que ça marche sans elle.
4. **Clore les deux lignes « Propriétaire inconnu »** : domaine et fournisseur de paiement, avant la mise en service de la nouvelle équipe.
:::
