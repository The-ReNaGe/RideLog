# RideLog — Documentation technique complète

> **RideLog** est une application self-hosted de suivi d'entretien de véhicules (voitures + motos), de consommation de carburant et de planification de maintenance.
> Ce fichier est la documentation de référence pour tout développeur ou IA intervenant sur le projet.

---

## Table des matières

1. [Architecture générale](#1-architecture-générale)
2. [Déploiement Docker](#2-déploiement-docker)
3. [Backend — Structure et fichiers](#3-backend--structure-et-fichiers)
4. [Système d'authentification](#4-système-dauthentification)
5. [Gestion des véhicules](#5-gestion-des-véhicules)
6. [Système de maintenance — Le cœur du projet](#6-système-de-maintenance--le-cœur-du-projet)
7. [Suivi carburant](#7-suivi-carburant)
8. [Stations essence](#8-stations-essence)
9. [Webhooks et notifications](#9-webhooks-et-notifications)
10. [Intégration Home Assistant](#10-intégration-home-assistant)
11. [Intégration Discord](#11-intégration-discord)
12. [Frontend — Structure et fichiers](#12-frontend--structure-et-fichiers)
13. [Base de données](#13-base-de-données)
14. [Guides de modification](#14-guides-de-modification)
15. [Checklist de révision moto](#15-checklist-de-révision-moto)
16. [Surcharges d'intervalles par véhicule](#16-surcharges-dintervales-par-véhicule)
17. [KPI cards VehicleDetail](#17-kpi-cards-vehicledetail)
18. [Kilométrage moyen annuel](#18-kilométrage-moyen-annuel)
19. [Tests backend](#19-tests-backend)
20. [Préparation à l'internationalisation](#20-préparation-à-linternationalisation)
21. [Distribution par images publiées](#21-distribution-par-images-publiées)

---

## 1. Architecture générale

```
┌─────────────────────┐     ┌─────────────────────────┐
│   Frontend (React)  │────▶│   Backend (FastAPI)      │
│   nginx :3000       │     │   uvicorn :8000          │
│   Vite 5 + TW3      │     │   Python 3.11            │
└─────────────────────┘     │                          │
                            │  ┌───────────────────┐   │
                            │  │  SQLite (ridelog.db)│  │
                            │  └───────────────────┘   │
                            │  ┌───────────────────┐   │
                            │  │  /data/invoices/   │   │
                            │  │  /data/photos/     │   │
                            │  └───────────────────┘   │
                            └──────────┬───────────────┘
                                       │
                     ┌─────────────────┼──────────────────┐
                     ▼                 ▼                  ▼
              Home Assistant      Discord
              (custom comp.)      (webhooks)
```

| Composant | Stack | Port | Rôle |
|-----------|-------|------|------|
| Backend | FastAPI + SQLAlchemy + SQLite | 8000 | API REST, logique métier, scheduler |
| Frontend | React 18 + Vite 5 + Tailwind CSS | 3100 (nginx) | Interface utilisateur SPA |
| HA Integration | Custom component Python | — | Capteurs HA, config flow |
| Docker | docker-compose.yml | — | Orchestration des 2 services |

**Langues** : Interface 100% française. Code et commentaires en anglais/français mixte.

---

## 2. Déploiement Docker

### Fichier : `docker-compose.yml`

> ⚠️ **Depuis la 2.0, `docker-compose.yml` ne construit plus rien.** Il tire des
> images publiées sur ghcr.io. Toute vérification d'une modification du code
> exige la surcharge `docker-compose.dev.yml` — sans elle, on teste l'image
> publiée, c'est-à-dire la version précédente, et on croit avoir validé son
> changement. Voir §21.

```bash
# Utilisateur — télécharger et lancer
docker compose pull
docker compose up -d

# Développement — construire le code du dépôt
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# Un seul service
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build backend

# Logs
docker logs ridelog-backend --tail 50
docker logs ridelog-frontend --tail 50
```

### Services

| Service | Image publiée | Base | RAM limit | Volumes |
|---------|---------------|------|-----------|---------|
| `backend` | `ghcr.io/the-renage/ridelog-backend` | `python:3.11-slim` | 256 MB | `./data:/data` (BDD, sauvegardes, photos, factures) |
| `frontend` | `ghcr.io/the-renage/ridelog-frontend` | `node:18-alpine` → `nginx:alpine` | 512 MB | — (statique) |

Architectures publiées : `linux/amd64` et `linux/arm64`.

### Variables d'environnement backend

Les variables d'environnement sont gérées via un fichier `.env` à la racine du projet (jamais commité). Copier `.env.example` → `.env` et remplir les valeurs.

| Variable | Défaut | Description |
|----------|--------|-------------|
| `JWT_SECRET` | — | **Obligatoire** — secret JWT HS256. Le backend **refuse de démarrer** si la variable est absente (voir §4) |
| `DATABASE_URL` | `sqlite:////data/ridelog.db` | Chemin SQLite |
| `HA_INIT_KEY` | — | Clé pour initialiser le compte Home Assistant |
| `REGISTRATION_MODE` | `invite` | `invite` / `open` / `closed` |
| `CORS_ORIGINS` | *(vide)* | Origines CORS autorisées (séparées par `,`). Vide = aucun en-tête CORS, suffisant en déploiement standard (front et API sur la même origine). `*` déclenche un avertissement au démarrage |
| `TRUSTED_PROXIES` | `frontend` *(docker-compose)* | Proxys autorisés à déclarer l'IP du visiteur (IP, CIDR ou nom d'hôte, séparés par `,`). Vide = aucune confiance. Voir §4 |
| `LOG_LEVEL` | `INFO` | Niveau de log |
| `RAPIDAPI_KEY` | — | Clé API pour décodage plaque d'immatriculation |
| `RIDELOG_TAG` | `stable` | Canal d'image : `stable` (validé à la main), `latest` (chaque merge, non validé), ou une version figée. Voir §21 |
| `REGION` | `FR` | Pays actif — format de plaque et service de décodage (voir §20). Un code inconnu retombe sur `FR` |
| `REMINDER_INTERVAL` | `3600` | Intervalle de vérification des rappels (secondes) |
| `REMINDER_ENABLED` | `true` | Active/désactive le scheduler de rappels |
| `DB_BACKUP_DIR` | `/data/backups` | Répertoire des sauvegardes automatiques prises avant toute migration de schéma (voir §13) |
| `DB_BACKUP_KEEP` | `5` | Nombre de sauvegardes conservées ; les plus anciennes sont supprimées |
| `INVOICE_STORAGE_DIR` | `/data/invoices` | Répertoire des factures |
| `PHOTO_STORAGE_DIR` | `/data/photos` | Répertoire des photos véhicules |

### Réseau

Les deux containers communiquent via le réseau Docker `ridelog`. Le frontend nginx fait proxy vers `http://backend:8000` pour les routes `/api/*`.

### Mise à jour

```bash
# Sur le serveur, dans le dossier du projet
git pull origin main
docker compose pull
docker compose up -d
```

Le backend migre le schéma au démarrage, après avoir déposé une sauvegarde dans
`/data/backups` (voir §13).

---

## 3. Backend — Structure et fichiers

```
backend/
├── main.py                    # Point d'entrée FastAPI, CORS, lifespan
├── config.py                  # Variables d'environnement centralisées
├── models.py                  # Modèles SQLAlchemy + init_db()
├── migrations.py              # ★ MIGRATIONS VERSIONNÉES — voir §13 ★
├── schemas.py                 # Schémas Pydantic (validation entrées/sorties)
├── security.py                # JWT, bcrypt, rate limiting, middlewares auth
├── maintenance_calculator.py  # ★ LOGIQUE MÉTIER PRINCIPALE ★
├── reminder_scheduler.py      # Scheduler background (rappels webhook)
├── regions/                   # ★ Ce qui dépend du PAYS, pas de la langue — voir §20 ★
│   ├── __init__.py            # Registre, helpers partagés, variable REGION
│   └── fr.py                  # France : plaque SIV, réponse carte grise
├── Dockerfile
├── requirements.txt
├── requirements-dev.txt       # + pytest, pytest-cov (tests uniquement, jamais dans l'image de prod)
├── pytest.ini
├── data/
│   ├── maintenance_intervals.json      # ★ INTERVALLES ET PRIX D'ENTRETIEN ★
│   ├── brands.json                     # Catégorisation marques (accessible/generalist/premium)
│   ├── vehicle_models.json             # Liste marques/modèles pour autocomplétion
│   └── communes.csv                    # 39 202 communes françaises (géolocalisation)
├── tests/                     # pytest — voir section 19
│   ├── conftest.py
│   ├── test_maintenance_calculator.py
│   ├── test_login_rate_limiter.py
│   ├── test_migrations.py
│   ├── test_regions_fr.py
│   ├── test_maintenance_routes.py
│   └── test_auth_integration.py
└── routes/
    ├── __init__.py        # secure_delete() — suppression sécurisée de fichiers
    ├── auth.py            # Login, register, invitations, admin users, gestion HA
    ├── vehicles.py        # CRUD véhicules, VIN/plaque, photos, planning global
    ├── maintenances.py    # CRUD maintenances, factures, "À venir", overrides
    ├── dashboard.py       # Statistiques agrégées du parc
    ├── exports.py         # Export ZIP, estimation valeur, carte HA YAML
    ├── fuels.py           # CRUD carburant, statistiques conso
    ├── fuel_stations.py   # Recherche stations par ville (OSM + prix-carburants)
    └── webhooks.py        # CRUD webhooks, envoi notifications Discord
```

### Vérification de l'utilisation des fichiers

Tous les fichiers sont actifs :
- `routes/__init__.py` : exporte `secure_delete()`, importé dans `auth.py` et `vehicles.py`
- Tous les autres fichiers Python sont importés directement dans `main.py` ou dans d'autres modules

### main.py — Point d'entrée

- Configure FastAPI avec CORS, exception handler global
- Enregistre toutes les routes sous le préfixe `/api`
- Lifespan : initialise la BDD (`init_db()`), démarre le scheduler (`scheduler_loop()`)
- Endpoints racine : `/health` (santé), `/api` (config), `/api/vehicle-models` (données statiques)

### config.py — Configuration

- Charge toutes les variables d'environnement
- Expose `get_config_summary()` pour l'endpoint `/api`

### models.py — Modèles ORM

Voir section [Base de données](#13-base-de-données) pour le détail des tables.
- Fonction `init_db()` : crée les tables + gère les migrations manuelles (ALTER TABLE)
- Les migrations sont idempotentes (vérification avant ajout de colonne)

### schemas.py — Validation

Schémas Pydantic pour les entrées/sorties :
- `VehicleCreate` / `VehicleUpdate` : validation des champs véhicule
- `MaintenanceCreate` : validation d'une maintenance
- `FuelLogCreate` / `FuelLogUpdate` : validation des pleins
- `IntervalOverrideUpdate` : validation des surcharges d'intervalles
- Contraintes : `service_interval_km` (1000-100000), `year` (1900-2100)

### security.py — Sécurité

- **Hachage** : bcrypt avec coût 12
- **JWT** : algorithme HS256, expiration 7 jours (30 jours pour le compte HA)
- **Démarrage** : `validate_jwt_secret()` est appelé dans le lifespan (`main.py`) et **lève une `RuntimeError` si `JWT_SECRET` vaut sa valeur par défaut**. Cette valeur est lisible dans le dépôt public : démarrer avec elle permettrait de forger un JWT `{"user_id": 1}` et d'obtenir un accès admin sans mot de passe. Un secret de moins de 32 caractères démarre mais journalise un avertissement.
- **IP client** : toujours passer par `get_client_ip(request)` (`security.py`), **jamais** lire `X-Forwarded-For[0]`. nginx construit cet en-tête avec `$proxy_add_x_forwarded_for`, qui *ajoute* l'IP réelle **derrière** la valeur envoyée par le client — son premier élément est donc contrôlé par l'appelant. C'était une faille réelle : un `X-Forwarded-For` différent à chaque requête remettait le compteur à zéro et rendait le bruteforce illimité. `get_client_ip()` ne lit les en-têtes que si le pair TCP figure dans `TRUSTED_PROXIES`, puis parcourt `X-Forwarded-For` **de droite à gauche** en sautant les proxys de confiance — tout ce que l'appelant a injecté se trouve plus à gauche et n'est jamais atteint.
- **`TRUSTED_PROXIES`** : ⚠️ ne **jamais** y mettre un bloc large type `172.16.0.0/12`, ni revenir à une heuristique « toute IP privée est un proxy ». Docker fait du SNAT sur les ports publiés : une requête venue d'Internet vers le port 8000 arrive depuis la passerelle (`172.18.0.1`), une adresse **privée**. C'était une seconde faille réelle — 15 tentatives de login sur `:8000` avec `X-Real-IP` usurpé, aucun 429. Seul le nginx fourni (`frontend`, son IP de conteneur) est déclaré par défaut. Un reverse proxy personnel doit être ajouté explicitement, sinon tous les visiteurs sont comptés sous une seule IP.
- **Rate limiting par compte** : `account_limiter` (paliers 5/10/15+, plafond 5 min) complète le comptage par IP. Il reste efficace quand l'IP n'est pas fiable ou est partagée, et contre un attaquant distribué. Paliers volontairement courts : ce compteur est déclenchable par un tiers contre un compte légitime, il ne doit pas devenir une arme de déni de service.
- **Rate limiting** : `LoginRateLimiter` — verrouillage progressif par IP :
  - 3 échecs → 30s, 6 → 5min, 9 → 15min, 12+ → 1h
- **Middlewares** :
  - `get_current_user()` : vérifie le JWT, retourne l'objet `User`
  - `get_current_admin()` : idem + vérifie `is_admin`
  - Le compte HA (`is_integration_account=True`) voit tous les véhicules de tous les utilisateurs

### reminder_scheduler.py — Rappels automatiques

- Boucle infinie avec `CHECK_INTERVAL` (3600s par défaut)
- Attend 60s au démarrage (grâce period)
- Pour chaque véhicule de chaque utilisateur :
  - Calcule les maintenances à venir (`get_all_upcoming_maintenances()`)
  - Système de rappels à 3 niveaux :
    - **Tier 3** : En retard (jours ≤ 0 OU km ≤ 0)
    - **Tier 2** : À prévoir (jours ≤ 30 OU km ≤ 500)
    - **Tier 1** : À planifier (jours ≤ 90 OU km ≤ 1500)
  - Vérifie `NotificationLog` pour éviter les doublons
  - Envoie via `send_webhook_notification()` (Discord, ntfy, etc.)

> **Note** : le scheduler charge les overrides d'intervalles du véhicule et les passe à `get_all_upcoming_maintenances()` (`_check_vehicle_reminders()`), comme `_compute_upcoming()`. Les rappels webhook respectent donc les intervalles personnalisés. Toute nouvelle source d'échéances doit faire de même, sinon l'UI et les rappels divergent en silence.

---

## 4. Système d'authentification

### Fichiers concernés
- `backend/security.py` — JWT, bcrypt, middlewares
- `backend/routes/auth.py` — Endpoints login/register/admin/HA
- `frontend/src/lib/api.js` — Intercepteurs Axios (ajout token)
- `frontend/src/lib/clipboard.js` — Copie presse-papier avec fallback (contexte HTTP non sécurisé)
- `frontend/src/pages/AuthPage.jsx` — Formulaires login/register, extraction du token d'invitation depuis l'URL (`/invite/:token`)
- `frontend/src/pages/Settings.jsx` — Gestion du mode d'inscription + invitations (onglet "Inscription", admin uniquement)
- `frontend/src/pages/Admin.jsx` — Console admin : gestion utilisateurs + création manuelle de compte
- `frontend/src/App.jsx` — Gestion de l'état `isAuthenticated`

### Flux d'authentification

```
1. POST /api/auth/register  →  Crée le compte (+ invite si mode "invite")
2. POST /api/auth/login     →  Retourne { access_token, token_type, expires_in }
3. Frontend stocke le token dans localStorage
4. Chaque requête API inclut : Authorization: Bearer <token>
5. Backend vérifie le JWT via get_current_user()
```

### Endpoints auth

| Méthode | Route | Protection | Description |
|---------|-------|------------|-------------|
| POST | `/api/auth/register` | — | Créer un compte (respecte `REGISTRATION_MODE`) |
| POST | `/api/auth/login` | Rate limited | Connexion → JWT |
| GET | `/api/auth/me` | JWT | Infos utilisateur courant |
| POST | `/api/auth/logout` | JWT | Déconnexion (advisory, JWT stateless) |
| POST | `/api/auth/refresh` | JWT | Renouveler le token |
| POST | `/api/auth/refresh-token` | Bearer header | Renouveler (utilisé par HA) |
| POST | `/api/auth/ha-init` | `init_key` param | Créer/renouveler le compte Home Assistant |
| GET | `/api/admin/users` | Admin | Lister tous les utilisateurs |
| POST | `/api/admin/users` | Admin | ★ Créer un compte manuellement (mot de passe fourni ou généré automatiquement) ★ |
| DELETE | `/api/admin/users/{id}` | Admin | Supprimer un utilisateur |
| PUT | `/api/admin/users/{id}/promote` | Admin | Promouvoir/rétrograder (toggle) |
| GET | `/api/admin/ha-integration-status` | Admin | État de l'intégration HA |
| POST | `/api/admin/ha-integration/enable` | Admin | Activer l'intégration HA |
| POST | `/api/admin/ha-integration/disable` | Admin | Désactiver + supprimer le compte HA |
| POST | `/api/admin/invitations` | Admin | Créer une invitation |
| GET | `/api/admin/invitations` | Admin | Lister les invitations |
| DELETE | `/api/admin/invitations/{id}` | Admin | Supprimer/révoquer une invitation |
| GET | `/api/admin/registration-mode` | Admin | Mode d'inscription actuel |
| PUT | `/api/admin/registration-mode` | Admin | Changer le mode |
| GET | `/api/auth/check-invite/{token}` | — | Vérifier un token d'invitation |
| GET | `/api/auth/registration-status` | — | Mode d'inscription public |

### Modes d'inscription (`REGISTRATION_MODE`)

| Mode | Comportement |
|------|-------------|
| `open` | Tout le monde peut s'inscrire |
| `invite` | Inscription uniquement avec un token d'invitation valide |
| `closed` | Aucune inscription possible — seul un admin peut créer des comptes via `POST /admin/users` |

> **Ordre des contrôles dans `register()`** : le droit de s'inscrire (mode + validité de l'invitation) est vérifié **avant** l'unicité de l'identifiant, jamais l'inverse. Dans l'ordre inverse, un appelant non authentifié distinguait un compte existant (`409`) d'un compte inconnu (`403`) et pouvait énumérer les utilisateurs de l'instance — de quoi cibler ensuite le bruteforce, et déclencher le verrouillage par compte sur des identifiants valides. Le `409` reste renvoyé une fois le droit prouvé : l'invité doit pouvoir choisir un autre identifiant. Verrouillé par `test_register_does_not_reveal_existing_usernames` (voir §19).

### Invitations

- Créées par un admin via `POST /api/admin/invitations`
- Token unique, durée configurable (1-720 heures)
- Consommée à l'inscription (marquée `used_by` + `used_at`)
- Stockées dans la table `invitations`
- Lien généré côté frontend : `{origin}/invite/{token}` — `AuthPage.jsx` extrait le token depuis `window.location.pathname` au montage et valide via `GET /auth/check-invite/{token}`
- Copie du lien : passe par `lib/clipboard.js` (fallback `document.execCommand('copy')` requis car `navigator.clipboard` est indisponible en HTTP non sécurisé — cas fréquent en accès LAN self-hosted)

### Création manuelle de compte par l'admin

- `POST /api/admin/users` — nécessaire en mode `closed` où l'auto-inscription est impossible, ou pour créer un compte sans passer par le flux d'invitation
- Mot de passe optionnel dans la requête : si absent, généré côté serveur (`secrets.token_urlsafe(12)`) et renvoyé **une seule fois** dans la réponse (`generated_password`), jamais journalisé ni réexposé ensuite
- Même politique de hachage que `/auth/register` (bcrypt coût 12 via `hash_password()`)
- UI : section "➕ Créer un compte" dans `Admin.jsx`, affiche le mot de passe généré dans un encart à copier manuellement (l'admin doit le transmettre par un canal sécurisé)

### Compte Home Assistant — gestion activate/disable

Le flag `_ha_integration_enabled` (variable globale en mémoire dans `auth.py`) contrôle l'accès HA :

```python
_ha_integration_enabled: bool = True  # défaut au démarrage
```

**Comportement :**
- `True` (défaut) : `ha-init` peut créer le compte s'il n'existe pas, ou renouveler le token si existant
- `False` : `ha-init` retourne 403 même avec la bonne `HA_INIT_KEY` — HA ne peut pas recréer le compte

**`POST /admin/ha-integration/disable` :**
1. Passe le flag à `False`
2. Supprime le compte `homeassistant` en BDD (révocation immédiate de tous les tokens)

**`POST /admin/ha-integration/enable` :**
1. Passe le flag à `True`
2. HA recrée le compte automatiquement à son prochain appel `ha-init`

**`GET /admin/ha-integration-status` retourne :**
```json
{ "enabled": true, "account_exists": true, "account_id": 2 }
```

> **Important** : le flag repasse à `True` après un redémarrage du backend (valeur par défaut). Cela ne recrée pas le compte — HA doit appeler `ha-init` lui-même au redémarrage de son composant. Le compte ne se recrée jamais silencieusement si l'admin a explicitement désactivé puis redémarré sans réactiver.

**Sécurité :**
- Comparaison timing-safe de la `HA_INIT_KEY` (protection anti timing attack)
- Le compte HA ne peut jamais être promu admin (`promote_user` le bloque explicitement)
- Token 30 jours, renouvelable via `/api/auth/refresh-token`
- Password aléatoire généré (`secrets.token_urlsafe(32)`) — jamais utilisé pour se connecter

### Pour modifier

- **Changer la durée du JWT** : `security.py` → `JWT_EXPIRE_DAYS`
- **Changer le coût bcrypt** : `security.py` → `bcrypt.hashpw(... rounds=12)`
- **Ajouter un nouveau mode d'inscription** : `routes/auth.py` → endpoint `register`
- **Modifier le rate limiting** : `security.py` → `LoginRateLimiter` → `LOCKOUT_THRESHOLDS`
- **Modifier la génération du mot de passe admin-créé** : `routes/auth.py` → endpoint `admin_create_user` → `secrets.token_urlsafe(12)`

---

## 5. Gestion des véhicules

### Fichiers concernés
- `backend/routes/vehicles.py` — CRUD, VIN/plaque, photos, planning
- `backend/models.py` → `Vehicle` — Modèle ORM
- `backend/schemas.py` → `VehicleCreate`, `VehicleUpdate` — Validation
- `frontend/src/components/VehicleForm.jsx` — Formulaire de création
- `frontend/src/components/VehicleCard.jsx` — Carte résumé
- `frontend/src/pages/VehicleList.jsx` — Liste des véhicules
- `frontend/src/pages/VehicleDetail.jsx` — Page détail (maintenance + carburant)

### Endpoints véhicules

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/vehicles` | Lister les véhicules de l'utilisateur |
| POST | `/api/vehicles` | Créer un véhicule |
| GET | `/api/vehicles/{id}` | Détail d'un véhicule |
| PUT | `/api/vehicles/{id}` | Modifier un véhicule |
| DELETE | `/api/vehicles/{id}` | Supprimer un véhicule (cascade) |
| POST | `/api/vehicles/decode-vin` | Décoder un VIN (API NHTSA publique) |
| POST | `/api/vehicles/decode-license-plate` | Décoder une plaque (RapidAPI) |
| GET | `/api/vehicles/brand-service-defaults` | Intervalles par défaut (marque + cylindrée) |
| GET | `/api/vehicles/planning` | Planning global de tous les véhicules |
| POST | `/api/vehicles/{id}/photo` | Upload photo |
| GET | `/api/vehicles/{id}/photo` | Récupérer la photo — **authentifié, réservé au propriétaire** |
| DELETE | `/api/vehicles/{id}/photo` | Supprimer photo |
| GET | `/api/vehicles/{id}/estimate` | Estimation de valeur résiduelle |
| GET | `/api/vehicles/{id}/ha-dashboard-card` | YAML carte Lovelace HA |

### Types de véhicules

| Type | Champ `vehicle_type` | Spécificités |
|------|---------------------|-------------|
| Voiture | `car` | Cylindrée optionnelle, motorisation (essence/diesel/hybride/électrique) |
| Moto | `motorcycle` | Cylindrée obligatoire, `service_interval_km/months` configurable |

### Motorisation (`motorization`)

Valeurs possibles : `essence`, `diesel`, `hybride`, `electrique`, `thermal`
- Impacte le filtrage des maintenances (filtre à gasoil ≠ filtre à essence, bougies = essence/hybride uniquement)

### Catégories de gamme (`range_category`)

| Catégorie | Voiture | Moto |
|-----------|---------|------|
| `accessible` | Dacia, Peugeot, Toyota | Honda, Yamaha, Kawasaki |
| `generalist` | VW, Ford, Renault | Ducati, KTM, Triumph |
| `premium` | BMW, Mercedes, Audi | BMW, Harley-Davidson, MV Agusta |

La catégorie est auto-détectée à partir de la marque (`data/brands.json`) et peut être ajustée par prix d'achat et âge.

### Pour modifier

- **Ajouter un type de véhicule** : `models.py` (colonne), `schemas.py` (validation), `routes/vehicles.py`, `maintenance_calculator.py`, `VehicleForm.jsx`
- **Ajouter un champ véhicule** : `models.py` (colonne + migration dans `init_db()`), `schemas.py`, `routes/vehicles.py`, `VehicleForm.jsx`
- **Modifier la catégorisation auto** : `maintenance_calculator.py` → `auto_categorize_vehicle()` + `data/brands.json`
- **Ajouter une marque** : `data/vehicle_models.json` (autocomplétion) + `data/brands.json` (catégorisation)

---

## 6. Système de maintenance — Le cœur du projet

> C'est la partie la plus complexe. Le système de maintenance repose sur un JSON de configuration, un calculateur Python et un système de mapping nom→clé.

### Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `data/maintenance_intervals.json` | ★ Configuration des intervalles et prix |
| `maintenance_calculator.py` | ★ Logique de calcul des échéances |
| `routes/maintenances.py` | CRUD + calcul "À venir" + overrides |
| `routes/vehicles.py` | Planning global |
| `routes/dashboard.py` | Stats agrégées parc |

### 6.1 Le fichier JSON (`maintenance_intervals.json`)

Structure de premier niveau :
```json
{
  "car": { ... },
  "motorcycle": {
    "forecasted": { ... },
    "recordable": { ... },
    "brand_defaults": { ... },
    "service_prices": { ... },
    "annual_service_prices": { ... }
  }
}
```

#### Entrées voiture (`car`)

Chaque entrée a la structure :
```json
"oil_change": {
  "name": "Vidange d'huile + Remplacement filtre à huile",
  "km_interval": 10000,
  "months_interval": 12,
  "forecasted": true,
  "prices": {
    "accessible": { "min": 80, "max": 120 },
    "generalist": { "min": 100, "max": 160 },
    "premium": { "min": 150, "max": 250 }
  }
}
```

#### Entrées moto forecasted (apparaissent dans "À venir")

| Clé | Nom | km_interval | months_interval | Notes |
|-----|-----|-------------|-----------------|-------|
| `periodic_service` | Révision périodique (km) | **dynamique** | null | Intervalle = `brand_defaults` ou surcharge utilisateur. Prix = `service_prices` |
| `annual_service` | Entretien annuel | null | 12 (fixe) | Contrôle simplifié annuel. Toujours 12 mois. Prix = `annual_service_prices` |
| `oil_change` | Vidange d'huile + Remplacement filtre à huile | **dynamique** | 12 | km = même que `periodic_service`. Calculé dans `get_intervals_for_vehicle()` |
| `valve_clearance` | Contrôle jeu aux soupapes | **dynamique** | null | = 2× l'intervalle de révision (1 sur 2) |
| `brake_fluid` | Remplacement liquide de frein | null | 24 | Ancien nom : "Purge liquide de frein et embrayage" — conservé dans `INTERVENTION_TRANSLATIONS` |
| `coolant` | Liquide de refroidissement | null | 36 | |
| `fork_service` | Révision fourche | null | 36 | |
| `inspection_technical_moto` | Contrôle technique | null | spécial | Calcul réglementaire français |

**IMPORTANT** : Les clés `periodic_service`, `valve_clearance` et `oil_change` ont des intervalles km `null` dans le JSON. Ils sont calculés dynamiquement dans `maintenance_calculator.py` → `get_intervals_for_vehicle()`.

#### `recordable` — Entretiens enregistrables moto

Interventions qu'on peut enregistrer mais qui n'apparaissent pas dans "À venir" :
`break_in_service` (rodage), `oil_filter`, `spark_plug`, `air_filter`, `tire_replacement_*`, `brake_pads`, `brake_disc`, `chain_kit`, `chain_maintenance`, `battery`, `steering_bearings`, `wheel_bearings`, `carburetor_cleaning`, `injection_sync`, `electronic_diagnosis`, `transmission_fluid`

### 6.2 Le calculateur (`maintenance_calculator.py`)

#### Constantes critiques

**`INTERVENTION_TRANSLATIONS`** — Mapping nom français → clé technique

C'est le dictionnaire qui fait le lien entre le nom affiché en français (stocké en BDD quand l'utilisateur enregistre une maintenance) et la clé technique du JSON. **Chaque nom dans le JSON DOIT avoir une entrée ici**, sinon le système ne reconnaîtra pas les maintenances enregistrées.

Entrées importantes :

```python
"Purge liquide de frein et embrayage": "brake_fluid",         # ancien nom — conserver pour BDD existante
"Remplacement liquide de frein": "brake_fluid",                # nouveau nom
"Vidange d'huile + Remplacement filtre à huile": "oil_change_moto",  # vidange moto forecasted
```

> **Pourquoi `oil_change_moto` et pas `oil_change`** : `oil_change` est déjà utilisé pour les voitures. La clé BDD est distincte pour ne pas mélanger les historiques voiture/moto.

**`MAJOR_SERVICE_KEYS`** — Set utilisé pour le calcul de référence `annual_service` :

```python
MAJOR_SERVICE_KEYS = {
    "annual_service", "periodic_service",
    "oil_change_moto", "valve_clearance",
}
```

**`CONSUMABLES`** — Set de clés exclues (legacy, plus utilisé activement). Le filtrage se fait maintenant via le champ `forecasted: true/false` du JSON.

#### Classe `MaintenanceCalculator`

##### `get_brand_service_interval(brand, displacement)` → `{"km": int, "months": int}`

Retourne l'intervalle de révision par défaut pour une marque et cylindrée données.
- Cherche dans `brand_defaults` du JSON
- Fallback vers `_default`

##### `get_intervals_for_vehicle(vehicle_type, displacement, brand, service_interval_km, service_interval_months)` → Dict

**Fonction centrale** qui retourne les intervalles de maintenance pour un véhicule donné.

- **Voiture** : retourne la section `car` du JSON telle quelle
- **Moto** : merge `forecasted` + `recordable`, puis applique la logique dynamique :
  - `periodic_service` → `km_interval = effective_km` (brand_defaults ou surcharge), `months_interval = None`
  - `annual_service` → prix chargés depuis `annual_service_prices`, `months_interval` = 12 (fixe, défini dans le JSON)
  - `valve_clearance` → `km_interval = effective_km × 2`
  - `oil_change` (moto) → `km_interval = effective_km`, `months_interval` = 12 (défini dans le JSON)

##### `get_all_upcoming_maintenances(..., overrides=None)` → List[Dict]

Calcule toutes les maintenances à venir pour un véhicule.

Paramètres importants :
- `last_maintenances` : Dict `{clé_technique: (dernière_date, dernier_km)}` — construit en mappant chaque maintenance enregistrée via `get_intervention_key()`
- `motorization` : filtre les entretiens par motorisation (ex: filtre à gasoil uniquement pour diesel)
- `overrides` : Dict `{intervention_key: VehicleMaintenanceOverride}` — surcharges par véhicule qui priment sur le JSON. Passé depuis `_compute_upcoming()` et `dashboard.py`. Voir section 16.

**Logique spéciale `annual_service`** : la date de référence est la plus récente parmi toutes les interventions majeures (`MAJOR_SERVICE_KEYS`). Cela évite que l'entretien annuel reste calé sur une ancienne date alors qu'une révision périodique plus récente a eu lieu.

**Référence temporelle pour les items jamais enregistrés** : priorité à la MEC (`registration_date`) si disponible, sinon fallback sur le 1er janvier de `vehicle_year`.

```python
if registration_date:
    reference_start_date = registration_date   # MEC exacte prioritaire
elif vehicle_year:
    reference_start_date = datetime(safe_year, 1, 1)  # fallback seulement
```

Chaque item retourné inclut :
- `intervention_key` : clé technique (ex: `fork_service`) — utilisé par l'UI pour identifier l'item à éditer
- `has_override` : `True` si un override est actif sur cet item — affiché comme badge "Personnalisé" dans l'UI
- `never_recorded` : `True` si aucun historique — le frontend affiche "Jamais enregistré"

##### `calculate_maintenance_status(...)` → (status, km_remaining, days_remaining, next_due_mileage, next_due_date)

Calcule le statut d'un entretien :
- `next_due_mileage` = arrondi au multiple le plus proche de `km_interval` (anti-drift). Ex: 10 500 + 10 000 → 20 000, pas 20 500
- `km_remaining = next_due_mileage - current_mileage`
- `next_due_date = last_date + months_interval`
- Statuts : `overdue` (négatif), `urgent` (≤300km ou ≤7j), `warning` (≤1500km ou ≤90j), `ok`

##### `calculate_inspection_technical_date(...)` → datetime

Calcul réglementaire du contrôle technique :
- **Moto 2020-2021** : 1er CT en 2026, 5ème anniversaire + 4 mois max, avant le 31/12/2026
- **Moto 2022+** : 1er CT au 5ème anniversaire, puis tous les 3 ans
- **Voiture** : 1er CT au 4ème anniversaire + 6 mois, puis tous les 2 ans

### 6.3 Endpoints maintenances

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/vehicles/{vid}/available-interventions` | Types d'interventions disponibles avec prix |
| GET | `/api/vehicles/{vid}/maintenances` | Historique des maintenances |
| POST | `/api/vehicles/{vid}/maintenances` | Enregistrer une maintenance (multipart, jusqu'à 10 factures) |
| PUT | `/api/vehicles/{vid}/maintenances/{mid}` | Modifier |
| DELETE | `/api/vehicles/{vid}/maintenances/{mid}` | Supprimer (+ suppression sécurisée des factures) |
| GET | `/api/vehicles/{vid}/upcoming` | Maintenances à venir |
| GET | `/api/vehicles/{vid}/recommendations` | Recommandations |
| GET | `/api/vehicles/{vid}/cost-forecast` | Prévision de coûts (min/max par catégorie) |
| GET | `/api/vehicles/{vid}/recap` | Récapitulatif complet (coûts, interventions, documents) |
| GET | `/api/vehicles/{vid}/recap/download` | Export ZIP (CSV + factures) |
| GET | `/api/vehicles/{vid}/interval-overrides` | Lister tous les overrides du véhicule |
| PUT | `/api/vehicles/{vid}/interval-overrides/{key}` | Créer ou mettre à jour un override (upsert) |
| DELETE | `/api/vehicles/{vid}/interval-overrides/{key}` | Supprimer → retour aux valeurs par défaut |

### 6.4 Kilométrage optionnel à l'enregistrement

Quand l'utilisateur n'entre pas de kilométrage lors d'une intervention, le backend estime la valeur via `_estimate_mileage()` dans `maintenances.py` :
- Collecte tous les points (maintenances + pleins + km actuel) triés par date
- Interpolation linéaire si la date est entre deux points connus
- Extrapolation si la date est avant/après tous les points connus
- La réponse inclut `mileage_estimated: true` et `estimated_mileage` si estimé

Le champ kilométrage est affiché comme optionnel dans `MaintenanceForm.jsx` avec le label `"Kilométrage (km) (optionnel — estimé si absent)"`.

### 6.5 Flux "enregistrement → mise à jour du planning"

```
1. Utilisateur enregistre "Contrôle jeu aux soupapes" à 20 600 km
2. POST /api/vehicles/{vid}/maintenances
   → Stocke en BDD : intervention_type = "Contrôle jeu aux soupapes"
   → Met à jour vehicle.current_mileage si supérieur
   → Efface NotificationLog pour cette intervention (force nouveaux rappels)
3. GET /api/vehicles/{vid}/upcoming
   → _compute_upcoming() récupère toutes les maintenances en BDD
   → Charge les overrides du véhicule
   → Pour chaque : get_intervention_key("Contrôle jeu aux soupapes") → "valve_clearance"
   → Construit last_maintenances["valve_clearance"] = (date, 20600)
   → get_all_upcoming_maintenances() calcule :
     - valve_clearance.km_interval = 2 × 10000 = 20000 (ou override si défini)
     - next_due = 20600 + 20000 = 40600 km
```

### 6.6 Pour modifier

#### Ajouter un nouveau type d'entretien

1. **JSON** (`maintenance_intervals.json`) :
   - Voiture : ajouter une entrée dans `car` avec `name`, `km_interval`, `months_interval`, `forecasted`, `prices`
   - Moto forecasted : ajouter dans `motorcycle.forecasted`
   - Moto recordable : ajouter dans `motorcycle.recordable`

2. **Traductions** (`maintenance_calculator.py`) :
   - Ajouter le `name` exact dans `INTERVENTION_TRANSLATIONS` → clé technique

3. **UI** (`MaintenanceForm.jsx`) :
   - Ajouter le nom dans `STATIC_MAINTENANCE_TYPES` (car ou motorcycle)
   - Note : ce n'est qu'un fallback, l'API `/available-interventions` charge dynamiquement depuis le JSON

#### Modifier un intervalle existant globalement

- Modifier uniquement `km_interval` et/ou `months_interval` dans le JSON
- Aucune autre modification nécessaire
- Pour une modification par véhicule uniquement → utiliser les overrides (section 16)

#### Ajouter un filtre par motorisation

- Ajouter `"motorization": ["diesel"]` ou `["essence", "hybride"]` dans l'entrée JSON
- Le calculateur filtre automatiquement dans `get_all_upcoming_maintenances()`

#### Modifier les prix

- Modifier les valeurs `min`/`max` dans `prices` par catégorie dans le JSON

#### Modifier les intervalles par défaut d'une marque moto

- Modifier `brand_defaults` dans le JSON (section `motorcycle`)
- Ajouter une nouvelle marque avec ses cylindrées

#### Modifier la logique "soupapes = 1 révision sur 2"

- `maintenance_calculator.py` → `get_intervals_for_vehicle()` → bloc `elif key == "valve_clearance"`
- Actuellement : `entry["km_interval"] = effective_km * 2`

---

## 7. Suivi carburant

### Fichiers concernés
- `backend/routes/fuels.py` — CRUD + statistiques
- `backend/models.py` → `FuelLog`
- `frontend/src/components/FuelTracking.jsx` — UI complète

### Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/vehicles/{vid}/fuel-logs` | Historique des pleins |
| POST | `/api/vehicles/{vid}/fuel-logs` | Enregistrer un plein |
| PUT | `/api/vehicles/{vid}/fuel-logs/{fid}` | Modifier |
| DELETE | `/api/vehicles/{vid}/fuel-logs/{fid}` | Supprimer |
| GET | `/api/vehicles/{vid}/fuel-stats` | Statistiques de consommation |

### Statistiques calculées

- Consommation L/100 km (globale + par segment)
- Coût/100 km
- Répartition par mois (litres, coût, prix moyen, conso moyenne)
- Stats par station (visites, prix moyen)
- Projections annuelles
- Points de graphique (24 derniers mois)

---

## 8. Stations essence

### Fichiers concernés
- `backend/routes/fuel_stations.py` — Recherche et géolocalisation
- `backend/data/communes.csv` — 39 202 communes françaises
- `frontend/src/components/FuelStations.jsx` — UI recherche

### Sources de données

1. **communes.csv** : coordonnées GPS des communes françaises (chargé en RAM au démarrage)
2. **Nominatim** (OpenStreetMap) : fallback de géolocalisation (rate-limitée à 2s entre requêtes)
3. **prix-carburants.gouv.fr** : API officielle des prix de carburant en temps réel, fallback OSM

### Recherche insensible aux tirets et accents

La fonction `_remove_accents()` dans `fuel_stations.py` normalise également les tirets et apostrophes en espaces avant comparaison :

```python
def _remove_accents(text: str) -> str:
    nfd = unicodedata.normalize('NFD', text)
    result = ''.join(c for c in nfd if unicodedata.category(c) != 'Mn')
    # Normaliser tirets et apostrophes → espace
    return result.replace('-', ' ').replace("'", ' ').replace('\u2019', ' ')
```

Ainsi "pont-péan", "pont pean" et "pont péan" trouvent tous "Pont-Péan" dans la BDD communes.

### Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/fuel-stations/search?city=...&fuel_type=...&max_distance=...` | Recherche par ville |
| GET | `/api/fuel-stations/city-suggestions?q=...` | Autocomplétion ville (max 3 résultats) |
| GET | `/api/fuel-stations/fuel-types` | Types de carburant disponibles |

**Les trois routes exigent un JWT** — la dépendance est posée sur le routeur entier (`APIRouter(..., dependencies=[Depends(get_current_user)])`), pas endpoint par endpoint, pour qu'un ajout futur soit protégé par défaut.

> **Pourquoi** : ces endpoints n'exposent aucune donnée confidentielle, mais `/search` déclenche des appels sortants vers Nominatim, Overpass et prix-carburants. Ouverts, ils faisaient de l'instance un **relais gratuit vers ces services, sous son adresse IP** : n'importe qui pouvait boucler dessus jusqu'à faire bannir l'instance, et la fonctionnalité cessait alors de marcher pour les utilisateurs légitimes — sans que rien dans les logs ne ressemble à une attaque. S'y ajoutait un déni de service bon marché : chaque appel mobilise jusqu'à 30 s de connexions sortantes sur un conteneur limité à 256 Mo. L'interface n'a pas été touchée : `FuelStations.jsx` appelle déjà `api.request()`, donc le client Axios qui porte le token.

### Cache et bornes de `/search`

- **Cache mémoire** (`_search_cache`, TTL 900 s, 200 entrées max, éviction de la plus ancienne). Clé : `(ville normalisée, fuel_type, max_distance, limit)` — la normalisation passe par `_remove_accents()`, donc « Pont-Péan » et « pont pean » partagent la même entrée. Les résultats **vides sont mis en cache aussi** : ils ont coûté le même aller-retour réseau. Mesuré sur l'instance : 912 ms sans cache, 19 ms avec.
- **Bornes** : `max_distance` ∈ ]0, 100] km et `limit` ∈ ]0, 100]. Le rayon dimensionne la requête Overpass, dont le coût de calcul croît avec son carré — libre, il permettait de demander un rayon continental à chaque appel. Hors bornes → `422`.
- **Erreurs** : les exceptions d'appel sortant sont journalisées mais jamais renvoyées (elles portent des URL internes et des extraits de réponse tierce) — le client reçoit un `502` générique.

> C'est un cache **par processus**, perdu au redémarrage et non partagé : correct tant que le backend tourne avec un seul worker uvicorn (cf. §13).

### Pour modifier

- **Ajouter un type de carburant** : `fuel_stations.py` + `FuelStations.jsx`
- **Modifier le rayon de recherche** : paramètre `max_distance` de l'endpoint (plafond dans le `Query(...)`)
- **Modifier la durée du cache** : `fuel_stations.py` → `_SEARCH_CACHE_TTL`
- **Ajouter une source de prix** : `fuel_stations.py` → fonction de recherche

---

## 9. Webhooks et notifications

### Fichiers concernés
- `backend/routes/webhooks.py` — CRUD + envoi
- `backend/reminder_scheduler.py` — Déclenchement automatique
- `backend/models.py` → `Webhook`, `NotificationLog`

### Type de webhook supporté

| Type | Format | Description |
|------|--------|-------------|
| `discord` | Embed riche (couleur, champs, timestamp) | Message Discord |

### Flux de notification

```
1. reminder_scheduler.py → check_all_reminders() (toutes les heures)
2. Pour chaque véhicule :
   → Calcule les maintenances à venir
   → Détermine le tier (3=retard, 2=bientôt, 1=à prévoir)
   → Vérifie NotificationLog (déjà envoyé ?)
   → Si nouveau : send_webhook_notification() pour chaque webhook Discord actif de l'utilisateur
   → Enregistre dans NotificationLog
3. Quand l'utilisateur enregistre une maintenance :
   → clear_notification_logs_for(vehicle_id, intervention_type)
   → Permet de renvoyer des rappels frais au prochain cycle
```

### Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/settings/webhooks` | Lister les webhooks |
| POST | `/api/settings/webhooks` | Créer un webhook |
| DELETE | `/api/settings/webhooks/{id}` | Supprimer |
| PUT | `/api/settings/webhooks/{id}` | Activer/désactiver |
| POST | `/api/settings/webhooks/{id}/test` | Tester l'envoi |
| POST | `/api/settings/webhooks/check-reminders` | Forcer vérification maintenant |

---

## 10. Intégration Home Assistant

### Fichiers concernés
- `ha-integration/custom_components/ridelog/` — Composant HA complet
- `backend/routes/auth.py` → endpoints `ha-init` + `ha-integration/*`
- `frontend/src/components/integrations/HomeAssistantIntegration.jsx` — Interface gestion

### Gestion activation/désactivation (voir aussi section 4)

L'intégration est contrôlée depuis l'UI RideLog (Paramètres → Intégrations → Home Assistant).

| Action | Endpoint backend | Effet |
|--------|-----------------|-------|
| Statut | `GET /admin/ha-integration-status` | `{enabled, account_exists, account_id}` |
| Activer | `POST /admin/ha-integration/enable` | Flag → True, HA peut créer/renouveler le compte |
| Désactiver | `POST /admin/ha-integration/disable` | Flag → False + supprime le compte HA |

**L'UI `HomeAssistantIntegration.jsx` affiche 3 états :**
- ✅ **Intégration active** : flag True + compte existant
- ⚙️ **Activée — compte non encore créé par HA** : flag True + pas de compte (HA n'a pas encore appelé `ha-init`)
- ⛔ **Intégration désactivée** : flag False

### Architecture du composant HA

```
custom_components/ridelog/
├── __init__.py         # Setup du coordinateur, refresh token
├── manifest.json       # Métadonnées (domain, version, requirements)
├── api.py              # Client API RideLog (httpx)
├── config_flow.py      # Flux de configuration HA (UI setup)
├── const.py            # Constantes (domain, platforms, clés config)
├── sensor.py           # Entités capteur (3 types)
├── services.py         # Services HA (check_reminders, refresh)
└── strings.json        # Strings UI
```

### Installation

1. Copier `ha-integration/custom_components/ridelog/` dans `~/.homeassistant/custom_components/`
2. Redémarrer Home Assistant
3. Aller dans Paramètres → Appareils & Services → Ajouter une intégration → "RideLog"
4. Saisir l'URL de l'API (`http://IP:8000`)

### Capteurs créés (par véhicule)

| Entité | State | Attributs |
|--------|-------|-----------|
| `sensor.ridelog_{nom}_summary` | Kilométrage actuel | name, brand, model, year, type, motorization |
| `sensor.ridelog_{nom}_upcoming` | Nombre maintenances à venir | Liste détaillée des maintenances |
| `sensor.ridelog_{nom}_overdue` | Nombre maintenances en retard | Liste détaillée des retards |

### Coordinateur de données

- `RideLogDataUpdateCoordinator` : polling toutes les `DEFAULT_SCAN_INTERVAL` secondes (3600 par défaut)
- Rafraîchit le token JWT automatiquement si proches de l'expiration (seuil 7 jours)
- Appelle `/api/vehicles` puis `/api/vehicles/{id}/upcoming` pour chaque véhicule

### Services HA

- `ridelog.check_reminders` : force une vérification immédiate des rappels
- `ridelog.refresh_vehicles` : rafraîchit manuellement la liste des véhicules

### Cartes Lovelace

L'endpoint `/api/vehicles/{vid}/ha-dashboard-card` génère du YAML prêt à copier (carte Mushroom). Le générateur est accessible dans l'UI RideLog sous l'onglet "🎨 Carte Lovelace". Dépendances HACS requises : `mushroom` et `card-mod`.

### Pour modifier

- **Ajouter un capteur** : `sensor.py` → créer une classe héritant de `CoordinatorEntity` + `SensorEntity`
- **Modifier l'intervalle de polling** : `const.py` → `DEFAULT_SCAN_INTERVAL`
- **Ajouter un service** : `services.py` + enregistrer dans `__init__.py`
- **Modifier le flux de config** : `config_flow.py`

---

## 11. Intégration Discord

### Fichiers concernés
- `backend/routes/webhooks.py` → `send_webhook_notification()` — Envoi
- `frontend/src/components/integrations/DiscordIntegration.jsx` — UI configuration
- `frontend/src/components/integrations/IntegrationsSettings.jsx` — Page container

### Fonctionnement

1. L'utilisateur crée un webhook Discord dans les paramètres de son serveur Discord
2. Il colle l'URL dans RideLog (Paramètres → Intégrations → Discord)
3. Le scheduler envoie des embeds Discord colorés selon le tier de rappel
4. L'utilisateur peut tester l'envoi depuis l'interface

---

## 12. Frontend — Structure et fichiers

```
frontend/src/
├── App.jsx                     # Racine — navigation état, auth, thème, mobile nav
├── index.css                   # Variables CSS, classes utilitaires, thème clair/sombre
├── main.jsx                    # Point d'entrée React
├── lib/
│   ├── api.js                       # Client Axios — toutes les méthodes API
│   ├── interventionTranslations.js  # Traductions noms d'interventions (anglais → français)
│   └── revisionChecklist.js         # ★ Logique partagée checklist révision (items, sous-items, helpers) ★
├── pages/
│   ├── AuthPage.jsx            # Login / Register
│   ├── VehicleList.jsx         # Liste véhicules (grille)
│   ├── VehicleDetail.jsx       # Détail véhicule (onglets + KPI cards)
│   ├── Dashboard.jsx           # Dashboard global (graphiques mensuel + annuel)
│   ├── Planning.jsx            # Planning calendrier global
│   ├── Settings.jsx            # Paramètres (Discord, HA, Rappels, Mode inscription)
│   └── Admin.jsx               # Administration (users, invitations)
└── components/
    ├── VehicleCard.jsx              # Carte véhicule (React.memo)
    ├── VehiclePhoto.jsx             # ★ Photo véhicule — charge le binaire via Axios (JWT) et l'affiche en object URL ★
    ├── VehicleForm.jsx              # Formulaire création/édition véhicule
    ├── MaintenanceForm.jsx          # Formulaire enregistrement maintenance — ouvre RevisionChecklistModal à la sélection du type
    ├── MaintenanceHistory.jsx       # Historique maintenances (mobile + desktop) + édition du détail de révision via modal
    ├── UpcomingMaintenance.jsx      # Maintenances "À venir" + IntervalEditModal
    ├── RevisionChecklistModal.jsx   # ★ Checklist de révision (voitures + motos) et sous-cases freins/pneus ★
    ├── FuelTracking.jsx             # Suivi carburant complet
    ├── FuelStations.jsx             # Recherche stations essence
    ├── APIDocumentation.jsx         # Documentation API intégrée (Swagger-like)
    ├── RepairHotspotModel.jsx       # Visualisation des points chauds réparations
    └── integrations/
        ├── DiscordIntegration.jsx       # Config webhook Discord
        ├── HomeAssistantIntegration.jsx # Gestion intégration HA (enable/disable/setup)
        └── IntegrationsSettings.jsx     # Page intégrations (tabs container)
```

### Navigation

L'application n'utilise **pas** React Router. La navigation est gérée par un état `currentPage` dans `App.jsx` :
- `vehicles` → `VehicleList`
- `vehicle-detail` → `VehicleDetail`
- `dashboard` → `Dashboard`
- `planning` → `Planning`
- `settings` → `Settings`
- `admin` → `Admin`
- `fuel-stations` → `FuelStations`

### Mobile

- Header compact avec thème toggle intégré
- Navigation bas de page fixe (`fixed bottom-0`), scrollable horizontalement
- `pb-16 sm:pb-0` sur le conteneur principal
- Bouton retour natif via `replaceState` + listener `popstate`
- Tous les tableaux desktop ont une version cartes mobile (`hidden sm:block` / `sm:hidden`)

### Thème

- Mode clair/sombre basculable depuis le header
- Persisté dans `localStorage`
- Variables CSS dans `index.css` :
  - `--bg`, `--bg-surface`, `--bg-base` : fonds
  - `--text-1`, `--text-2`, `--text-3` : textes (décroissant en importance)
  - `--accent` : couleur principale (bleu)
  - `--border` : bordures
  - `--success`, `--warning`, `--danger` : alertes
  - `--success-light`, `--warning-light`, `--accent-light` : versions pastel

### Client API (`lib/api.js`)

- Client Axios avec baseURL configurable (`VITE_API_URL` ou `/api`)
- Intercepteur request : ajoute `Authorization: Bearer <token>`
- Intercepteur response : gère les 401 (token expiré → suppression localStorage + event `tokenExpired`)
- Timeout global : 15 secondes
- Méthodes HA : `getHaIntegrationStatus`, `enableHaIntegration`, `disableHaIntegration`
- Méthodes overrides : `getIntervalOverrides`, `upsertIntervalOverride`, `deleteIntervalOverride`
- `downloadFile()` : téléchargement blob avec `revokeObjectURL` après usage

### `VehicleDetail.jsx` — données chargées au montage

```js
// Toutes ces requêtes sont lancées en parallèle (Promise.all)
api.getVehicle(vehicleId),
api.getUpcoming(vehicleId),
api.getRecommendations(vehicleId),
api.getCostForecast(vehicleId),
api.getVehicleEstimate(vehicleId),
api.getMaintenanceRecap(vehicleId),  // ← chargé d'emblée pour les KPI cards
```

> **Important** : le récap est chargé au montage pour alimenter les KPI cards (total dépensé, kilométrage moyen) sans que l'utilisateur ait à cliquer sur l'onglet "Récapitulatif".

### Props requises sur `UpcomingMaintenance`

```jsx
<UpcomingMaintenance
  data={{ ...upcoming, vehicle_type: vehicle.vehicle_type }}
  vehicleId={vehicleId}    // ← requis pour les overrides
  onRefresh={fetchData}    // ← requis pour rafraîchir après sauvegarde
/>
```

### Configuration build

- **Vite** (`vite.config.js`) : proxy dev `/api` → `http://backend:8000`
- **Nginx** (`nginx.conf`) : proxy prod `/api` → `http://backend:8000`, SPA fallback, headers sécurité
- **Tailwind** (`tailwind.config.js`) : scan `./src/**/*.{js,jsx}`

---

## 13. Base de données

### Moteur : SQLite

- Fichier : `/data/ridelog.db`
- Monté en volume Docker : `./data:/data`
- Single writer (1 worker uvicorn) — pas de problème de concurrence

### Tables

| Table | Clés | Description |
|-------|------|-------------|
| `users` | id, username (unique) | Comptes utilisateurs (is_admin, is_integration_account) |
| `vehicles` | id, user_id (FK) | Véhicules du parc |
| `maintenances` | id, vehicle_id (FK), intervention_key | Historique d'entretien. `intervention_key` fait foi pour les calculs ; `intervention_type` n'est qu'un libellé d'affichage (voir §20) |
| `maintenance_invoices` | id, maintenance_id (FK) | Factures jointes |
| `fuel_logs` | id, vehicle_id (FK) | Pleins de carburant |
| `webhooks` | id, user_id (FK) | Webhooks Discord configurés |
| `notification_logs` | id, vehicle_id (FK) | Log des notifications envoyées (anti-doublon) |
| `invitations` | id, token (unique) | Tokens d'invitation |
| `vehicle_estimates` | id, brand, model | Estimations de valeur résiduelle |
| `vehicle_maintenance_overrides` | id, vehicle_id (FK), intervention_key | Surcharges d'intervalles par véhicule |

### `vehicle_maintenance_overrides` — détail

| Colonne | Type | Description |
|---------|------|-------------|
| `vehicle_id` | FK | Véhicule concerné |
| `intervention_key` | string | Clé technique ex: `fork_service`, `brake_fluid` |
| `km_interval` | int\|null | Intervalle km personnalisé |
| `months_interval` | int\|null | Intervalle mois personnalisé |
| `is_km_disabled` | bool | `True` = critère km explicitement désactivé |
| `is_months_disabled` | bool | `True` = critère temps explicitement désactivé |

La combinaison `(vehicle_id, intervention_key)` est unique — un seul override par intervention par véhicule.

### Migrations — `backend/migrations.py`

**Pas d'Alembic** : les migrations sont écrites à la main, mais versionnées et enregistrées en base. `init_db()` ne fait plus que déléguer à `run_migrations()`.

#### Ce que le système garantit

| Garantie | Mécanisme |
|---|---|
| La base sait où elle en est | Table `schema_migrations` — une ligne par migration appliquée |
| Une migration n'est jamais rejouée | Registre + prédicat d'adoption |
| Une migration rejouée serait sans effet | Chaque opération vérifie l'état réel (`add_column_if_missing`) — ceinture **et** bretelles |
| Un échec n'abîme rien | Une transaction par migration ; échec → annulation + `RuntimeError`, le backend refuse de démarrer |
| On peut revenir en arrière | Sauvegarde dans `/data/backups` avant toute migration (`DB_BACKUP_KEEP`, 5 par défaut) |
| Un retour à une image plus ancienne est bloqué | Migration inconnue dans le registre → refus de démarrer |
| Base neuve et base migrée sont identiques | `schema_fingerprint()` + test de parité en CI |

#### Les trois cas au démarrage

```
base vide          → create_all(), puis estampillage de toutes les migrations sans les exécuter
base sans registre → adoption : détection de l'existant, estampillage, application du reste
base avec registre → application de ce qui manque
```

L'**adoption** est le seul endroit où subsiste l'ancienne heuristique d'inspection du schéma. Elle ne s'exécute qu'une fois par base, jamais plus.

#### Le DDL SQLite n'est transactionnel que si on le force

Le pilote `sqlite3` de Python n'ouvre une transaction implicite que devant du DML, **jamais devant du DDL** : un `ALTER TABLE` s'exécute en autocommit et le `with engine.begin()` qui l'entoure ne protège rien. `_make_transactional_engine()` crée donc un moteur **jetable**, dédié aux migrations, où le `BEGIN` est émis explicitement. Le moteur applicatif n'est pas modifié.

#### Ajouter une migration

1. Ajouter une entrée **à la fin** de `MIGRATIONS`, avec le numéro suivant.
2. Le prédicat `already_applied` doit exiger **toutes** les colonnes que la migration ajoute (`has_all_columns`), jamais un échantillon — sinon une migration à demi appliquée est estampillée « faite » et ses colonnes manquantes ne sont jamais créées. Cet état existe dans l'historique du dépôt (`password_changed_at` ajouté dans un commit, les deux autres dans le suivant).
3. **Ne jamais modifier ni réordonner une migration publiée.** C'est la seule règle qui garantit qu'une base neuve et une base migrée convergent.
4. Une table entièrement nouvelle ne demande **pas** de migration : `create_all()` la crée à partir du modèle, une déclaration ne pouvant pas diverger d'elle-même.

#### Divergences réelles trouvées en écrivant ce système

Le test de parité les a révélées immédiatement — elles préexistaient toutes :

1. **Trois colonnes mortes** — l'ancien `init_db` ajoutait `invoice_filename`, `invoice_path` et `invoice_mime_type` à `maintenances` alors que le modèle ne les déclare plus (les factures vivent dans `maintenance_invoices`). Constaté sur une instance en service. Migration 006 les retire, après avoir reversé dans `maintenance_invoices` toute facture encore décrite par elles.
2. **La reconstruction de `fuel_logs` cassait le schéma** — elle recréait la table avec `created_at NOT NULL` (le modèle le veut nullable) et, `DROP TABLE` ayant emporté les index, ne recréait ni `ix_fuel_logs_id` ni `ix_fuel_logs_vehicle_id`. Toute base passée par ce chemin restait sans index sur `vehicle_id`.
3. **Le rollback n'existait pas** — voir le DDL SQLite ci-dessus. La promesse « une migration échouée est annulée » était fausse.

### Pour modifier

- **Ajouter une colonne** : `models.py` (modèle) + `migrations.py` (nouvelle entrée dans `MIGRATIONS`)
- **Ajouter une table** : `models.py` → créer le modèle. `create_all()` s'en charge, aucune migration nécessaire.
- **Restaurer une sauvegarde** : arrêter le backend, remplacer `data/ridelog.db` par le fichier voulu dans `data/backups/`, redémarrer.

---

## 14. Guides de modification

### Ajouter un nouveau type de véhicule (ex: "camion")

1. `models.py` : Pas de modification (le champ `vehicle_type` est un string libre)
2. `schemas.py` : Ajouter `"camion"` au pattern regex de `vehicle_type`
3. `maintenance_intervals.json` : Ajouter une section `"truck": {...}` avec les intervalles
4. `maintenance_calculator.py` : Adapter `get_intervals_for_vehicle()` pour le nouveau type
5. `VehicleForm.jsx` : Ajouter l'option dans le sélecteur de type
6. `MaintenanceForm.jsx` : Ajouter une liste `STATIC_MAINTENANCE_TYPES.truck`

### Ajouter un nouveau webhook type

1. `routes/webhooks.py` : Ajouter la logique de formatage dans `send_webhook_notification()`
2. `frontend/src/components/integrations/` : Créer le composant d'intégration
3. `Settings.jsx` : Ajouter l'onglet

### Modifier le calcul des échéances

- **Intervalle km** : `maintenance_calculator.py` → `calculate_maintenance_status()`
  - Formule : `next_due_mileage = last_mileage + km_interval`
- **Intervalle mois** : même fonction
  - Formule : `next_due_date = last_date + relativedelta(months=months_interval)`
- **Seuils d'alerte** :
  - Urgent : ≤ 300 km ou ≤ 7 jours
  - Warning : ≤ 1500 km ou ≤ 90 jours
- **Anti-drift km** : `next_due_mileage` arrondi au multiple de `km_interval` le plus proche

### Ajouter un champ à l'export ZIP

- `routes/exports.py` → endpoint `recap/download`
- Modifier la construction du CSV et/ou ajouter des fichiers au ZIP

### Modifier les templates de cartes HA

- `ha-integration/templates/` : fichiers YAML de templates
- `routes/exports.py` → `ha-dashboard-card` : génération dynamique

---

## 15. Checklist de révision (voitures et motos)

### Vue d'ensemble

Deux types d'interventions déclenchent un popup de détail au moment de la **sélection** dans le menu déroulant du formulaire (avant même de remplir le reste) :

- **Révision complète** (`REVISION_TRIGGERS`) : "Révision périodique (km)" et "Entretien annuel" — ouvre la checklist groupée par catégorie (Moteur, Filtration, Liquides, Freinage, Pneumatiques, Électrique/Électronique), différente pour voiture et moto.
- **Freins/pneus seuls** (`SUBITEM_TRIGGERS`) : "Remplacement freins" et "Remplacement pneus" — ouvre uniquement les sous-cases avant/arrière correspondantes.

Contrairement à l'ancienne version (moto uniquement, un enregistrement BDD par item coché), **tous les items cochés sont regroupés en un seul enregistrement de maintenance**, stocké dans le champ `sub_interventions` (JSON) de la table `maintenances`. L'historique affiche ces sous-interventions sous forme de badges.

### Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `frontend/src/lib/revisionChecklist.js` | ★ Logique partagée : items de révision (voiture/moto), sous-items freins/pneus, helpers de construction/reconstruction de la sélection ★ |
| `frontend/src/components/RevisionChecklistModal.jsx` | ★ Composant popup — affiche soit la checklist complète, soit les sous-cases freins/pneus seules ★ |
| `frontend/src/components/MaintenanceForm.jsx` | Ouvre le modal à la sélection du type dans le menu déroulant |
| `frontend/src/components/MaintenanceHistory.jsx` | Réouvre le modal en mode édition, pré-rempli depuis `sub_interventions` déjà enregistrées |
| `backend/models.py` → `Maintenance.sub_interventions` | Colonne JSON stockant `[{key, name}, ...]` |
| `backend/maintenance_calculator.py` → `build_last_maintenances_dict()` | Prend en compte les sous-interventions pour le calcul des prochaines échéances (moteur, freins, pneus comptent individuellement même groupés dans un seul enregistrement) |
| `backend/reminder_scheduler.py` → `clear_notification_logs_for()` | Efface aussi les logs de rappel pour chaque sous-intervention |


### Flux complet (création)

```
1. Utilisateur sélectionne "Entretien annuel" (ou "Révision périodique (km)",
   "Remplacement freins", "Remplacement pneus") dans le menu déroulant
2. RevisionChecklistModal s'ouvre immédiatement (avant le remplissage du reste du formulaire)
   - Révision complète : items pré-cochés par défaut + items "en retard" (via upcomingMaintenances)
   - Freins/pneus seuls : rien de pré-coché, l'utilisateur choisit avant/arrière
3. Utilisateur valide → la sélection est stockée en mémoire dans le formulaire
   (résumé affiché + bouton "Modifier le détail" pour rouvrir le popup)
4. Utilisateur remplit date / kilométrage / coût / notes / factures normalement
5. Clic sur "Enregistrer l'intervention" → UN SEUL POST /api/vehicles/{vid}/maintenances
   avec sub_interventions = [{key, name}, ...] en JSON
6. Backend stocke le tout dans un seul enregistrement Maintenance
7. MaintenanceHistory affiche les sous-interventions sous forme de badges
```

### Flux d'édition (depuis l'historique)

```
1. Clic sur "✏️ Modifier" sur un enregistrement de type révision/freins/pneus
2. Bouton "📋 Modifier le détail" dans le formulaire d'édition
3. RevisionChecklistModal s'ouvre, pré-rempli via buildCheckedFromSubInterventions()
   à partir des sub_interventions déjà enregistrées
4. Validation → PUT /api/vehicles/{vid}/maintenances/{mid} avec les nouvelles sub_interventions
```

### Types déclenchants (`CHECKLIST_TRIGGERS` dans `MaintenanceForm.jsx`)

```jsx
const CHECKLIST_TRIGGERS = [
  'Révision périodique (km)',
  'Entretien annuel',
];
```

La checklist ne se déclenche que pour `vehicleType === 'motorcycle'`.


### Items pré-cochés par défaut (révision complète uniquement)

| Véhicule | Items par défaut |
|----------|-------------------|
| Voiture | Vidange + filtre à huile, Filtre à air, Filtre d'habitacle |
| Moto | Vidange d'huile + filtre à huile |

> Le filtre à gasoil/essence n'est **pas** pré-coché par défaut (changé moins fréquemment qu'à chaque révision annuelle).

Les autres items sont pré-cochés automatiquement s'ils sont en retard ou urgents d'après `GET /upcoming` (statuts `overdue`/`urgent`).

### Items proposés — voiture (`REVISION_ITEMS_CAR`)

| Groupe | Items |
|--------|-------|
| 🔧 Moteur | Vidange + filtre à huile *(pré-coché)*, Filtre à air *(pré-coché)*, Bougies d'allumage |
| 🌬️ Filtration | Filtre d'habitacle *(pré-coché)*, Filtre à gasoil (diesel), Filtre à essence (essence/hybride) |
| 💧 Liquides | Purge de frein, Liquide de refroidissement, Liquide de transmission |
| 🛑 Freinage | Remplacement freins → sous-cases : Plaquettes avant / arrière, Disques avant / arrière |
| 🚗 Pneumatiques | Remplacement pneus → sous-cases : Pneus avant / arrière |
| ⚡ Électrique | Batterie |

### Items proposés — moto (`REVISION_ITEMS_MOTO`)

| Groupe | Items |
|--------|-------|
| 🔧 Moteur | Vidange d'huile + filtre *(pré-coché)*, Bougie d'allumage, Filtre à air, Jeu aux soupapes |
| ⛓️ Transmission | Kit chaîne, Tension et lubrification chaîne |
| 🛑 Freinage | Remplacement freins → sous-cases : Plaquettes avant / arrière, Disques avant / arrière |
| 🔩 Suspension | Révision fourche, Roulements de roue, Roulements de direction |
| 💧 Liquides | Liquide de frein, Liquide de refroidissement |
| 🏍️ Pneumatiques | Remplacement pneus → sous-cases : Pneus avant / arrière |
| ⚡ Électronique | Batterie, Nettoyage carburateur, Synchro injection, Diagnostic électronique |

### Props de `RevisionChecklistModal`

| Prop | Type | Description |
|------|------|--------------|
| `vehicleType` | string | `'car'` \| `'motorcycle'` |
| `motorization` | string | Filtre les items voiture (diesel/essence) |
| `interventionType` | string | Type sélectionné — détermine si checklist complète ou freins/pneus seuls |
| `upcomingMaintenances` | Array | `GET /upcoming` — pré-cochage des items en retard (création uniquement) |
| `initialChecked` | Object\|null | État "checked" pré-rempli (mode édition ou réouverture après première validation) |
| `onClose` | Function | Annulation |
| `onConfirm` | Function | `(selectedSubInterventions: Array<{key,name}>) => void` |

### Intégration dans `VehicleDetail.jsx`

```jsx
<MaintenanceForm
  vehicleId={vehicleId}
  vehicleType={vehicle.vehicle_type}
  displacement={vehicle.displacement}
  rangeCategory={vehicle.range_category}
  upcomingMaintenances={upcoming?.upcoming || []}
  onSubmit={handleMaintenanceCreated}
  onCancel={() => setShowMaintenanceForm(false)}
/>
```

### Style et thème

`RevisionChecklistModal.jsx` utilise exclusivement les variables CSS RideLog (`var(--bg)`, `var(--accent)`, `var(--border)`, `var(--text-1/2/3)`, `var(--danger)`, `var(--warning)`) et les classes `btn btn-primary`, `btn btn-secondary`, `card`.

### Pour modifier

- **Ajouter un item** : `RevisionChecklistModal.jsx` → `RECORDABLE_LABELS` + ajouter la clé dans le bon groupe de `ITEM_GROUPS`
- **Changer les items pré-cochés** : `RevisionChecklistModal.jsx` → constante `ALWAYS_CHECKED`
- **Déclencher sur un autre type** : `MaintenanceForm.jsx` → constante `CHECKLIST_TRIGGERS`

---

## 16. Surcharges d'intervalles par véhicule

### Vue d'ensemble

Chaque véhicule peut avoir des intervalles de maintenance personnalisés qui priment sur les valeurs globales du JSON. Par exemple, si la révision de fourche est à 40 000 km par défaut mais que le propriétaire préfère la faire à 20 000 km, il peut fixer cette valeur pour son véhicule uniquement. La modification est persistée en BDD et reste active indéfiniment.

Il est également possible de **désactiver** un critère individuellement : par exemple garder uniquement le critère km sans critère temps, ou l'inverse.

### Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `backend/models.py` → `VehicleMaintenanceOverride` | Modèle BDD de la surcharge |
| `backend/schemas.py` → `IntervalOverrideUpdate` | Validation du body PUT |
| `backend/routes/maintenances.py` | 3 endpoints + helpers `_load_overrides()` / `_apply_overrides()` |
| `backend/maintenance_calculator.py` | Paramètre `overrides` dans `get_all_upcoming_maintenances()` |
| `backend/routes/dashboard.py` | Charge et applique les overrides pour les stats du dashboard |
| `frontend/src/components/UpcomingMaintenance.jsx` | Bouton ✏️ + modale `IntervalEditModal` |
| `frontend/src/lib/api.js` | 3 méthodes : `getIntervalOverrides`, `upsertIntervalOverride`, `deleteIntervalOverride` |

### Flux utilisateur

```
1. Dans l'onglet "À venir", chaque carte a un bouton ✏️
2. Clic → IntervalEditModal s'ouvre avec les valeurs actuelles
3. Utilisateur modifie km_interval et/ou months_interval
   → Peut désactiver un critère via checkbox "Désactivé"
4. Sur "Enregistrer" : PUT /api/vehicles/{vid}/interval-overrides/{key}
5. Modale se ferme → onRefresh() → GET /upcoming recharge avec les nouvelles valeurs
6. Badge "✏️ Personnalisé" apparaît sur la carte concernée
7. Sur "Réinitialiser par défaut" : DELETE /api/vehicles/{vid}/interval-overrides/{key}
   → Revient aux valeurs du JSON global
```

### Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/vehicles/{vid}/interval-overrides` | Lister tous les overrides du véhicule |
| PUT | `/api/vehicles/{vid}/interval-overrides/{key}` | Créer ou mettre à jour un override (upsert) |
| DELETE | `/api/vehicles/{vid}/interval-overrides/{key}` | Supprimer → retour aux valeurs par défaut |

### Body du PUT (`IntervalOverrideUpdate`)

```json
{
  "km_interval": 20000,
  "months_interval": null,
  "is_km_disabled": false,
  "is_months_disabled": true
}
```

| Champ | Description |
|-------|-------------|
| `km_interval` | Nouvelle valeur km (null = conserver la valeur JSON si non désactivé) |
| `months_interval` | Nouvelle valeur mois (null = conserver la valeur JSON si non désactivé) |
| `is_km_disabled` | `true` = supprimer le critère km pour ce véhicule |
| `is_months_disabled` | `true` = supprimer le critère temps pour ce véhicule |

### Logique d'application dans le calculateur

Dans `get_all_upcoming_maintenances()`, les overrides sont appliqués après `get_intervals_for_vehicle()` :

```python
if overrides:
    for key, override in overrides.items():
        if key not in intervals:
            continue
        entry = dict(intervals[key])
        if override.is_km_disabled:
            entry["km_interval"] = None
        elif override.km_interval is not None:
            entry["km_interval"] = override.km_interval
        if override.is_months_disabled:
            entry["months_interval"] = None
        elif override.months_interval is not None:
            entry["months_interval"] = override.months_interval
        entry["has_override"] = True
        intervals[key] = entry
```

### Chargement des overrides

**Dans `_compute_upcoming()` (maintenances.py)** — par véhicule :
```python
overrides = _load_overrides(vehicle.id, db)  # dict {key: override_row}
upcoming = calculator.get_all_upcoming_maintenances(..., overrides=overrides)
```

**Dans `dashboard.py`** — optimisé : une seule requête pour tous les véhicules :
```python
all_overrides = db.query(VehicleMaintenanceOverride).filter(
    VehicleMaintenanceOverride.vehicle_id.in_(vehicle_ids)
).all()
overrides_by_vehicle = {}
for o in all_overrides:
    overrides_by_vehicle.setdefault(o.vehicle_id, {})[o.intervention_key] = o
```

### UI — `UpcomingMaintenance.jsx`

- Bouton ✏️ sur chaque carte (masqué pour le contrôle technique)
- Badge **"✏️ Personnalisé"** en accent si `item.has_override === true`
- `IntervalEditModal` (composant interne) : deux champs input + checkbox "Désactivé" pour chaque critère
- Validation : impossible de désactiver les deux critères simultanément (bouton Enregistrer désactivé)

### Pour modifier

- **Ajouter une contrainte de validation** : `schemas.py` → `IntervalOverrideUpdate`
- **Étendre au scheduler** : `reminder_scheduler.py` → charger les overrides du véhicule et les passer à `get_all_upcoming_maintenances()`

---

## 17. KPI cards VehicleDetail

### Vue d'ensemble

La page `VehicleDetail.jsx` affiche 5 cards KPI uniformes au-dessus des onglets. Toutes utilisent le composant interne `KpiCard` défini localement (dans le même fichier, pas un composant séparé importé).

### Structure `KpiCard`

```jsx
const KpiCard = ({ label, value, valueColor = 'var(--text-1)', sub = null }) => (
  <div className="card p-3 text-center"
       style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', minHeight: '90px' }}>
    <div className="card-label" style={{ marginBottom: '6px' }}>{label}</div>
    <div style={{ fontSize: '22px', fontWeight: 700, lineHeight: 1.2, color: valueColor }}>
      {value}
    </div>
    {sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: '4px' }}>
      {sub}
    </div>}
  </div>
);
```

Toutes les cards ont le même `fontSize: 22px`, `fontWeight: 700` et `minHeight: 90px` — uniformité garantie.

### Les 5 cards

| Card | Source de données | Valeur | Couleur | Sous-label |
|------|-------------------|--------|---------|------------|
| **État** | `upcoming.upcoming` → statuts | Icône emoji | danger/warning/orange/success | Label texte (ex: "À jour") |
| **En retard** | `upcoming.upcoming.filter(status === 'overdue').length` | Nombre | danger si > 0, success si 0 | "aucun" ou "intervention(s)" |
| **Prochaine** | `upcoming.upcoming.find(days_remaining != null)` | Délai en jours | danger (≤0j), warning (≤7j), text-1 | Nom tronqué de l'intervention |
| **Total dépensé** | `recap.total_cost` | Montant € | accent | — |
| **Moy. km/an** | Calculé depuis `recap.maintenances` | km/an | text-1 | "estimation" si < 6 mois de données |

### Logique état général

```js
const { icon, label, color } = overdue > 0
  ? { icon: '🔴', label: 'En retard',    color: 'var(--danger)' }
  : urgent > 0
  ? { icon: '🟠', label: 'Urgent',       color: 'var(--warning)' }
  : warning > 0
  ? { icon: '🟡', label: 'À surveiller', color: '#f59e0b' }
  : { icon: '✅', label: 'À jour',        color: 'var(--success)' };
```

### Bouton "+ Intervention"

Sorti des KPI cards, placé en `flex justify-end` juste au-dessus de la grille des cards. Plus logique visuellement car ce n'est pas une stat mais une action.

---

## 18. Kilométrage moyen annuel

### Vue d'ensemble

Stat affichée dans les KPI cards de `VehicleDetail.jsx`. Calculée côté frontend depuis l'historique des maintenances (déjà chargé via `recap`).

### Calcul (`React.useMemo` dans `VehicleDetail.jsx`)

```js
const avgKmPerYear = React.useMemo(() => {
  if (!recap?.maintenances?.length) return null;

  // Points (date, km) avec km > 0, triés par date
  const points = recap.maintenances
    .filter(m => m.mileage_at_intervention > 0)
    .map(m => ({ date: new Date(m.execution_date), km: m.mileage_at_intervention }))
    .sort((a, b) => a.date - b.date);

  if (points.length < 2) return null;

  const maxKm = Math.max(...points.map(p => p.km));
  const minKm = points[0].km;
  const yearsElapsed = (last.date - first.date) / (1000 * 60 * 60 * 24 * 365.25);

  if (yearsElapsed < 0.08) return { value: null, estimated: false }; // < 1 mois

  const avg = Math.round((maxKm - minKm) / yearsElapsed);
  const estimated = yearsElapsed < 0.5; // < 6 mois → estimation
  return { value: avg, estimated };
}, [recap]);
```

### Affichage

- **`value`** présent + `estimated: false` → valeur seule (données fiables, ≥ 6 mois)
- **`value`** présent + `estimated: true` → valeur + sous-label "estimation" (1-6 mois)
- **`value: null`** → `—` (moins d'un mois de données ou pas de récap)

### Règle critique des hooks React

> ⚠️ **Ce `useMemo` DOIT être déclaré avant les early returns du composant.**

`VehicleDetail.jsx` a deux early returns (`if (error)` et `if (loading || !vehicle)`). La règle des hooks React (#310) interdit tout hook après un `return` conditionnel. L'ordre correct est :

```jsx
// ✅ CORRECT — hooks AVANT les early returns
const avgKmPerYear = React.useMemo(() => { ... }, [recap]);

if (error) { return <ErrorView />; }
if (loading || !vehicle) { return <LoadingView />; }

// suite du composant...
```

Si cette règle est violée, React lève l'erreur `Minified React error #310` en production.

---

## 19. Tests backend

### Vue d'ensemble

Suite `pytest` dans `backend/tests/`, ajoutée pour couvrir la logique la plus critique et la plus exposée aux régressions silencieuses. Tourne uniquement en CI (`.github/workflows/pytest.yml`) et en local à la demande — jamais sur l'instance d'un utilisateur self-hosted, et `requirements-dev.txt` n'est jamais installé dans l'image Docker de production.

### Lancer les tests

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest tests/ -v
```

### Fichiers

| Fichier | Couvre |
|---|---|
| `test_maintenance_calculator.py` | `maintenance_calculator.py` — intervalles dynamiques moto, anti-drift, statuts, contrôle technique, filtrage motorisation, overrides. Aucune dépendance DB/HTTP. |
| `test_login_rate_limiter.py` | `LoginRateLimiter` (`security.py`) — paliers 3/6/9/12+, reset après succès, isolation par IP. Aucune dépendance DB/HTTP. |
| `test_client_ip.py` | `get_client_ip()`, les deux limiteurs et `validate_jwt_secret()` (`security.py`) — verrouille les deux contournements corrigés du rate limiter (`X-Forwarded-For` falsifié, et passerelle Docker prise pour un proxy de confiance sur le port 8000 — voir §4), le verrouillage par compte, et le refus de démarrer sur un `JWT_SECRET` public. |
| `test_migrations.py` | `migrations.py` — parité de schéma entre base neuve et base migrée, survie des données, idempotence, adoption d'une base sans registre, migration à demi appliquée, rollback, garde anti-retour-arrière, sauvegardes. Tourne sur **deux schémas anciens réels** figés dans `tests/fixtures/*.sql` (le commit initial du dépôt et une instance antérieure au dépôt), jamais sur un schéma écrit de mémoire. |
| `test_fuel_stations.py` | Routes `/fuel-stations/*` — authentification exigée sur les trois endpoints, bornes de `max_distance`/`limit`, cache (clé insensible aux accents, plafond, expiration). Les appels sortants sont monkeypatchés : aucun test ne sort sur le réseau. |
| `test_regions_fr.py` | `regions/fr.py` — normalisation de plaque, analyse de la réponse carte grise (détection moto par genre, replis de cylindrée, priorité du genre sur l'indication utilisateur), repli du registre sur `FR`. Aucun appel réseau : cette logique n'était auparavant atteignable que via un service tiers payant, donc jamais testée. |
| `test_maintenance_routes.py` | Enregistrement d'un entretien via `TestClient` — la clé technique est stockée, deux libellés d'une même intervention partagent une clé, un libellé inconnu n'échoue pas, et l'entretien enregistré ressort bien rattaché à son échéance. |
| `test_auth_integration.py` | Routes `/auth/*` et `/admin/users/*` via `TestClient` sur une DB SQLite temporaire — register/login, changement de mot de passe, reset admin, mot de passe temporaire (`must_change_password`), demande de reset anti-énumération, et non-énumération des identifiants à l'inscription (voir §4). |

### `conftest.py` — points importants

- **`DATABASE_URL` est fixé sur un fichier SQLite temporaire AVANT tout import du code applicatif** (en tête de fichier, avant même `import pytest`). `models.py` crée son moteur SQLAlchemy au moment de son propre import, sur la valeur de `DATABASE_URL` à cet instant précis — le fixer plus tard ne servirait à rien.
- **Base vierge à chaque test** (`clean_db`, autouse) — `drop_all()` + `create_all()` avant chaque test, isolation totale.
- **États globaux module-level à réinitialiser explicitement** — `login_limiter` / `account_limiter` (`security.py`), `_ha_integration_enabled` / `_password_reset_enabled` (`routes/auth.py`) et `REGISTRATION_MODE` (`config.py`) sont des valeurs module-level fixées une fois à l'import. `clean_db` ne les touche pas (ce ne sont pas des colonnes DB) : sans fixtures dédiées (`clean_login_limiter`, `reset_module_level_flags`) pour les remettre à leur valeur par défaut avant/après chaque test, un test qui déclenche un verrouillage ou désactive une fonctionnalité pollue silencieusement tous les tests suivants de la session. C'est une source réelle de faux échecs rencontrée en écrivant cette suite — à garder en tête pour tout futur état global ajouté au projet.

### Bugs trouvés en écrivant cette suite (corrigés dans la foulée)

Ces trois bugs préexistaient dans le code, indépendamment des tests — ils ont juste été révélés en écrivant une couverture sérieuse de `maintenance_calculator.py` :

1. **`oil_change_moto` jamais suivi au kilométrage** — `get_intervals_for_vehicle()` comparait `key == "oil_change"` au lieu de `key == "oil_change_moto"` (la vraie clé JSON). La vidange moto n'était donc suivie qu'au temps (12 mois), jamais au km.
2. **Pas d'anti-drift sur `next_due_mileage`** — `calculate_maintenance_status()` faisait une simple addition (`last_mileage + km_interval`) sans arrondir au multiple le plus proche, contrairement à ce que documentait déjà cette section. Un entretien fait systématiquement en retard décalait l'échéance suivante d'autant, et ce décalage se cumulait cycle après cycle. Corrigé par un arrondi (`round(naive / km_interval) * km_interval`) qui recale toujours l'échéance sur un multiple propre.
3. **`never_recorded` toujours `False` pour les entretiens kilométriques** — dans `get_all_upcoming_maintenances()`, `last_mileage` était réécrit à `0` (nécessaire pour calculer une échéance sans historique) *avant* que le flag `never_recorded` soit calculé à partir de cette même variable — donc jamais `None` au moment du test, et le badge "Jamais enregistré" ne s'affichait quasiment jamais côté UI pour ce type d'entretien.

### Pour ajouter un test

- Logique pure (calculs, pas de DB/HTTP) → `test_maintenance_calculator.py` ou nouveau fichier du même style, utiliser directement `from maintenance_calculator import calculator`.
- Route API → `test_auth_integration.py` (ou nouveau fichier), utiliser la fixture `client` (déclenche le lifespan FastAPI sur la DB de test) et les helpers `register()` / `login()` / `auth_headers()` déjà définis en tête du fichier.
- Nouvel état global module-level (nouveau flag `_xxx_enabled` façon `_ha_integration_enabled`) → penser à l'ajouter à la fixture `reset_module_level_flags` dans `conftest.py`, sinon il fuira silencieusement entre tests comme documenté ci-dessus.

---

## 20. Préparation à l'internationalisation

> Rien n'est traduit à ce stade. Ce qui a été fait, c'est **retirer les deux
> obstacles** qui rendaient la traduction impossible sans casser les données
> existantes. L'ajout d'une langue reste un lot à part entière, côté front.

### 20.1 Deux problèmes distincts, souvent confondus

| | Nature | Traitement |
|---|---|---|
| **Langue** | Le texte affiché est en français | Se traduit |
| **Pays** | Format de plaque, calendrier du CT, communes, prix carburant | Ne se traduit pas — se **remplace** |

Les confondre est le piège : traduire l'interface en anglais ne rendra pas
l'application utilisable en Belgique, dont le contrôle technique et les plaques
suivent d'autres règles.

### 20.2 La clé technique fait foi (migration 007)

**Avant** : la base ne stockait que le libellé français affiché
(`intervention_type`), retraduit en clé technique à chaque calcul via
`INTERVENTION_TRANSLATIONS`. Deux conséquences bien réelles, indépendamment de
l'i18n :

- renommer un libellé **cassait silencieusement** tout l'historique enregistré.
  C'est la raison d'être du doublon `"Purge liquide de frein et embrayage"` /
  `"Remplacement liquide de frein"` — le symptôme, pas une exception ;
- un libellé absent du dictionnaire ne levait **aucune erreur** : l'entretien
  était enregistré puis ignoré dans « À venir », l'échéance disparaissait sans
  trace.

**Après** : `maintenances.intervention_key` porte la clé technique.
`resolve_intervention_key()` la lit en priorité et ne retombe sur la traduction
du libellé que si elle est absente — les lignes antérieures à la migration se
comportent donc exactement comme avant.

```python
# maintenance_calculator.py
key = resolve_intervention_key(maintenance)   # ✅
key = get_intervention_key(m.intervention_type)  # ❌ redérive depuis l'affichage
```

Même règle pour les sous-interventions de checklist, qui stockaient déjà leur
clé dans `{key, name}` sans qu'on la lise.

> **Le dictionnaire est recopié FIGÉ dans la migration 007**, jamais importé.
> Une migration est un artefact historique : importer le code vivant ferait
> changer le passé au premier renommage, et deux instances migrées à deux dates
> n'auraient pas les mêmes clés en base. `test_frozen_snapshot_still_agrees_with_the_live_dictionary`
> signale toute divergence entre l'instantané et le dictionnaire actuel.
>
> **Renommer une clé se fait donc par une migration de remappage**, pas en
> éditant l'instantané. C'est précisément ce que cette colonne rend possible.

### 20.3 Couture régionale (`backend/regions/`)

Le pays actif se lit dans `REGION` (défaut `FR`). Un code inconnu retombe sur
`FR` : une variable mal orthographiée ne doit pas rendre l'instance inutilisable.

```python
region = get_region()
normalized = region.normalize_plate(plate)          # "" si format invalide
parsed = region.parse_plate_response(payload, hint) # → champs véhicule RideLog
```

**Ajouter un pays** = ajouter `regions/xx.py` exposant `code`, `name`,
`plate_example`, `normalize_plate()` et `parse_plate_response()`, puis
l'inscrire dans `REGIONS`. Les tests de `test_regions_fr.py` se transposent tels
quels.

### 20.4 Ce qui reste franco-spécifique

Recensé dans le docstring de `regions/__init__.py`, **volontairement pas encore
déplacé** — abstraire sans second cas réel ne valide rien :

- `maintenance_calculator.calculate_inspection_technical_date()` — calendrier CT
- `routes/fuel_stations.py` — `communes.csv` et prix-carburants.gouv.fr
- `data/maintenance_intervals.json` — libellés français (clés désormais découplées)

### 20.5 Ce qu'il restera à faire pour traduire réellement

1. Un catalogue de libellés par langue, `INTERVENTION_TRANSLATIONS` devenant le
   catalogue `fr` — la base n'en dépend plus.
2. L'API renvoie la clé ; le front affiche le libellé de la langue choisie.
3. Traduction des chaînes du front (`frontend/src/lib/interventionTranslations.js`
   est le point de départ).
4. Messages d'erreur backend, aujourd'hui en français en dur dans les routes.

---

---

## 21. Distribution par images publiées

### 21.1 Le problème résolu

`python:3.11-slim` et `node:18-alpine` sont des **tags mobiles**, reconstruits
régulièrement en amont. Tant que chaque utilisateur construisait son image, deux
installations de la même version de RideLog différaient si elles avaient été
buildées à quelques semaines d'intervalle — et un bug n'apparaissant que chez
l'une était indiagnosticable, faute de savoir si l'écart venait du code ou du
socle.

Les images sont désormais construites **une fois**, en CI, et publiées. Tout le
monde exécute le même digest.

### 21.2 Les canaux

| Tag | Produit par | Reconstruit ? |
|---|---|---|
| `stable` | promotion manuelle | **non** — re-tag d'un digest existant |
| `latest` | chaque merge sur `main` | oui |
| `X.Y.Z` | **appel** de release-please | oui, une seule fois |
| `sha-xxxxxxx` | chaque merge sur `main` | non, même build que `latest` |

> ⚠️ **Ne jamais déclencher la publication sur `release: types: [published]`.**
> GitHub Actions refuse qu'un évènement produit avec le `GITHUB_TOKEN` en
> déclenche un autre — protection anti-boucle. release-please créant la Release
> avec ce jeton, l'évènement n'arrive jamais. Constaté en vrai : la v2.0.0 a été
> publiée sans qu'aucune image `2.0.0` ne soit construite. `release-please.yml`
> **appelle** donc `publish-images.yml` (`workflow_call`) au lieu de l'attendre.
> La même règle vaudra pour tout futur workflow branché sur une release.

> ⚠️ `docker pull` sans tag prend `latest`, donc le canal **non validé**. Choix
> assumé du projet : la documentation doit écrire `:stable` explicitement.

**La promotion ne reconstruit jamais.** `imagetools create` pose un tag
supplémentaire sur un manifeste déjà publié. Reconstruire donnerait une image
différente de celle qui a été testée — précisément le problème que tout ce
dispositif supprime.

Promouvoir : Actions → *Publier les images* → *Run workflow*, puis un tag
**source** déjà publié et un tag **cible** à poser (`2.0.0` → `stable`). La
source accepte aussi `latest`, ce qui dépanne quand aucune version n'a encore
d'image.

### 21.3 Le piège du développement

`docker-compose.yml` ne construit plus rien. **Vérifier une modification du code
exige la surcharge :**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Sans elle, on lance l'image publiée — la version précédente — en croyant tester
son changement. C'est aussi pourquoi `build-test.yml` porte cette surcharge :
une CI qui validerait l'image publiée serait verte sans rien vérifier.

Conséquence à connaître : un build de développement écrase l'image locale
`:stable`. Un `docker compose up -d` ultérieur réutilisera cette image locale
sans rien télécharger. `docker compose pull` rétablit l'image publiée.

### 21.4 Architectures

`linux/amd64` et `linux/arm64`, dans un même index de manifestes : un seul tag,
le client tire l'image de sa machine.

Mesuré sans cache : backend 15 s en amd64, 67 s en arm64 — aucune compilation,
`bcrypt` et `pydantic-core` publiant des wheels `aarch64`. Le frontend passe de
144 s à 17 s grâce à `--platform=$BUILDPLATFORM` sur son étage de build, qui
laisse `npm` tourner nativement puisqu'il produit du JavaScript, indifférent au
processeur.

> Une dépendance ajoutée sans wheel `aarch64` ferait échouer le build ARM. C'est
> le bon comportement : l'échec est visible en CI, pas chez les utilisateurs.

### 21.5 Retour arrière — image **et** base

Revenir à une image ancienne ne fait pas revenir la base. Le système de
migrations **refuse de démarrer** sur une base plus récente que le code (§13).
Un retour arrière complet suppose donc les deux :

```bash
RIDELOG_TAG=1.9.0        # dans .env
docker compose pull && docker compose up -d
# puis, si le schéma avait été migré entre-temps :
docker compose stop backend
cp ./data/backups/ridelog-<horodatage>.db ./data/ridelog.db
docker compose start backend
```

Un backend qui refuse de démarrer après un retour arrière n'est pas une panne,
c'est cette protection. À dire tel quel dans toute doc de rollback, sinon le
premier essai passe pour un bug.

---

> **Dernière mise à jour** : Août 2026