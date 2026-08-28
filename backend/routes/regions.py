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
from settings_store import REGION_KEY, get_active_region_code, set_setting

logger = logging.getLogger(__name__)

router = APIRouter(tags=["regions"])


@router.get("/regions")
async def get_regions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pays disponibles et pays actif."""
    return {"active": get_active_region_code(db), "regions": list_regions()}


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
    return {"active": code, "regions": list_regions()}
