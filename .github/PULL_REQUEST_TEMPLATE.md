## Description

<!-- Que fait cette PR ? Un seul sujet (feature, fix ou amélioration) par PR. -->

## Type de changement

- [ ] `feat` — nouvelle fonctionnalité
- [ ] `fix` — correction de bug
- [ ] `docs` — documentation uniquement
- [ ] `refactor` — pas de changement fonctionnel
- [ ] `chore` — CI, dépendances, config

> Le format des commits ([Conventional Commits](https://www.conventionalcommits.org/)) est vérifié automatiquement par CI (check "Conventional Commits") — pas besoin de le cocher toi-même. La version n'est plus à gérer manuellement non plus : elle est bumpée automatiquement par release-please à partir du type de commit (`feat`/`fix`/`BREAKING CHANGE`).
>
> Points à vérifier côté reviewer avant de merger (pas de check automatique) : la PR a été testée en local (`docker compose up -d --build`), toute nouvelle colonne/table BDD a une migration idempotente dans `init_db()`, et la doc (`CLAUDE.md`/`CONTRIBUTING.md`/`README.md`) est à jour si nécessaire.

## Issue liée

<!-- Closes #... -->
