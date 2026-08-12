## Description

<!-- Que fait cette PR ? Un seul sujet (feature, fix ou amélioration) par PR. -->

## Type de changement

- [ ] `feat` — nouvelle fonctionnalité
- [ ] `fix` — correction de bug
- [ ] `docs` — documentation uniquement
- [ ] `refactor` — pas de changement fonctionnel
- [ ] `chore` — CI, dépendances, config

## Checklist

- [ ] Testé en local avec `docker compose up -d --build`
- [ ] Commits au format [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, ...)
- [ ] Si un champ/table BDD a été ajouté : migration idempotente dans `models.py` → `init_db()`
- [ ] Documentation mise à jour si nécessaire (`CLAUDE.md`, `CONTRIBUTING.md`, `README.md`)

> La version n'est plus à gérer manuellement : elle est bumpée automatiquement par release-please à partir du type de commit (`feat`/`fix`/`BREAKING CHANGE`).

## Issue liée

<!-- Closes #... -->
