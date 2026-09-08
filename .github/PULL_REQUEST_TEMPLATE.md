## Description

<!-- Que fait cette PR ? Un seul sujet (feature, fix ou amélioration) par PR. -->

> Le format des commits ([Conventional Commits](https://www.conventionalcommits.org/)) est vérifié automatiquement par CI (check "Conventional Commits") — pas besoin de le cocher toi-même. La version n'est plus à gérer manuellement non plus : elle est bumpée automatiquement par release-please à partir du type de commit (`feat`/`fix`/`BREAKING CHANGE`).
>
> Points à vérifier côté reviewer avant de merger (pas de check automatique) : la PR a été testée en local **avec la surcharge de développement** — `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`, car `docker-compose.yml` seul tire l'image publiée et validerait donc la version précédente ; toute nouvelle colonne BDD a une entrée versionnée dans `backend/migrations.py` (une table entièrement nouvelle n'en demande pas, `create_all()` s'en charge) ; et la doc (`CLAUDE.md`/`CONTRIBUTING.md`/`README.md`) est à jour si nécessaire.

## Issue liée

<!-- Closes #... -->
