## En bref

<!-- consigne : ce que décrit le DAT (l'implantation en production : ce qui tourne, où, comment on y accède, avec quoi l'application communique), d'où il est reconstitué (portail du fournisseur cloud, infrastructure as code, code), et qu'il ne remplace pas un DAT validé par l'équipe d'infrastructure. Puis 6 à 8 puces : conteneurs, données, réseau, services hors du groupe, supervision, sauvegarde, nombre de flux. -->

- **Ce qui tourne** : les applications et leur image.
- **Les données** : bases, stockage, coffre de secrets, et comment on les joint.
- **Le réseau** : entrées, sorties, points d'accès privés.
- **Hors du groupe** : identité, passerelles, services internes.

> [!NOTE] Comment lire ce dossier
> - « **D'après le portail** » : constaté, daté.
> - « **Infrastructure as code** » : prévu par le dépôt d'infrastructure ; la production a pu diverger.
> - « **Déduit** » : conclusion tirée de ces sources, non observée directement.
> - « **À confirmer** » : inconnu ; à demander à l'équipe d'infrastructure.

## Dans cette partie

<!-- consigne : facultatif, dès que le DAT a des sous-pages (réseau et secrets ; données, sauvegarde et supervision). Colonne 1 = lien. -->

| Sous-page | Ce que vous y trouverez |
|---|---|
| Réseau, identités et secrets | Points d'accès, entrées et sorties, identités managées, secrets. |

## Le schéma

<!-- consigne : le schéma d'architecture, en SVG du site, ou en image annotée (:::ecran) si l'équipe d'architecture fournit le sien. Les pastilles renvoient au tableau des flux ; les flux absents ou inopérants sont en pointillé (d-dashed). Seulement les classes d-* du site, aucune couleur en dur. -->

::schema{id="r-dat" titre="L'application en production : ce qui tourne, les données jointes par des points d'accès privés, les sorties. Les pastilles renvoient au tableau des flux ; pointillé : flux absent ou inopérant."}

## Les flux numérotés

<!-- consigne : un flux par ligne, numéroté comme sur le schéma, avec la preuve dans le code ou l'infrastructure. Marquez « Absent » ou « Inopérant » ce qui ne fonctionne pas, avec le constat lié. -->

| N° | De → vers | Protocole | Authentification | Données et code |
|---|---|---|---|---|
| **#1** | Utilisateurs → application | HTTPS | Session | Ce qui passe, et la preuve (`chemin/fichier.ts`) |

> [!NOTE] Ce que le tableau laisse ouvert
> - **#1** : ce qui reste inconnu sur ce flux.

## Les composants

<!-- consigne : facultatif. Une ligne par composant, avec son nom réel en production et la page qui le détaille. -->

| Composant | Nom en production | Rôle | Pour aller plus loin |
|---|---|---|---|
| Application | `nom-de-la-ressource` | Ce qu'elle porte | La page qui la détaille |

## Ce que le DAT ne montre pas

<!-- consigne : la liste des inconnues à confirmer avec l'équipe d'infrastructure : accès, sorties, DNS, registre, sauvegarde, supervision, droits. -->

> [!NOTE] À confirmer avec l'équipe d'infrastructure
> - **Sujet** : la question précise à poser.

## Qui gère quoi

<!-- consigne : les responsabilités, par périmètre : ressources et réseau, image et déploiement, réglages stockés en base, inscription de l'application chez le fournisseur d'identité. -->

> [!DROITS] Responsabilités
> - **Ressources, réseau, variables, secrets, supervision** : l'équipe qui les gère, et avec quel outil.
> - **Image de l'application** : qui la construit et la déploie.
> - **Réglages stockés en base** : les administrateurs de l'application, et dans quel écran.
