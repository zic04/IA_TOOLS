<!-- consigne : une sous-page technique n'a pas d'« En bref » : la page parente le porte. Elle peut s'ouvrir sur un schéma, puis enchaîne un titre ## par mécanisme, dans l'ordre où le code les exécute. Exemple (Acme Orders, securite/connexion) : « ## Le déroulé de la connexion », « ## Le fournisseur d'identité », « ## Des groupes aux rôles », « ## La session ». -->

::schema{id="nom-du-schema" titre="Légende complète : ce que montre le schéma et comment le lire."}

## Premier mécanisme

<!-- consigne : renommez ce titre. Le mécanisme tel que le code l'exécute : tableau Valeur / Effet pour un réglage, :::etapes pour une séquence, preuve fichier:ligne pour chaque affirmation. Exemple : « La variable `AUTH_MODE` (lue dans `lib/auth/index.ts`) choisit les moyens de connexion. » -->

| Valeur | Effet |
|---|---|
| `valeur` (**défaut**) | Ce qui se passe réellement |

## Second mécanisme

<!-- consigne : renommez ce titre. Pour une séquence, une étape par ligne, chacune avec sa preuve. -->

:::etapes
1. Première étape réelle (`chemin/fichier.ts:41`).
2. Deuxième étape.
:::

> [!ATTENTION] Le piège, en une ligne
> Ce qui se passe et pourquoi.

## Pour aller plus loin

<!-- consigne : facultatif. Les pages sœurs et la page parente, chacune avec ce qu'on y trouve. Après un découpage, remplacez par un lien tout « ci-dessous » ou « plus haut » qui vise une autre page. -->

- Titre de la page liée : ce qu'on y trouve.
