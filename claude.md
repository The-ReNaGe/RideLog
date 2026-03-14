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
    ├── maintenances.py             # CRUD maintenances, factures, "À venir"
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
| `backend/routes/maintenances.py` | API : CRUD maintenances, "À venir", factures |
| `backend/routes/vehicles.py` | API : planning global |
| `backend/routes/dashboard.py` | API : stats agrégées |
| `backend/reminder_scheduler.py` | Background : rappels webhook |
| `frontend/src/components/MaintenanceForm.jsx` | UI : formulaire d'enregistrement |
| `frontend/src/components/MaintenanceHistory.jsx` | UI : historique |
| `frontend/src/components/UpcomingMaintenance.jsx` | UI : "À venir" |

### 6.1 Le JSON de maintenance (`maintenance_intervals.json`)

Ce fichier JSON est divisé en deux sections principales : `car` et `motorcycle`.

#### Section voiture (`car`)

Structure plate : chaque clé = un type d'intervention.

```json
{
  "oil_change": {
    "name": "Vidange d'huile + filtre",   // Nom affiché
    "km_interval": 10000,                 // Intervalle km (null = pas de critère km)
    "months_interval": 12,                // Intervalle mois (null = pas de critère temps)
    "forecasted": true,                   // true = affiché dans "À venir"
    "motorization": ["diesel"],           // OPTIONNEL : filtre par motorisation
    "note": "...",                         // OPTIONNEL : info-bulle
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
├── brand_defaults     → Intervalles km/mois par marque et cylindrée
├── service_prices     → Prix de la révision MINEURE (sans soupapes) par cylindrée
├── annual_service_prices → Prix de l'entretien ANNUEL (contrôle simplifié)
├── forecasted         → Entretiens prévisionnels (affichés dans "À venir")
└── recordable         → Entretiens enregistrables uniquement
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
| `valve_clearance` | Contrôle jeu aux soupapes | **dynamique** | null | = 2× l'intervalle de révision (1 sur 2) |
| `brake_fluid` | Purge frein + embrayage | null | 24 | |
| `coolant` | Liquide de refroidissement | null | 36 | |
| `transmission_fluid` | Huile de transmission | null | 48 | |
| `fork_service` | Révision fourche | null | 36 | |
| `inspection_technical_moto` | Contrôle technique | null | spécial | Calcul réglementaire français |

**IMPORTANT** : Les clés `periodic_service` et `valve_clearance` ont des intervalles `null` dans le JSON. Ils sont calculés dynamiquement dans `maintenance_calculator.py` → `get_intervals_for_vehicle()`. L'`annual_service` a un intervalle fixe de 12 mois défini dans le JSON.

##### `recordable` — Entretiens enregistrables moto

Interventions qu'on peut enregistrer mais qui n'apparaissent pas dans "À venir" :
`break_in_service` (rodage), `oil_change`, `oil_filter`, `spark_plug`, `air_filter`, `tire_replacement_*`, `brake_pads`, `brake_disc`, `chain_kit`, `chain_maintenance`, `battery`, `steering_bearings`, `wheel_bearings`, `carburetor_cleaning`, `injection_sync`, `electronic_diagnosis`

### 6.2 Le calculateur (`maintenance_calculator.py`)

#### Constantes critiques

**`INTERVENTION_TRANSLATIONS`** — Mapping nom français → clé technique

C'est le dictionnaire qui fait le lien entre le nom affiché en français (stocké en BDD quand l'utilisateur enregistre une maintenance) et la clé technique du JSON. **Chaque nom dans le JSON DOIT avoir une entrée ici**, sinon le système ne reconnaîtra pas les maintenances enregistrées.

Exemple :
```python
"Contrôle jeu aux soupapes": "valve_clearance",
"Vidange d'huile + filtre": "oil_change",
"Remplacement filtre à gasoil": "fuel_filter_diesel",
```

**Quand ajouter une entrée** : à chaque fois qu'un nouveau `name` est ajouté dans le JSON, il FAUT l'ajouter aussi dans `INTERVENTION_TRANSLATIONS`.

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

##### `get_all_upcoming_maintenances(...)` → List[Dict]

Calcule toutes les maintenances à venir pour un véhicule.

Paramètres importants :
- `last_maintenances` : Dict `{clé_technique: (dernière_date, dernier_km)}` — construit en mappant chaque maintenance enregistrée via `get_intervention_key()`
- `motorization` : filtre les entretiens par motorisation (ex: filtre à gasoil uniquement pour diesel)

Pour chaque entretien :
1. Vérifie `forecasted == True`
2. Vérifie la compatibilité `motorization` (si le champ existe dans le JSON)
3. Calcule le statut via `calculate_maintenance_status()`
4. Retourne : `intervention_type`, `status`, `km_remaining`, `days_remaining`, `next_due_mileage`, `next_due_date`

##### `calculate_maintenance_status(...)` → (status, km_remaining, days_remaining, next_due_mileage, next_due_date)

Calcule le statut d'un entretien :
- `next_due_mileage` = arrondi au multiple le plus proche de `km_interval` (anti-drift). ex: 10 500 + 10 000 → 20 000, pas 20 500
- `km_remaining = next_due_mileage - current_mileage`
- `next_due_date = last_date + months_interval`
- Quand aucun historique et maintenance temps-basée, la date de référence = `min(registration_date, vehicle_year)` (gère les véhicules d'occasion)
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
| GET | `/api/maintenances/{vid}/available-interventions` | Types d'interventions disponibles avec prix |
| GET | `/api/maintenances/{vid}/maintenances` | Historique des maintenances |
| POST | `/api/maintenances/{vid}/maintenances` | Enregistrer une maintenance (multipart, jusqu'à 10 factures) |
| PUT | `/api/maintenances/{vid}/maintenances/{mid}` | Modifier |
| DELETE | `/api/maintenances/{vid}/maintenances/{mid}` | Supprimer (+ suppression sécurisée des factures) |
| GET | `/api/maintenances/{vid}/upcoming` | Maintenances à venir |
| GET | `/api/maintenances/{vid}/recommendations` | Recommandations |

### 6.4 Flux "enregistrement → mise à jour du planning"

```
1. Utilisateur enregistre "Contrôle jeu aux soupapes" à 20 600 km
2. POST /api/maintenances/{vid}/maintenances
   → Stocke en BDD : intervention_type = "Contrôle jeu aux soupapes"
   → Met à jour vehicle.current_mileage si supérieur
   → Efface NotificationLog pour cette intervention (force nouveaux rappels)
3. GET /api/maintenances/{vid}/upcoming
   → _compute_upcoming() récupère toutes les maintenances en BDD
   → Pour chaque : get_intervention_key("Contrôle jeu aux soupapes") → "valve_clearance"
   → Construit last_maintenances["valve_clearance"] = (date, 20600)
   → get_all_upcoming_maintenances() calcule :
     - valve_clearance.km_interval = 2 × 10000 = 20000
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

#### Modifier un intervalle existant

- Modifier uniquement `km_interval` et/ou `months_interval` dans le JSON
- Aucune autre modification nécessaire

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
│   └── api.js                  # Client Axios, ~70 méthodes API
├── pages/
│   ├── AuthPage.jsx            # Login / Register
│   ├── VehicleList.jsx         # Liste véhicules (grille)
│   ├── VehicleDetail.jsx       # Détail véhicule (onglets)
│   ├── Dashboard.jsx           # Dashboard global
│   ├── Planning.jsx            # Planning calendrier
│   ├── Settings.jsx            # Paramètres (Discord, HA, Rappels)
│   └── Admin.jsx               # Administration (users, invitations)
└── components/
    ├── VehicleCard.jsx         # Carte véhicule (React.memo)
    ├── VehicleForm.jsx         # Formulaire création/édition véhicule
    ├── MaintenanceForm.jsx     # Formulaire enregistrement maintenance
    ├── MaintenanceHistory.jsx  # Historique maintenances
    ├── UpcomingMaintenance.jsx # Maintenances "À venir"
    ├── FuelTracking.jsx        # Suivi carburant complet
    ├── FuelStations.jsx        # Recherche stations essence
    ├── APIDocumentation.jsx    # Documentation API intégrée
    ├── RepairHotspotModel.jsx  # Visualisation points chauds
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
- ~70 méthodes couvrant tous les endpoints backend

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

### Migrations

Les migrations sont gérées manuellement dans `models.py` → `init_db()` :
- Vérification de l'existence des colonnes via `PRAGMA table_info`
- Ajout via `ALTER TABLE ADD COLUMN`
- Idempotent (peut être relancé sans erreur)

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
- **Référence temps** : pour les items jamais enregistrés, utilise `min(registration_date, vehicle_year)` comme point de départ

### Ajouter un champ à l'export ZIP

- `routes/exports.py` → `recap/download` endpoint
- Modifier la construction du CSV et/ou ajouter des fichiers au ZIP

### Modifier les templates de cartes HA

- `ha-integration/templates/` : fichiers YAML de templates
- `routes/exports.py` → `ha-dashboard-card` : génération dynamique

---

> **Dernière mise à jour** : Mars 2026
