"""Réglages d'instance persistés en base.

Pourquoi ce module
──────────────────
`REGISTRATION_MODE` (config.py) et `_ha_integration_enabled` (routes/auth.py)
sont des variables module-level : modifiables à chaud par l'admin, mais
**réinitialisées au prochain démarrage**. C'est déjà documenté comme un piège
côté tests (§19). Pour le pays, ce comportement serait franchement mauvais :
une instance configurée sur un autre pays repasserait en France au premier
`docker compose up -d`, en silence, et l'admin ne s'en apercevrait qu'en
saisissant une plaque.

Ce module lit et écrit `app_settings`, une simple table clé/valeur.

Ordre de priorité, du plus fort au plus faible
──────────────────────────────────────────────
    1. la valeur choisie dans l'interface (base)
    2. la variable d'environnement `REGION`
    3. la France

Le niveau 2 est ce qui rend la reprise indolore : une instance qui tourne
aujourd'hui avec `REGION=FR` dans son `.env` n'a rien à faire, et son `.env`
continue de décider tant que personne n'a touché au réglage dans l'interface.
"""

import logging

from sqlalchemy.orm import Session

from models import AppSetting
from regions import DEFAULT_REGION_CODE, Region, get_region, is_known_region

logger = logging.getLogger(__name__)

REGION_KEY = "region"


def get_setting(db: Session, key: str) -> str | None:
    """Valeur brute d'un réglage, ou None s'il n'a jamais été posé."""
    row = db.get(AppSetting, key)
    return row.value if row else None


def set_setting(db: Session, key: str, value: str | None) -> None:
    """Pose ou remplace un réglage. Commit compris — l'appelant n'a rien à faire."""
    row = db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value
    db.commit()


def get_active_region_code(db: Session) -> str:
    """Code du pays actif, en appliquant l'ordre de priorité du docstring.

    Un code stocké qui ne correspond à aucun pays connu est ignoré plutôt que
    de faire échouer la requête : c'est le cas d'un retour à une image plus
    ancienne, où `regions/be.py` n'existe pas encore. L'instance retombe alors
    sur la France et le dit dans les logs, au lieu de renvoyer une erreur sur
    chaque décodage de plaque.
    """
    stored = get_setting(db, REGION_KEY)
    if stored:
        if is_known_region(stored):
            return stored.strip().upper()
        logger.warning(
            "Pays enregistré inconnu de cette version (%r) — repli sur %s",
            stored, DEFAULT_REGION_CODE,
        )
    return get_region().code


def get_active_region(db: Session) -> Region:
    """Le pays actif lui-même, prêt à lire une plaque."""
    return get_region(get_active_region_code(db))


# ═══════════════════════════════════════════════════════════════════════════
# Préférences effectives d'un compte
# ═══════════════════════════════════════════════════════════════════════════

def effective_preferences(db: Session, user) -> dict:
    """Ce que l'interface doit réellement appliquer pour ce compte.

    Deux niveaux, et la distinction compte :

        user.language / user.units   ce que la personne a explicitement choisi
        région active                ce qui s'applique tant qu'elle n'a rien dit

    `NULL` côté compte n'est donc PAS « veut du français » : c'est « n'a rien
    demandé ». Un utilisateur qui n'a jamais touché à ses préférences suit le
    pays de l'instance — et suivra automatiquement le nouveau pays si l'admin
    en change, ce qui est le comportement attendu. Celui qui a choisi garde
    son choix quoi qu'il arrive au pays.

    Renvoyé par `/auth/me` plutôt que calculé côté frontend : ce dernier
    devrait sinon appeler `/regions` à chaque démarrage juste pour connaître
    un défaut.
    """
    region = get_active_region(db)
    return {
        "region": region.code,
        "language": user.language or region.default_language,
        "units": user.units or region.default_units,
    }
