> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `adr`, écrit pour Acme Orders, le produit fictif du kit. C'est une sous-page de [Exemple · Dossier d'architecture technique](#/examples/architecture) : une fiche de décision reconstituée, pas une discussion de conception d'origine.

## Statut

Acceptée (reconstituée à partir du code ; aucune discussion de conception d'origine n'a été trouvée).

## Contexte

Acme Orders sert plusieurs régions commerciales depuis une seule application et une seule base de données. Les données de chaque région (commandes, clients) doivent rester invisibles aux utilisateurs des autres régions, sans le coût d'une base par région.

## Décision

L'isolation par locataire est imposée à la base de données, par la sécurité au niveau ligne de PostgreSQL : chaque connexion fixe une variable de session avec la région courante, et une politique filtre chaque requête par elle ([[verifie infra/migrations/0012_orders_rls.sql:1]]). Le code applicatif est censé filtrer par région aussi, comme deuxième couche, mais ne le fait pas de façon cohérente (voir les Manques de [Exemple · Surface d'API](#/examples/api-surface)).

## Conséquences

- Une requête qui oublie de fixer la variable de session de région ne renvoie aucune ligne, pas les lignes d'une autre région : le mode de défaillance est le silence, pas la fuite, pour les tables protégées par une politique.
- La politique n'existe que sur `orders` ; `customers` et `approval_steps` n'ont aucune protection au niveau base et dépendent entièrement du code applicatif.
- Toute nouvelle table portant des données liées à une région a besoin de sa propre politique ; rien ne l'impose automatiquement aujourd'hui.

## Comment elle a été reconstituée

Reconstituée à partir de la migration de sécurité au niveau ligne (`infra/migrations/0012_orders_rls.sql`) et de l'absence de politique équivalente sur les deux autres tables ; aucun document de décision d'architecture ni discussion d'origine n'a été trouvé dans le dépôt.
