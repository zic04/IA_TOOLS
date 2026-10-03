> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `dependencies`, écrit pour Acme Orders, le produit fictif du kit. Le tableau ci-dessous est généré à partir de `facts/dependencies.json`, écrit par `doc-kit facts --source dependencies --network`.

## En bref

5 paquets montrés ici (la liste complète en compte quelques dizaines) ; une dépendance directe, `acme-date-helpers`, n'existe pas dans le registre npm — probablement une hallucination d'un assistant IA, puisque le projet n'importe en réalité que `acme-date-utils`.

## Dépendances directes

::faits{source="dependencies" colonnes="name,version,ecosystem,direct,license"}

## Paquets qui n'existent pas

| Paquet | Importé dans | Preuve |
|---|---|---|
| `acme-date-helpers` | `package.json` ; importé comme `acme-date-utils` dans le code, un nom différent | [[verifie lib/services/approvalService.ts:3]] |

## Licences

| Paquet | Licence | Pourquoi ça compte |
|---|---|---|
| `prisma` | Apache-2.0 | Permissive, aucune action nécessaire |

Aucune licence copyleft n'a été trouvée parmi les dépendances directes.

## Obsolètes

- `next` 14.2.3 a une version mineure de retard sur la dernière 14.2.x ; aucun changement cassant ne s'applique.

## À vérifier

- Confirmer avec l'auteur de `lib/services/approvalService.ts` si `acme-date-utils` est un paquet interne jamais publié, ou une faute de frappe pour `acme-date-helpers` ; dans tous les cas, `package.json` devrait nommer le paquet réellement importé.
