## En bref

<!-- consigne : où sont déclarées les variables (service, onglet de configuration), combien, combien sont des références au coffre de secrets, combien sont lues par le code, et les absences qui ont un effet réel. Les valeurs ne sont jamais recopiées : la page dit ce que le code attend. -->

- **N** variables déclarées, dont **N** références au coffre de secrets.
- **N** sont lues par le code ; les autres ne servent qu'à la plateforme.
- Les absences qui ont un effet réel, avec leur constat (P10).

> [!NOTE] Les sources de cette page
> - **Portail** : noms et sources des variables, constatés le JJ mois AAAA.
> - **Code** : chaque lecture citée avec son fichier et sa ligne.
> - **Infrastructure as code** : les valeurs par défaut prévues, qui ne sont pas des valeurs constatées.

## Les variables, une par une

<!-- consigne : facultatif. Une sous-section ### par famille (authentification, base, stockage, IA, plateforme), avec le nombre de variables. Le nombre total va dans l'En bref, pas dans ce titre. -->

### Famille (n)

<!-- doc-kit:prefill source="env" -->
| Variable | Source | Lue par le code | Rôle et valeur attendue | Remarque |
|---|---|---|---|---|
| `NOM_DE_VARIABLE` | Service ou coffre | `chemin/fichier.ts:17` | Valeurs comprises par le code, et le défaut | Défaut de l'infrastructure, piège connu |

## Absentes ou sans effet

<!-- consigne : facultatif, ou en sous-page. Les variables lues par le code mais absentes, avec leur conséquence réelle ; celles qui sont définies sans effet, avec la preuve. -->

| Variable | Constat | Conséquence |
|---|---|---|
| `NOM_DE_VARIABLE` | Absente, ou écrasée par la base | Ce qui ne marche pas, et le constat lié |

## À vérifier

<!-- consigne : ce qu'il faut regarder au prochain accès au portail, en étapes concrètes. -->

:::etapes
1. **Valeurs** : les variables dont la valeur décide d'un comportement.
2. **Références au coffre** : leur résolution, et la date de la dernière version des secrets.
3. **Absences** : la décision à prendre pour chaque variable manquante.
:::
