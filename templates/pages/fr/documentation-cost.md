## En bref

<!-- consigne : un paragraphe : ce qu'ont coûté jusqu'ici la production et la maintenance de cette documentation — temps, agents IA et modèles, jetons, coût si llm.prices est renseigné — et la tendance d'une version à l'autre. Les tableaux sont générés depuis usage/<version>.jsonl (doc-kit stats). -->

::usage{view="summary"}

## Par version

<!-- consigne : généré : une ligne par version de l'application — la création d'abord, puis chaque mise à jour. Ne commentez que ce qui ressort (une mise à jour plus chère que la création, une version sans aucun agent). -->

::usage{view="versions"}

## Où passe le temps

<!-- consigne : généré : chaque bloc (captures, faits, génération, traduction, mise à jour, build, contrôles) avec ses étapes en dessous, et les étapes les plus lentes. -->

::usage{view="steps"}

::usage{view="slowest"}

## Modèles et agents

<!-- consigne : facultatif. Généré : les agents lancés par modèle, leurs jetons (entrée, sortie, cache) et leur coût. -->

::usage{view="models"}

## Quoi optimiser ensuite

<!-- consigne : facultatif. Deux ou trois actions concrètes tirées des tableaux ci-dessus : l'étape la plus lente à accélérer, une étape qui pourrait utiliser un modèle moins cher, une page réécrite alors qu'une petite modification suffirait. -->

- L'étape la plus longue des captures est l'attente : vérifiez les pages qui ne deviennent jamais calmes.
