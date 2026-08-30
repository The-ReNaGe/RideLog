"""
Pays de l'instance — consultation et choix.

Ce que ce module décide, et ce qu'il ne décide pas
──────────────────────────────────────────────────
Il choisit **le pays**, pas la langue. La distinction est celle du §20.1 :
l'interface se traduit, le format d'une plaque et le calendrier du contrôle
technique se *remplacent*. Changer de pays ici ne traduira rien, et traduire
l'interface ne changera pas le pays.

Aujourd'hui le registre ne contient que la France, donc le sélecteur n'offre
qu'un choix. C'est assumé : §20.4 pose qu'on n'abstrait pas sans second cas
réel. Ce qui est fait ici, c'est la *couture* — le jour où `regions/be.py`
existe, il apparaît dans la liste sans qu'aucune route ni aucun écran ne bouge.

Pourquoi la lecture est ouverte à tout utilisateur connecté
───────────────────────────────────────────────────────────
`GET /regions` sert à afficher l'exemple de plaque dans le formulaire véhicule,
que n'importe quel utilisateur remplit. Seule l'écriture est réservée à un
administrateur : le pays vaut pour l'instance entière, pas par utilisateur.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from models import User, get_db
from regions import is_known_region, list_regions
from security import get_current_admin, get_current_user
from currency import (
    CURRENCIES,
    MAX_RATE,
    MIN_RATE,
    convert_instance_amounts,
    preview_conversion,
    stamp_unmarked_amounts,
)
from settings_store import (
    CURRENCY_KEY,
    REGION_KEY,
    get_active_currency,
    get_active_region_code,
    set_setting,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["regions"])


@router.get("/regions")
async def get_regions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pays disponibles, pays actif, et devises proposées."""
    return {
        "active": get_active_region_code(db),
        "regions": list_regions(),
        "currencies": list(CURRENCIES.values()),
        "currency": get_active_currency(db),
    }


class RegionRequest(BaseModel):
    # Seule la forme est bornée ici. L'appartenance au registre est vérifiée
    # dans la route, pour que l'erreur nomme les pays connus au lieu du
    # « string does not match pattern » illisible que rendrait Pydantic.
    code: str = Field(..., min_length=2, max_length=8)


@router.put("/admin/region")
async def set_active_region(
    data: RegionRequest,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Choisit le pays de l'instance.

    Un code inconnu est **refusé**, alors que `get_region()` retomberait sur la
    France : au démarrage, ce repli évite un backend mort ; ici, il ferait
    croire à l'administrateur qu'il a changé de pays alors que rien n'a bougé.
    """
    code = data.code.strip().upper()
    if not is_known_region(code):
        known = ", ".join(r["code"] for r in list_regions())
        raise HTTPException(
            status_code=400,
            detail=f"Pays inconnu : {code}. Pays disponibles : {known}",
        )

    set_setting(db, REGION_KEY, code)
    logger.info("Pays de l'instance changé en %s par %s", code, current_admin.username)
    return {"active": code, "regions": list_regions(), "currencies": list(CURRENCIES.values())}


class CurrencyRequest(BaseModel):
    code: str = Field(..., min_length=3, max_length=3)


@router.put("/admin/currency")
async def set_active_currency(
    data: CurrencyRequest,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Devise d'affichage de l'instance.

    ⚠️ **Ce réglage ne recalcule aucun montant.** Il dit dans quelle devise
    saisir désormais, et quel symbole afficher pour ce qui n'en portait pas.
    Un plein à 60 saisi en euros reste 60 après un passage au dollar — et
    continue d'être affiché « 60 € », parce qu'il est estampillé.

    Convertir est une autre commande, explicite : `POST /admin/currency/convert`,
    avec un taux fourni par l'administrateur. Les deux intentions sont
    différentes — « je m'étais trompé de symbole » et « j'ai déménagé » — et
    les fondre obligerait à deviner laquelle, en abîmant l'historique dans le
    cas le plus fréquent, qui est le premier.

    **Avant de basculer, la devise sortante est figée sur tout ce qui n'était
    pas encore marqué.** C'est le point important : sans ce geste, l'historique
    antérieur au marquage suivrait le nouveau symbole et se mettrait à mentir.
    Après une première bascule, plus aucune ligne n'est ambiguë.

    Réglage d'instance, comme le pays : deux membres d'un même groupe famille
    doivent lire le même nombre avec le même symbole, sinon le partage ment.
    """
    code = data.code.strip().upper()
    if code not in CURRENCIES:
        known = ", ".join(CURRENCIES)
        raise HTTPException(
            status_code=400,
            detail=f"Devise inconnue : {code}. Devises disponibles : {known}",
        )

    outgoing = get_active_currency(db)
    if outgoing != code:
        stamp_unmarked_amounts(db, outgoing)

    set_setting(db, CURRENCY_KEY, code)
    logger.info("Devise de l'instance changée en %s par %s", code, current_admin.username)
    return {"currency": code, "currencies": list(CURRENCIES.values())}


class CurrencyConversionRequest(BaseModel):
    code: str = Field(..., min_length=3, max_length=3)
    # Le taux est fourni par l'administrateur, jamais deviné. Voir currency.py
    # pour le pourquoi — en deux mots : un taux automatique serait tout aussi
    # approximatif qu'un taux saisi, mais prétendrait le contraire.
    rate: float = Field(..., gt=MIN_RATE, le=MAX_RATE)
    # Aperçu par défaut. Une opération irréversible sur tous les montants d'une
    # instance ne doit pas pouvoir partir d'un appel oublié à moitié rempli.
    dry_run: bool = True


@router.post("/admin/currency/convert")
async def convert_currency(
    data: CurrencyConversionRequest,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Convertit tous les montants enregistrés vers une autre devise.

    C'est la commande **explicite** que `PUT /admin/currency` n'est pas : le
    réglage change le symbole, celle-ci recalcule les nombres. Les fondre
    obligerait à deviner laquelle des deux intentions l'administrateur avait,
    et le cas le plus fréquent — corriger un symbole mal réglé — abîmerait
    l'historique sans qu'on l'ait demandé.

    Ordre des opérations, et il compte :

        1. refus si la cible est déjà la devise active (rien à faire)
        2. `dry_run` → on annonce ce qui serait touché, on ne touche rien
        3. sauvegarde de la base, comme avant une migration (§13)
        4. conversion des montants et ré-estampillage
        5. et **seulement alors** le réglage d'instance passe à la cible

    La sauvegarde avant plutôt qu'après : c'est la seule chose qui permet de
    revenir si le taux saisi était faux d'un facteur dix.
    """
    target = data.code.strip().upper()
    if target not in CURRENCIES:
        known = ", ".join(CURRENCIES)
        raise HTTPException(
            status_code=400,
            detail=f"Devise inconnue : {target}. Devises disponibles : {known}",
        )

    source = get_active_currency(db)
    if source == target:
        raise HTTPException(
            status_code=400,
            detail=f"L'instance est déjà en {target} — aucune conversion à faire.",
        )

    if data.dry_run:
        return {
            "dry_run": True,
            "from": source,
            "to": target,
            "rate": data.rate,
            "counts": preview_conversion(db, source),
        }

    # `backup_database` est réutilisé tel quel : il prend un verrou propre via
    # l'API sqlite3.backup et fait tourner les sauvegardes (DB_BACKUP_KEEP).
    from migrations import backup_database
    from models import engine

    backup = backup_database(engine)

    counts = convert_instance_amounts(db, source, target, data.rate)
    set_setting(db, CURRENCY_KEY, target)

    logger.info(
        "Conversion %s → %s (taux %s) par %s : %s",
        source, target, data.rate, current_admin.username, counts,
    )
    return {
        "dry_run": False,
        "from": source,
        "to": target,
        "rate": data.rate,
        "counts": counts,
        "backup": str(backup) if backup else None,
        "currency": target,
        "currencies": list(CURRENCIES.values()),
    }
