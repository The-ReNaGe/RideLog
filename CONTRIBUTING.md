# Contribuer à RideLog

Merci de ton intérêt pour RideLog ! Ce guide explique comment contribuer au projet.

---

## Prérequis

- **Docker** et **Docker Compose** (obligatoire)
- **Git** pour cloner et versionner
- **Node.js 18+** si tu travailles sur le frontend sans Docker
- **Python 3.11+** si tu travailles sur le backend sans Docker

---

## Lancer le projet en local

```bash
git clone https://github.com/<ton-user>/RideLog.git
cd Ridelog
docker compose up -d --build
```

- **Interface** : http://localhost:3100
- **API Swagger** : http://localhost:8000/docs
- Le premier compte créé est automatiquement admin.

### Logs

```bash
docker logs ridelog-backend --tail 50 -f
docker logs ridelog-frontend --tail 50 -f
```

### Reconstruire un seul service

```bash
docker compose up -d --build backend    # Backend uniquement
docker compose up -d --build frontend   # Frontend uniquement
```

---

## Workflow de contribution

### 1. Fork et clone

```bash
# Fork le repo sur GitHub, puis :
git clone https://github.com/<ton-user>/RideLog.git
cd RideLog
git remote add upstream https://github.com/<repo-original>/RideLog.git
```

### 2. Crée une branche

```bash
git checkout -b feat/ma-feature    # Nouvelle feature
git checkout -b fix/mon-bugfix     # Correction de bug
git checkout -b docs/mise-a-jour   # Documentation
```

**Convention de nommage :**

| Préfixe | Usage |
|---------|-------|
| `feat/` | Nouvelle fonctionnalité |
| `fix/` | Correction de bug |
| `docs/` | Documentation |
| `refactor/` | Refactoring sans changement fonctionnel |
| `chore/` | Maintenance, dépendances, CI |

### 3. Code et teste

```bash
docker compose up -d --build
# Teste tes modifications sur http://localhost:3100
```

Si tu touches à `backend/maintenance_calculator.py`, `backend/security.py` ou aux routes `auth`/`admin`, lance aussi la suite de tests (CI obligatoire sur toute PR, voir `CLAUDE.md` section 19) :

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest tests/ -v
```

### 4. Commit

On utilise les [Conventional Commits](https://www.conventionalcommits.org/) :

```bash
git commit -m "feat: ajout du suivi pression pneus"
git commit -m "fix: mapping soupapes manquant dans les traductions"
git commit -m "docs: mise à jour du README"
```

| Type | Description |
|------|-------------|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `docs` | Documentation uniquement |
| `refactor` | Refactoring (pas de changement fonctionnel) |
| `chore` | CI, dépendances, config |

### 5. Push et Pull Request

```bash
git push origin feat/ma-feature
```

Ouvre une Pull Request sur GitHub vers la branche `main` du repo original.

---

## Structure du projet

```
RideLog/
├── backend/                        # API FastAPI (Python 3.11)
│   ├── main.py                     # Point d'entrée, CORS, lifespan
│   ├── models.py                   # Modèles SQLAlchemy + migrations manuelles
│   ├── maintenance_calculator.py   # ★ Logique métier principale ★
│   ├── reminder_scheduler.py       # Scheduler rappels automatiques
│   ├── security.py                 # JWT, bcrypt, rate limiting
│   ├── schemas.py                  # Validation Pydantic
│   ├── routes/                     # Endpoints API (auth, vehicles, maintenances...)
│   ├── integrations/               # Discord, Home Assistant
│   └── data/
│       ├── maintenance_intervals.json  # ★ Intervalles et prix d'entretien ★
│       ├── brands.json                 # Catégorisation marques
│       ├── vehicle_models.json         # Autocomplétion marques/modèles
│       └── communes.csv               # 39 202 communes françaises
├── frontend/                       # SPA React 18 + Vite 5 + Tailwind CSS 3
│   ├── src/
│   │   ├── App.jsx                 # Navigation state-based (pas de router)
│   │   ├── pages/                  # Pages principales
│   │   ├── components/             # Composants UI
│   │   └── lib/api.js              # Client Axios (~70 méthodes)
│   └── nginx.conf                  # Proxy /api → backend + SPA fallback
├── ha-integration/                 # Custom component Home Assistant
│   ├── custom_components/ridelog/  # Composant HA complet
│   └── templates/                  # Templates cartes Lovelace
├── docker-compose.yml              # Orchestration des services
└── CLAUDE.md                       # Documentation technique détaillée
```

Pour la documentation technique complète (logique de calcul, mapping des interventions, guides de modification), voir [CLAUDE.md](CLAUDE.md).

---

## Guides par type de contribution

### Ajouter un type d'entretien

1. **`backend/data/maintenance_intervals.json`** — Ajouter l'entrée avec `name`, `km_interval`, `months_interval`, `forecasted`, `prices`
2. **`backend/maintenance_calculator.py`** — Ajouter le `name` exact dans `INTERVENTION_TRANSLATIONS`
3. Tester avec `docker compose up -d --build backend`

### Ajouter une marque/modèle

1. **`backend/data/vehicle_models.json`** — Autocomplétion UI
2. **`backend/data/brands.json`** — Catégorisation (accessible/generalist/premium)

### Modifier les intervalles

- Modifier uniquement `km_interval` et/ou `months_interval` dans `maintenance_intervals.json`
- Aucune autre modification nécessaire

### Modifier le frontend

- Les composants sont dans `frontend/src/components/`
- Le client API est dans `frontend/src/lib/api.js`
- Navigation par état dans `App.jsx` (pas de React Router)
- Thème clair/sombre via variables CSS dans `index.css`

### Ajouter une colonne en base

- `backend/models.py` → ajouter dans le modèle SQLAlchemy
- `backend/models.py` → `init_db()` → ajouter la migration `ALTER TABLE ADD COLUMN`
- Les migrations sont manuelles et idempotentes (pas d'Alembic)

---

## Règles

- **Une PR = un sujet** (une feature, un fix, une amélioration)
- **Tester avant de soumettre** avec `docker compose up -d --build`
- **Pas de push direct sur `main`**
- **Conventional Commits** pour les messages de commit
- Interface en **français**, code en **anglais/français mixte** (convention existante)

---

## Base de données

- **SQLite** dans `./data/ridelog.db` (volume Docker)
- Single writer (1 worker uvicorn)
- **Pas d'Alembic** : les migrations sont manuelles dans `models.py` → `init_db()`
- Pour réinitialiser : supprimer `./data/ridelog.db` et relancer

---

## Besoin d'aide ?

- Ouvre une **issue** pour signaler un bug ou proposer une feature
- Consulte [claude.md](CLAUDE.md) pour la documentation technique détaillée
- Consulte la doc Swagger sur http://localhost:8000/docs pour explorer l'API

---

# Procédure de changement de version

La version est gérée automatiquement par [release-please](https://github.com/googleapis/release-please) — **il n'y a plus rien à faire manuellement**.

1. Merge tes PR sur `main` avec des messages [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, ...).
2. Le workflow `.github/workflows/release-please.yml` maintient automatiquement une "Release PR" qui accumule les changements depuis la dernière version, en déduit le prochain numéro de version (`fix` → patch, `feat` → minor, `BREAKING CHANGE` → major), et met à jour tous les fichiers concernés (`VERSION`, `frontend/src/version.js`, `backend/main.py`, `frontend/package.json`, `ha-integration/hacs.json`, `ha-integration/custom_components/ridelog/manifest.json`, `README.md`).
3. Merger cette Release PR crée automatiquement le tag Git et la GitHub Release avec un changelog généré à partir des commits.
4. Optionnel : une fois la release publiée, tu peux éditer sa description sur GitHub pour y ajouter des captures d'écran des nouvelles fonctionnalités.

**Notes :**
- Les fichiers listés ci-dessus (dont `frontend/src/version.js`, lu par l'UI) sont mis à jour uniquement par la Release PR — ne les modifie jamais à la main.
- La config se trouve dans `release-please-config.json` (fichiers à mettre à jour) et `.release-please-manifest.json` (version actuellement publiée).
