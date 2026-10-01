## En bref

<!-- consigne : ce que permet la partie (partir d'un symptôme, arriver en une minute à la cause, à la vérification, à la correction et à la page qui explique), d'après quelle version du code. Puis les trois réflexes qui évitent la moitié des recherches. Exemple : « Introuvable veut souvent dire hors de votre périmètre. » -->

> [!MECANISME] Trois réflexes avant de chercher plus loin
> - **Premier réflexe.** La cause la plus fréquente, et où la vérifier.
> - **Deuxième réflexe.** Idem.
> - **Troisième réflexe.** Idem.

## Le schéma

<!-- consigne : facultatif. Les questions préalables, puis les familles de symptômes avec leurs premières vérifications et leur sous-page. Créez diagrams/r-diagnostic.svg, ou supprimez la section. -->

::schema{id="r-diagnostic" titre="Par où commencer : les questions préalables, puis les familles de symptômes, chacune avec ses premières vérifications et sa sous-page."}

## Avant tout : les vérifications qui expliquent la moitié des symptômes

<!-- consigne : 5 à 8 vérifications, chacune avec l'écran ou le journal où regarder, et ce qui piège. Exemple : « Le planificateur a-t-il tourné ? » -->

| Vérification | Où regarder | Ce qui piège |
|---|---|---|
| La question à se poser | [[menu Administration › Écran]] | Ce qui trompe, avec sa preuve |

## Où regarder

<!-- consigne : les sources de vérité, une sous-section par source : écrans d'administration, journal d'audit (codes d'action utiles), journaux du serveur (préfixes et fichier qui les écrit), requêtes prêtes à l'emploi réellement exécutées, dans le langage de la plateforme de journaux utilisée, avec la date de la vérification. -->

### Les écrans d'administration

| Écran | Ce qu'il dit |
|---|---|
| [[menu Administration › Écran]] | L'information utile au diagnostic |

### Le journal d'audit

| Code | Ce qu'il prouve |
|---|---|
| `action.code` | L'événement tracé |

### Les journaux du serveur

| Préfixe | Écrit par | Quand |
|---|---|---|
| `[prefixe]` | `chemin/fichier.ts:10` | Le cas qui écrit cette ligne |

## Dans cette partie

<!-- consigne : une ligne par sous-page (domaine), avec les symptômes traités et les numéros des constats principaux. Ajoutez les domaines suivants dans content/toc.json (niveau 2), par exemple validations, documents, alertes, chiffres et exploitation. -->

| Sous-page | Symptômes traités | Constats principaux |
|---|---|---|
| [1. Accès, droits et visibilité](#/reprendre/diagnostic/acces) | Connexion refusée, menu vide, écran ou bouton absent, données invisibles | — |

## Pour aller plus loin

<!-- consigne : les points d'attention, les parcours de bout en bout et l'exploitation, une fois écrits. -->

- [Les points d'attention](#/reprendre/points-attention) : les constats numérotés cités ici.
- [L'architecture d'ensemble](#/reprendre/architecture) : les mécanismes derrière les symptômes.
