> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `release-notes`, écrit pour Acme Orders.

## En bref

Ces notes sont classées par version, la plus récente d'abord. Pour ce qui a changé sur une fonctionnalité précise, ouvrez sa fiche : [[fonctionnalite F-01]] indique la version sur laquelle elle a été vérifiée pour la dernière fois.

## Dernière version

### v2.4.0 — 2026-09-15

**Ajouté**

- Les responsables commerciaux peuvent désormais rejeter une commande avec un motif, et non plus seulement l'approuver ([la fonctionnalité de validation des commandes](#/examples/feature)).

**Modifié**

- La relance de validation se déclenche désormais après deux jours ouvrés au lieu de cinq : les responsables nous ont dit que cinq jours laissaient trop de commandes passer inaperçues.

**Corrigé**

- Une commande rejetée gardait parfois son ancien total après correction par le commercial ; la commande utilise désormais toujours le total resoumis.

## Versions précédentes

### v2.1.0 — 2026-05-02

- La validation des commandes est sortie : les commandes au-dessus du seuil attendent un responsable commercial au lieu d'être expédiées directement.

### v2.0.0 — 2026-03-10

- Les régions ont été introduites ; depuis cette version, la file d'un responsable commercial, et chaque rapport, est limitée à sa propre région.
