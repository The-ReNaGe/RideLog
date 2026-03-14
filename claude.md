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

```bash
# Lancer tout
docker compose up -d --build

# Logs backend
docker logs ridelog-backend --tail 50

# Logs frontend
docker logs ridelog-frontend --tail 50

# Reconstruire uniquement le backend
docker compose up -d --build backend

# Reconstruire uniquement le frontend
docker compose up -d --build frontend
```

### Services

| Service | Image | RAM limit | Volumes |
|---------|-------|-----------|---------|
| `backend` | `python:3.11-slim` | 256 MB | `./data:/data` (BDD, photos, factures) |
| `frontend` | `node:18-alpine` → `nginx:alpine` | 512 MB | — (statique) |

### Variables d'environnement backend

Les variables d'environnement sont gérées via un fichier `.env` à la racine du projet (jamais commité). Copier `.env.example` → `.env` et remplir les valeurs.

| Variable | Défaut | Description |
|----------|--------|-------------|
| `JWT_SECRET` | (dev value) | **Obligatoire en prod** — secret JWT HS256 |
| `DATABASE_URL` | `sqlite:////data/ridelog.db` | Chemin SQLite |
| `HA_INIT_KEY` | — | Clé pour initialiser le compte Home Assistant |
| `REGISTRATION_MODE` | `invite` | `invite` / `open` / `closed` |
| `CORS_ORIGINS` | `*` | Origines CORS autorisées (séparées par `,`) |
| `LOG_LEVEL` | `INFO` | Niveau de log |
| `RAPIDAPI_KEY` | — | Clé API pour décodage plaque d'immatriculation |
| `REMINDER_INTERVAL` | `3600` | Intervalle de vérification des rappels (secondes) |
| `REMINDER_ENABLED` | `true` | Active/désactive le scheduler de rappels |
| `INVOICE_STORAGE_DIR` | `/data/invoices` | Répertoire des factures |
| `PHOTO_STORAGE_DIR` | `/data/photos` | Répertoire des photos véhicules |

### Réseau

Les deux containers communiquent via le réseau Docker `ridelog`. Le frontend nginx fait proxy vers `http://backend:8000` pour les routes `/api/*`.

### Mise à jour

```bash
# Sur le serveur, dans le dossier du projet
git pull origin main
docker compose up -d --build
```

Le script `update.sh` à la racine automatise backup BDD + pull + rebuild en une commande.

---

## 3. Backend — Structure et fichiers

```
backend/
├── main.py                    # Point d'entrée FastAPI, CORS, lifespan
├── config.py                  # Variables d'environnement centralisées
├── models.py                  # Modèles SQLAlchemy + init_db() + migrations
├── schemas.py                 # Schémas Pydantic (validation entrées/sorties)
├── security.py                # JWT, bcrypt, rate limiting, middlewares auth
├── maintenance_calculator.py  # ★ LOGIQUE MÉTIER PRINCIPALE ★
├── reminder_scheduler.py      # Scheduler background (rappels webhook)
├── Dockerfile
├── requirements.txt
├── data/
│   ├── maintenance_intervals.json  # ★ INTERVALLES ET PRIX D'ENTRETIEN ★
│   ├── brands.json                 # Catégorisation marques (accessible/generalist/premium)
│   ├── vehicle_models.json         # Liste marques/modèles pour autocomplétion
│   └── communes.csv                # 39 202 communes françaises (géolocalisation)
├── integrations/
│   ├── discord_webhook.py          # Envoi de notifications Discord
│   └── homeassistant.py            # Client API HA
└── routes/
    ├── __init__.py                 # secure_delete()
    ├── auth.py                     # Login, register, invitations, admin
    ├── vehicles.py                 # CRUD véhicules, VIN/plaque, planning global
    ├── maintenances.py             # CRUD maintenances, factures, "À venir", overrides
    ├── dashboard.py                # Statistiques agrégées du parc
    ├── exports.py                  # Export ZIP, estimation, carte HA YAML
    ├── fuels.py                    # CRUD carburant, statistiques conso
    ├── fuel_stations.py            # Recherche stations par ville
    ├── integrations.py             # (placeholder)
    └── webhooks.py                 # CRUD webhooks, envoi notifications
```

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
- **JWT** : algorithme HS256, expiration 7 jours
- **Rate limiting** : `LoginRateLimiter` — verrouillage progressif par IP :
  - 3 échecs → 30s, 6 → 5min, 9 → 15min, 12+ → 1h
- **Middlewares** :
  - `get_current_user()` : vérifie le JWT, retourne l'objet `User`
  - `get_current_admin()` : idem + vérifie `is_admin`
  - Le compte HA (`is_integration_account=True`) voit tous les véhicules

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

> **Note** : le scheduler ne charge pas encore les overrides d'intervalles. Si un utilisateur a personnalisé un intervalle, les rappels webhook utilisent encore les valeurs par défaut du JSON. À corriger dans une future version en passant les overrides à `get_all_upcoming_maintenances()` comme dans `_compute_upcoming()`.

---

## 4. Système d'authentification

### Fichiers concernés
- `backend/security.py` — JWT, bcrypt, middlewares
- `backend/routes/auth.py` — Endpoints login/register/admin
- `frontend/src/lib/api.js` — Intercepteurs Axios (ajout token)
- `frontend/src/pages/AuthPage.jsx` — Formulaires login/register
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
| POST | `/api/auth/ha-init` | `init_key` param | Créer le compte Home Assistant |
| GET | `/api/admin/users` | Admin | Lister tous les utilisateurs |
| DELETE | `/api/admin/users/{id}` | Admin | Supprimer un utilisateur |

### Modes d'inscription (`REGISTRATION_MODE`)

| Mode | Comportement |
|------|-------------|
| `open` | Tout le monde peut s'inscrire |
| `invite` | Inscription uniquement avec un token d'invitation valide |
| `closed` | Aucune inscription possible |

### Invitations

- Créées par un admin via `POST /api/auth/invitations`
- Token unique, date d'expiration
- Consommée à l'inscription (marquée `used_by` + `used_at`)
- Stockées dans la table `invitations`

### Compte Home Assistant

- Créé via `POST /api/auth/ha-init?init_key=<HA_INIT_KEY>`
- Username fixe : `homeassistant`
- Flag `is_integration_account = True` → voit tous les véhicules de tous les utilisateurs
- Token valide 30 jours (renouvelable via `/api/auth/refresh-token`)

### Pour modifier

- **Changer la durée du JWT** : `security.py` → `JWT_EXPIRE_DAYS`
- **Changer le coût bcrypt** : `security.py` → `bcrypt.hashpw(... rounds=12)`
- **Ajouter un nouveau mode d'inscription** : `routes/auth.py` → endpoint `register`
- **Modifier le rate limiting** : `security.py` → `LoginRateLimiter` → `LOCKOUT_THRESHOLDS`

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
| DELETE | `/api/vehicles/{id}/photo` | Supprimer photo |

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

La catégorie est auto-détectée à partir de la marque (fichier `data/brands.json`) et peut être ajustée par le prix d'achat et l'âge du véhicule.

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
| `backend/data/maintenance_intervals.json` | **Source de vérité** : définit tous les entretiens, intervalles, prix |
| `backend/maintenance_calculator.py` | **Logique métier** : calcule les échéances, statuts, coûts |
| `backend/routes/maintenances.py` | API : CRUD maintenances, "À venir", factures, overrides |
| `backend/routes/vehicles.py` | API : planning global |
| `backend/routes/dashboard.py` | API : stats agrégées (charge les overrides) |
| `backend/reminder_scheduler.py` | Background : rappels webhook |
| `frontend/src/components/MaintenanceForm.jsx` | UI : formulaire d'enregistrement |
| `frontend/src/components/MaintenanceHistory.jsx` | UI : historique |
| `frontend/src/components/UpcomingMaintenance.jsx` | UI : "À venir" + bouton édition intervalle |

### 6.1 Le JSON de maintenance (`maintenance_intervals.json`)

Ce fichier JSON est divisé en deux sections principales : `car` et `motorcycle`.

#### Section voiture (`car`)

Structure plate : chaque clé = un type d'intervention.

```json
{
  "oil_change": {
    "name": "Vidange d'huile + filtre",
    "km_interval": 10000,
    "months_interval": 12,
    "forecasted": true,
    "motorization": ["diesel"],
    "note": "...",
    "prices": {
      "accessible": { "min": 50, "max": 90 },
      "generalist": { "min": 70, "max": 130 },
      "premium": { "min": 100, "max": 200 }
    }
  }
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `name` | string | Nom français affiché dans l'UI. **DOIT être dans `INTERVENTION_TRANSLATIONS`** |
| `km_interval` | int\|null | Déclenchement par km. null = pas de critère km |
| `months_interval` | int\|null | Déclenchement par mois. null = pas de critère temps |
| `forecasted` | bool | `true` = apparaît dans "À venir". `false` = enregistrable uniquement |
| `motorization` | array\|absent | Si présent, n'apparaît que pour les véhicules avec cette motorisation |
| `prices` | object | Prix estimé min/max par catégorie de gamme |

Entretiens voiture actuels :

| Clé | Nom | km | mois | Motorisation | Prévisionnel |
|-----|-----|----|------|-------------|-------------|
| `oil_change` | Vidange d'huile + filtre | 10 000 | 12 | — | ✅ |
| `air_filter` | Filtre à air | 20 000 | 12 | — | ✅ |
| `cabin_filter` | Filtre d'habitacle | 15 000 | 12 | — | ✅ |
| `fuel_filter_diesel` | Filtre à gasoil | 20 000 | 24 | diesel | ✅ |
| `fuel_filter_gasoline` | Filtre à essence | 50 000 | 48 | essence | ✅ |
| `spark_plug` | Bougies d'allumage | 30 000 | — | essence, hybride | ✅ |
| `brake_fluid` | Purge de frein | — | 24 | — | ✅ |
| `timing_belt` | Courroie de distribution | 80 000 | 72 | — | ✅ |
| `coolant` | Liquide de refroidissement | 60 000 | 48 | — | ✅ |
| `transmission_fluid` | Liquide de transmission | 80 000 | 48 | — | ✅ |
| `inspection_technical_car` | Contrôle technique | — | spécial | — | ✅ |
| `brake_pads` | Plaquettes de frein | 30 000 | — | — | ❌ |
| `battery` | Batterie | — | — | — | ❌ |
| `tire_replacement` | Pneus | — | — | — | ❌ |

#### Section moto (`motorcycle`)

Structure hiérarchique avec 5 sous-sections :

```
motorcycle/
├── brand_defaults        → Intervalles km/mois par marque et cylindrée
├── service_prices        → Prix de la révision MINEURE (sans soupapes) par cylindrée
├── annual_service_prices → Prix de l'entretien ANNUEL (contrôle simplifié)
├── forecasted            → Entretiens prévisionnels (affichés dans "À venir")
└── recordable            → Entretiens enregistrables uniquement
```

##### `brand_defaults`

Définit l'intervalle de révision (km + mois) par marque et tranche de cylindrée :

```json
"Honda": [
  { "max_cc": 125, "km": 4000, "months": 12 },
  { "max_cc": 500, "km": 6000, "months": 12 },
  { "max_cc": 99999, "km": 12000, "months": 12 }
],
"Triumph": [
  { "max_cc": 660, "km": 16000, "months": 12 },
  { "max_cc": 99999, "km": 10000, "months": 12 }
]
```

L'utilisateur peut surcharger l'intervalle kilométrique à la création du véhicule (`service_interval_km`). L'entretien annuel est toujours fixé à 12 mois.

##### `service_prices` / `annual_service_prices`

Prix par tranche de cylindrée (`125cc`, `200_400cc`, `500_750cc`, `750_1100cc`, `1100_plus`) et par gamme (`accessible`, `generalist`, `premium`).

- `service_prices` = prix de la **révision périodique kilométrique** (mineure, sans soupapes)
- `annual_service_prices` = prix de l'**entretien annuel** (contrôle simplifié si km pas atteint)

##### `forecasted` — Entretiens prévisionnels moto

| Clé | Nom | km | mois | Notes |
|-----|-----|----|------|-------|
| `periodic_service` | Révision périodique (km) | **dynamique** | null | Intervalle = `brand_defaults` ou surcharge utilisateur. Prix = `service_prices` |
| `annual_service` | Entretien annuel | null | 12 (fixe) | Contrôle simplifié annuel. Toujours 12 mois. Prix = `annual_service_prices` |
| `oil_change` | Vidange d'huile + Remplacement filtre à huile | **dynamique** | 12 | km = même que `periodic_service`. Calculé dans `get_intervals_for_vehicle()` |
| `valve_clearance` | Contrôle jeu aux soupapes | **dynamique** | null | = 2× l'intervalle de révision (1 sur 2) |
| `brake_fluid` | Remplacement liquide de frein | null | 24 | Renommé (ancien : "Purge liquide de frein et embrayage" — conservé dans INTERVENTION_TRANSLATIONS pour compatibilité BDD) |
| `coolant` | Liquide de refroidissement | null | 36 | |
| `fork_service` | Révision fourche | null | 36 | |
| `inspection_technical_moto` | Contrôle technique | null | spécial | Calcul réglementaire français |

**IMPORTANT** : Les clés `periodic_service`, `valve_clearance` et `oil_change` ont des intervalles km `null` dans le JSON. Ils sont calculés dynamiquement dans `maintenance_calculator.py` → `get_intervals_for_vehicle()`.

> **Note** : `transmission_fluid` a été déplacé de `forecasted` vers `recordable` car sur moto, l'huile de transmission est incluse dans la vidange moteur dans la plupart des cas.

##### `recordable` — Entretiens enregistrables moto

Interventions qu'on peut enregistrer mais qui n'apparaissent pas dans "À venir" :
`break_in_service` (rodage), `oil_filter`, `spark_plug`, `air_filter`, `tire_replacement_*`, `brake_pads`, `brake_disc`, `chain_kit`, `chain_maintenance`, `battery`, `steering_bearings`, `wheel_bearings`, `carburetor_cleaning`, `injection_sync`, `electronic_diagnosis`, `transmission_fluid`

### 6.2 Le calculateur (`maintenance_calculator.py`)

#### Constantes critiques

**`INTERVENTION_TRANSLATIONS`** — Mapping nom français → clé technique

C'est le dictionnaire qui fait le lien entre le nom affiché en français (stocké en BDD quand l'utilisateur enregistre une maintenance) et la clé technique du JSON. **Chaque nom dans le JSON DOIT avoir une entrée ici**, sinon le système ne reconnaîtra pas les maintenances enregistrées.

Entrées importantes ajoutées/modifiées :

```python
"Purge liquide de frein et embrayage": "brake_fluid",         # ancien nom — conserver pour BDD existante
"Remplacement liquide de frein": "brake_fluid",                # nouveau nom
"Vidange d'huile + Remplacement filtre à huile": "oil_change_moto",  # vidange moto forecasted
```

> **Pourquoi `oil_change_moto` et pas `oil_change`** : `oil_change` est déjà utilisé pour les voitures. La clé BDD est distincte pour ne pas mélanger les historiques voiture/moto. La clé JSON moto reste `oil_change` (itérée dans `get_intervals_for_vehicle()`).

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

**Logique spéciale `annual_service`** : la date de référence est la plus récente parmi toutes les interventions majeures (`annual_service`, `periodic_service`, `oil_change_moto`, `valve_clearance`). Cela évite que l'entretien annuel reste calé sur une ancienne date alors qu'une révision périodique plus récente a eu lieu.

```python
MAJOR_SERVICE_KEYS = {
    "annual_service", "periodic_service",
    "oil_change_moto", "valve_clearance",
}
# Pour annual_service uniquement : prendre la date max parmi ces clés
```

**Référence temporelle pour les items jamais enregistrés** : priorité à la MEC (`registration_date`) si disponible, sinon fallback sur le 1er janvier de `vehicle_year`. Cela évite le décalage en fin d'année pour les véhicules mis en circulation tard dans l'année.

```python
if registration_date:
    reference_start_date = registration_date   # MEC exacte prioritaire
elif vehicle_year:
    reference_start_date = datetime(safe_year, 1, 1)  # fallback seulement
```

Chaque item retourné inclut :
- `intervention_key` : clé technique (ex: `fork_service`) — utilisé par l'UI pour identifier l'item à éditer
- `has_override` : `True` si un override est actif sur cet item — affiché comme badge "Personnalisé" dans l'UI

##### `calculate_maintenance_status(...)` → (status, km_remaining, days_remaining, next_due_mileage, next_due_date)

Calcule le statut d'un entretien :
- `next_due_mileage` = arrondi au multiple le plus proche de `km_interval` (anti-drift). ex: 10 500 + 10 000 → 20 000, pas 20 500
- `km_remaining = next_due_mileage - current_mileage`
- `next_due_date = last_date + months_interval`
- Statuts : `overdue` (négatif), `urgent` (≤300km ou ≤7j), `warning` (≤1500km ou ≤90j), `ok`
- Chaque item retourne `never_recorded: true` si aucun historique → le frontend affiche "Jamais enregistré"

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
| GET | `/api/vehicles/{vid}/interval-overrides` | Lister les surcharges d'intervalles |
| PUT | `/api/vehicles/{vid}/interval-overrides/{key}` | Créer/modifier une surcharge |
| DELETE | `/api/vehicles/{vid}/interval-overrides/{key}` | Supprimer une surcharge |

### 6.4 Flux "enregistrement → mise à jour du planning"

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

### 6.5 Pour modifier

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
| GET | `/api/fuels/{vid}/fuel-logs` | Historique des pleins |
| POST | `/api/fuels/{vid}/fuel-logs` | Enregistrer un plein |
| PUT | `/api/fuels/{vid}/fuel-logs/{fid}` | Modifier |
| DELETE | `/api/fuels/{vid}/fuel-logs/{fid}` | Supprimer |
| GET | `/api/fuels/{vid}/fuel-stats` | Statistiques de consommation |

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
3. **prix-carburants.gouv.fr** : API officielle des prix de carburant

### Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/fuel-stations/search?city=...&fuel_type=...&max_distance=...` | Recherche par ville |
| GET | `/api/fuel-stations/city-suggestions?q=...` | Autocomplétion ville (max 3 résultats) |

### Pour modifier

- **Ajouter un type de carburant** : `fuel_stations.py` + `FuelStations.jsx`
- **Modifier le rayon de recherche** : paramètre `max_distance` de l'endpoint
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
| GET | `/api/webhooks/settings/webhooks` | Lister les webhooks |
| POST | `/api/webhooks/settings/webhooks` | Créer un webhook |
| DELETE | `/api/webhooks/settings/webhooks/{id}` | Supprimer |
| PUT | `/api/webhooks/settings/webhooks/{id}` | Activer/désactiver |
| POST | `/api/webhooks/settings/webhooks/{id}/test` | Tester l'envoi |
| POST | `/api/webhooks/settings/webhooks/check-reminders` | Forcer vérification maintenant |

---

## 10. Intégration Home Assistant

### Fichiers concernés
- `ha-integration/custom_components/ridelog/` — Composant HA complet
- `backend/routes/auth.py` → endpoint `ha-init`
- `backend/init_ha.py` — Initialisation du compte HA
- `frontend/src/components/integrations/HomeAssistantIntegration.jsx` — Guide setup

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
4. Saisir l'URL de l'API (`http://IP:8000`) et la clé `HA_INIT_KEY`

### Capteurs créés (par véhicule)

| Entité | State | Attributs |
|--------|-------|-----------|
| `sensor.ridelog_{nom}_summary` | Kilométrage actuel | name, brand, model, year, type, motorization |
| `sensor.ridelog_{nom}_upcoming` | Nombre maintenances à venir | Liste détaillée des maintenances |
| `sensor.ridelog_{nom}_overdue` | Nombre maintenances en retard | Liste détaillée des retards |

### Coordinateur de données

- `RideLogDataUpdateCoordinator` : polling toutes les `DEFAULT_SCAN_INTERVAL` secondes (3600 par défaut)
- Rafraîchit le token JWT automatiquement si proches de l'expiration (seuil 7 jours)
- Appelle `/api/vehicles` puis `/api/maintenances/{id}/upcoming` pour chaque véhicule

### Services HA

- `ridelog.check_reminders` : force une vérification immédiate des rappels
- `ridelog.refresh_vehicles` : rafraîchit manuellement la liste des véhicules

### Cartes Lovelace

L'endpoint `/api/exports/{vid}/ha-dashboard-card` génère du YAML prêt à copier (carte Mushroom).
Des templates sont disponibles dans `ha-integration/templates/`.

### Pour modifier

- **Ajouter un capteur** : `sensor.py` → créer une classe héritant de `CoordinatorEntity` + `SensorEntity`
- **Modifier l'intervalle de polling** : `const.py` → `DEFAULT_SCAN_INTERVAL`
- **Ajouter un service** : `services.py` + enregistrer dans `__init__.py`
- **Modifier le flux de config** : `config_flow.py`

---

## 11. Intégration Discord

### Fichiers concernés
- `backend/integrations/discord_webhook.py` — Formatage des messages Discord
- `backend/routes/webhooks.py` → `send_webhook_notification()` — Envoi
- `frontend/src/components/integrations/DiscordIntegration.jsx` — UI

### Fonctionnement

1. L'utilisateur crée un webhook Discord dans les paramètres de son serveur Discord
2. Il ajoute l'URL du webhook dans RideLog (type = `discord`)
3. Le scheduler envoie des embeds Discord formatés avec :
   - Couleur selon le statut (rouge = en retard, orange = urgent, jaune = attention)
   - Nom du véhicule, type d'intervention
   - Km restants, jours restants
   - Fourchette de coût estimé
   - Timestamp

### Pour modifier

- **Changer le format** : `integrations/discord_webhook.py`
- **Ajouter des champs à l'embed** : modifier le dict `embed` dans la fonction d'envoi

---

## 12. Frontend — Structure et fichiers

```
frontend/src/
├── App.jsx                     # Layout principal, navigation state-based
├── index.jsx                   # Point d'entrée React
├── index.css                   # Styles globaux (Tailwind + custom vars)
├── config/                     # (placeholder config)
├── lib/
│   └── api.js                  # Client Axios, ~73 méthodes API
├── pages/
│   ├── AuthPage.jsx            # Login / Register
│   ├── VehicleList.jsx         # Liste véhicules (grille)
│   ├── VehicleDetail.jsx       # Détail véhicule (onglets)
│   ├── Dashboard.jsx           # Dashboard global
│   ├── Planning.jsx            # Planning calendrier
│   ├── Settings.jsx            # Paramètres (Discord, HA, Rappels)
│   └── Admin.jsx               # Administration (users, invitations)
└── components/
    ├── VehicleCard.jsx             # Carte véhicule (React.memo)
    ├── VehicleForm.jsx             # Formulaire création/édition véhicule
    ├── MaintenanceForm.jsx         # Formulaire enregistrement maintenance
    ├── MaintenanceHistory.jsx      # Historique maintenances
    ├── UpcomingMaintenance.jsx     # Maintenances "À venir" + édition intervalles
    ├── RevisionChecklistModal.jsx  # ★ Checklist post-révision moto ★
    ├── FuelTracking.jsx            # Suivi carburant complet
    ├── FuelStations.jsx            # Recherche stations essence
    ├── APIDocumentation.jsx        # Documentation API intégrée
    ├── RepairHotspotModel.jsx      # Visualisation points chauds
    └── integrations/
        ├── DiscordIntegration.jsx      # Config webhook Discord
        ├── HomeAssistantIntegration.jsx # Guide setup HA
        └── IntegrationsSettings.jsx    # Page intégrations
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

### Thème

- Mode clair/sombre basculable depuis le header
- Persisté dans `localStorage`
- Variables CSS dans `index.css` (`--bg`, `--text`, `--accent`, etc.)

### Client API (`lib/api.js`)

- Client Axios avec baseURL configurable (`VITE_API_URL` ou `/api`)
- Intercepteur request : ajoute `Authorization: Bearer <token>`
- Intercepteur response : gère les 401 (token expiré)
- ~73 méthodes couvrant tous les endpoints backend
- Méthodes overrides : `getIntervalOverrides`, `upsertIntervalOverride`, `deleteIntervalOverride`

### `VehicleDetail.jsx` — props à passer à `UpcomingMaintenance`

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
| `users` | id, username (unique) | Comptes utilisateurs |
| `vehicles` | id, user_id (FK) | Véhicules du parc |
| `maintenances` | id, vehicle_id (FK) | Historique d'entretien |
| `maintenance_invoices` | id, maintenance_id (FK) | Factures jointes |
| `fuel_logs` | id, vehicle_id (FK) | Pleins de carburant |
| `webhooks` | id, user_id (FK) | Webhooks configurés |
| `notification_logs` | id, vehicle_id (FK) | Log des notifications envoyées |
| `invitations` | id, token (unique) | Tokens d'invitation |
| `vehicle_estimates` | id, brand, model | Estimations de valeur |
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

### Migrations

Les migrations sont gérées manuellement dans `models.py` → `init_db()` :
- Vérification de l'existence des colonnes via `PRAGMA table_info`
- Ajout via `ALTER TABLE ADD COLUMN`
- Idempotent (peut être relancé sans erreur)
- La table `vehicle_maintenance_overrides` est créée automatiquement au premier démarrage si absente

### Pour modifier

- **Ajouter une colonne** : `models.py` → ajouter dans le modèle + dans `init_db()` (migration ALTER TABLE)
- **Ajouter une table** : `models.py` → créer le modèle + `Base.metadata.create_all()` dans `init_db()`
- **⚠️ Pas d'Alembic** : les migrations sont manuelles

---

## 14. Guides de modification

### Ajouter un nouveau type de véhicule (ex: "camion")

1. `models.py` : Pas de modification du modèle (le champ `vehicle_type` est un string libre)
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
- **Référence temps** : pour les items jamais enregistrés, utilise la MEC (`registration_date`) en priorité, puis `vehicle_year` en fallback

### Ajouter un champ à l'export ZIP

- `routes/exports.py` → `recap/download` endpoint
- Modifier la construction du CSV et/ou ajouter des fichiers au ZIP

### Modifier les templates de cartes HA

- `ha-integration/templates/` : fichiers YAML de templates
- `routes/exports.py` → `ha-dashboard-card` : génération dynamique

---

## 15. Checklist de révision moto

### Vue d'ensemble

Quand un utilisateur enregistre une **"Révision périodique (km)"** ou un **"Entretien annuel"** sur une moto, une modale s'ouvre automatiquement après le submit. Elle propose une checklist des interventions pouvant être effectuées lors de cette révision. Chaque item coché est enregistré comme une maintenance indépendante en BDD, à la même date et au même kilométrage que la révision.

### Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `frontend/src/components/RevisionChecklistModal.jsx` | ★ Composant modale checklist |
| `frontend/src/components/MaintenanceForm.jsx` | Modifié — déclenche la modale après submit |
| `frontend/src/pages/VehicleDetail.jsx` | Modifié — passe `upcomingMaintenances` en prop |

### Flux complet

```
1. Utilisateur sélectionne "Révision périodique (km)" ou "Entretien annuel"
2. Il remplit date + kilométrage + coût, soumet le formulaire
3. POST /api/vehicles/{vid}/maintenances → révision enregistrée en BDD
4. MaintenanceForm détecte le type déclenchant → setChecklistData({ date, mileage })
5. RevisionChecklistModal s'ouvre avec les items groupés par catégorie
6. Item pré-coché par défaut : "Vidange d'huile + Remplacement filtre à huile"
7. Utilisateur coche/décoche les interventions effectuées
8. Sur "Enregistrer" : Promise.all → N × POST /api/vehicles/{vid}/maintenances
9. État succès affiché → fermeture → onSubmit() → refresh VehicleDetail
```

### Types déclenchants

Définis dans la constante `CHECKLIST_TRIGGERS` de `MaintenanceForm.jsx` :
```jsx
const CHECKLIST_TRIGGERS = [
  'Révision périodique (km)',
  'Entretien annuel',
];
```

La checklist ne se déclenche que pour `vehicleType === 'motorcycle'`.

### Items proposés dans la checklist

| Groupe | Items |
|--------|-------|
| 🔧 Moteur | Vidange d'huile + filtre *(pré-coché)*, Bougie, Filtre à air, Jeu aux soupapes |
| ⛓️ Transmission | Kit chaîne, Tension et lubrification chaîne |
| 🛑 Freinage | Plaquettes de frein, Disques de frein |
| 🔩 Suspension | Révision fourche, Roulements de roue, Roulements de direction |
| 🏍️ Pneumatiques | Pneu avant, Pneu arrière |
| ⚡ Électronique | Batterie, Nettoyage carburateur, Synchro injection, Diagnostic |

### Props de `RevisionChecklistModal`

| Prop | Type | Description |
|------|------|-------------|
| `vehicleId` | number | ID du véhicule |
| `date` | string | Date ISO de la révision (transmise aux maintenances créées) |
| `mileage` | number | Kilométrage de la révision (transmis aux maintenances créées) |
| `upcomingData` | Array | Résultat de `GET /upcoming` — réservé pour usage futur |
| `onClose` | Function | Appelé à la fermeture — doit appeler `onSubmit()` du parent |
| `onSuccess` | Function | Appelé après enregistrement réussi (avant fermeture) |

### Intégration dans `MaintenanceForm.jsx`

```jsx
// Dans handleSubmit, après le POST réussi :
if (vehicleType === 'motorcycle' && CHECKLIST_TRIGGERS.includes(formData.intervention_type)) {
  setChecklistData({ date, mileage });
  // NE PAS appeler onSubmit() ici — la modale le fera à sa fermeture
} else {
  onSubmit();
}
```

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

`RevisionChecklistModal.jsx` utilise exclusivement les variables CSS RideLog (`var(--bg)`, `var(--accent)`, `var(--border)`, `var(--text-1/2/3)`, `var(--danger)`, `var(--warning)`) et les classes `btn btn-primary`, `btn btn-secondary`, `card`. S'adapte automatiquement au toggle clair/sombre.

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
| `frontend/src/lib/api.js` | 3 nouvelles méthodes |

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

**Dans `dashboard.py`** — optimisé : une seule requête pour tous les véhicules de l'utilisateur, puis indexation par `vehicle_id` avant la boucle :
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
- Bouton "Réinitialiser par défaut" visible seulement si un override existe (`item.has_override`)
- Validation : impossible de désactiver les deux critères simultanément (bouton Enregistrer désactivé)

### Méthodes API (`lib/api.js`)

```js
api.getIntervalOverrides(vehicleId)
api.upsertIntervalOverride(vehicleId, interventionKey, { km_interval, months_interval, is_km_disabled, is_months_disabled })
api.deleteIntervalOverride(vehicleId, interventionKey)
```

### Pour modifier

- **Ajouter une contrainte de validation** : `schemas.py` → `IntervalOverrideUpdate` (ex: km_interval min/max)
- **Étendre au scheduler** : `reminder_scheduler.py` → charger les overrides du véhicule et les passer à `get_all_upcoming_maintenances()` (non fait à ce jour)
- **Appliquer les overrides au planning global** : `routes/vehicles.py` → endpoint `/planning` (non fait à ce jour)

---

> **Dernière mise à jour** : Mars 2026