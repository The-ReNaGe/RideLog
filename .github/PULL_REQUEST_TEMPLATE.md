## Description

<!-- What does this PR do? One subject (feature, fix or improvement) per PR. -->

> Commit format ([Conventional Commits](https://www.conventionalcommits.org/)) is verified automatically by CI (the "Conventional Commits" check) — no need to tick it yourself. Versioning is not manual either: release-please bumps it from the commit type (`feat`/`fix`/`BREAKING CHANGE`).
>
> Reviewer checklist before merging (nothing automated covers these): the PR was tested locally **with the development overlay** — `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`, because `docker-compose.yml` on its own pulls the published image and would therefore validate the previous version; any new database column has a versioned entry in `backend/migrations.py` (a brand-new table needs none, `create_all()` handles it); and the docs (`CLAUDE.md`/`CONTRIBUTING.md`/`README.md`) are up to date where relevant.

## Linked issue

<!-- Closes #... -->
