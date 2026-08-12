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
- [ ] Si la version du projet a changé : `VERSION` modifié puis `node update-version.js` exécuté et commité
- [ ] Documentation mise à jour si nécessaire (`claude.md`, `CONTRIBUTING.md`, `README.md`)

## Issue liée

<!-- Closes #... -->
