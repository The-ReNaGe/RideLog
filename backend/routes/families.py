"""
Groupes famille — création, membres et invitations.

Le partage lui-même n'est PAS ici : il vit dans `routes/access.py`, point de
passage unique du contrôle d'accès aux véhicules. Ce module ne gère que
l'appartenance — qui est dans quel groupe. La séparation est volontaire :
une règle de visibilité écrite à deux endroits finit toujours par diverger.

Sur les invitations
───────────────────
Une invitation de groupe réutilise la table `invitations` existante, avec
`family_id` renseigné. Elle sert deux cas d'un même lien :

  - la personne a déjà un compte  → POST /family/join
  - la personne n'en a pas encore → inscription ordinaire, puis rattachement
                                     automatique au groupe

Le second cas passe par `register()`, qui applique déjà `REGISTRATION_MODE`
sans que ce module ait à s'en mêler : en mode `closed` l'inscription est
refusée, donc un lien de groupe n'y sert qu'à un compte existant.

⚠️ Conséquence à connaître : en mode `invite`, créer un compte sur l'instance
n'était possible qu'à un administrateur. Un utilisateur ordinaire peut
désormais émettre un lien qui le permet, pour son groupe. C'est le sens même
d'« inviter sa famille », mais c'est bien un élargissement de qui peut faire
entrer quelqu'un — d'où le plafond ci-dessous.
"""

import logging
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from models import Family, FamilyMember, Invitation, User, get_db
from security import get_current_user

logger = logging.getLogger("ridelog.families")
router = APIRouter(prefix="/family", tags=["families"])

# Plafond de liens en attente pour un même groupe. Borne ce qu'un compte
# compromis peut faire sans gêner l'usage normal : un foyer n'invite pas dix
# personnes à la fois.
MAX_PENDING_INVITATIONS = 10


class CreateFamilyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class RenameFamilyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class CreateFamilyInvitationRequest(BaseModel):
    expires_hours: int = Field(default=168, ge=1, le=720)


class JoinFamilyRequest(BaseModel):
    token: str = Field(..., min_length=1)


# ── Helpers ─────────────────────────────────────────────────────────────────

def _membership(user: User, db: Session) -> FamilyMember | None:
    return db.query(FamilyMember).filter(FamilyMember.user_id == user.id).first()


def _require_membership(user: User, db: Session) -> FamilyMember:
    membership = _membership(user, db)
    if not membership:
        raise HTTPException(status_code=404, detail="Vous n'appartenez à aucun groupe famille")
    return membership


def _require_ownership(user: User, db: Session) -> FamilyMember:
    membership = _require_membership(user, db)
    if membership.role != "owner":
        raise HTTPException(
            status_code=403,
            detail="Seul le créateur du groupe peut effectuer cette action",
        )
    return membership


def _pending_invitations(family_id: int, db: Session) -> list[Invitation]:
    """Invitations du groupe encore utilisables : ni consommées, ni expirées."""
    now = datetime.utcnow()
    rows = (
        db.query(Invitation)
        .filter(Invitation.family_id == family_id, Invitation.used_by.is_(None))
        .order_by(Invitation.created_at.desc())
        .all()
    )
    return [inv for inv in rows if _expiry_of(inv) > now]


def _expiry_of(invitation: Invitation) -> datetime:
    """Date d'expiration comparable — SQLite stocke des datetimes naïfs."""
    expires = invitation.expires_at
    return expires.replace(tzinfo=None) if expires.tzinfo else expires


def _validate_family_invitation(token: str, db: Session) -> Invitation:
    """
    Invitation de groupe utilisable, sinon une erreur explicite.

    Contrairement au contrôle d'accès aux véhicules, distinguer ici les motifs
    est sans risque : celui qui présente le jeton le détient déjà, et savoir
    qu'il a expiré plutôt qu'il n'existe pas ne lui apprend rien qu'il ne
    puisse déduire. Ça lui évite en revanche de chercher longtemps.
    """
    invitation = db.query(Invitation).filter(Invitation.token == token).first()
    if not invitation or invitation.family_id is None:
        raise HTTPException(status_code=404, detail="Invitation invalide")
    if invitation.used_by is not None:
        raise HTTPException(status_code=410, detail="Invitation déjà utilisée")
    if _expiry_of(invitation) < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Invitation expirée")
    if not db.query(Family).filter(Family.id == invitation.family_id).first():
        raise HTTPException(status_code=410, detail="Ce groupe n'existe plus")
    return invitation


def _serialize(family: Family, db: Session) -> dict:
    members = (
        db.query(FamilyMember)
        .filter(FamilyMember.family_id == family.id)
        .order_by(FamilyMember.joined_at.asc())
        .all()
    )
    payload = family.to_dict()
    payload["members"] = [m.to_dict() for m in members]
    return payload


# ── Le groupe ───────────────────────────────────────────────────────────────

@router.get("")
def get_my_family(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Groupe de l'appelant, ou `{"family": null}` s'il n'en a pas."""
    membership = _membership(current_user, db)
    if not membership:
        return {"family": None}

    family = db.query(Family).filter(Family.id == membership.family_id).first()
    if not family:
        # Incohérence théorique (cascade cassée) : mieux vaut la signaler comme
        # « pas de groupe » que renvoyer une 500 à l'ouverture des paramètres.
        logger.warning(
            "Appartenance orpheline : user=%d family=%d",
            current_user.id, membership.family_id,
        )
        return {"family": None}

    return {"family": _serialize(family, db), "role": membership.role}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_family(
    data: CreateFamilyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if _membership(current_user, db):
        raise HTTPException(
            status_code=409,
            detail="Vous appartenez déjà à un groupe. Quittez-le avant d'en créer un autre.",
        )

    family = Family(name=data.name.strip(), created_by=current_user.id)
    db.add(family)
    db.flush()
    db.add(FamilyMember(family_id=family.id, user_id=current_user.id, role="owner"))
    db.commit()
    db.refresh(family)

    logger.info("Groupe famille %d créé par %s", family.id, current_user.username)
    return {"family": _serialize(family, db), "role": "owner"}


@router.patch("")
def rename_family(
    data: RenameFamilyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = _require_ownership(current_user, db)
    family = db.query(Family).filter(Family.id == membership.family_id).first()
    family.name = data.name.strip()
    db.commit()
    db.refresh(family)
    return {"family": _serialize(family, db), "role": membership.role}


@router.post("/leave")
def leave_family(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Quitte son groupe. La visibilité des véhicules des autres est retirée
    immédiatement — la règle d'accès relit l'appartenance à chaque requête.

    Si le créateur part alors que d'autres restent, la propriété passe au plus
    ancien membre restant : un groupe sans propriétaire ne pourrait plus être
    ni renommé, ni dissous, ni géré.
    """
    membership = _require_membership(current_user, db)
    family_id = membership.family_id

    db.delete(membership)
    db.flush()

    remaining = (
        db.query(FamilyMember)
        .filter(FamilyMember.family_id == family_id)
        .order_by(FamilyMember.joined_at.asc())
        .all()
    )

    if not remaining:
        # Dernier parti : le groupe et ses invitations en attente disparaissent,
        # sinon un lien encore valide ressusciterait un groupe vide.
        db.query(Invitation).filter(Invitation.family_id == family_id).delete()
        db.query(Family).filter(Family.id == family_id).delete()
        db.commit()
        logger.info("Groupe famille %d dissous (dernier membre parti)", family_id)
        return {"left": True, "family_deleted": True}

    if membership.role == "owner":
        remaining[0].role = "owner"
        logger.info(
            "Groupe famille %d : propriété transférée à user=%d",
            family_id, remaining[0].user_id,
        )

    db.commit()
    return {"left": True, "family_deleted": False}


@router.delete("/members/{user_id}")
def remove_member(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retire un membre du groupe. Réservé au créateur."""
    membership = _require_ownership(current_user, db)

    if user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Utilisez « quitter le groupe » pour vous retirer vous-même",
        )

    target = (
        db.query(FamilyMember)
        .filter(
            FamilyMember.family_id == membership.family_id,
            FamilyMember.user_id == user_id,
        )
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Ce membre n'est pas dans votre groupe")

    db.delete(target)
    db.commit()
    logger.info(
        "Groupe famille %d : user=%d retiré par %s",
        membership.family_id, user_id, current_user.username,
    )
    return {"removed": True}


# ── Invitations ─────────────────────────────────────────────────────────────

@router.post("/invitations", status_code=status.HTTP_201_CREATED)
def create_family_invitation(
    data: CreateFamilyInvitationRequest = CreateFamilyInvitationRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = _require_membership(current_user, db)

    if len(_pending_invitations(membership.family_id, db)) >= MAX_PENDING_INVITATIONS:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Trop d'invitations en attente ({MAX_PENDING_INVITATIONS} maximum). "
                "Révoquez celles qui ne servent plus."
            ),
        )

    invitation = Invitation(
        token=secrets.token_urlsafe(32),
        created_by=current_user.id,
        family_id=membership.family_id,
        expires_at=datetime.utcnow() + timedelta(hours=data.expires_hours),
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)

    logger.info(
        "Invitation de groupe %d créée par %s (expire dans %dh)",
        membership.family_id, current_user.username, data.expires_hours,
    )
    return invitation.to_dict()


@router.get("/invitations")
def list_family_invitations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = _require_membership(current_user, db)
    return [inv.to_dict() for inv in _pending_invitations(membership.family_id, db)]


@router.delete("/invitations/{invitation_id}")
def revoke_family_invitation(
    invitation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = _require_membership(current_user, db)

    invitation = (
        db.query(Invitation)
        .filter(
            Invitation.id == invitation_id,
            # Restreint au groupe de l'appelant : sans ce filtre, n'importe quel
            # membre d'un groupe pourrait révoquer les invitations d'un autre,
            # y compris celles émises par un administrateur.
            Invitation.family_id == membership.family_id,
        )
        .first()
    )
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation non trouvée")

    db.delete(invitation)
    db.commit()
    return {"revoked": True}


@router.post("/join")
def join_family(
    data: JoinFamilyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rejoint un groupe avec un lien d'invitation, pour un compte existant."""
    if _membership(current_user, db):
        raise HTTPException(
            status_code=409,
            detail="Vous appartenez déjà à un groupe. Quittez-le avant d'en rejoindre un autre.",
        )

    invitation = _validate_family_invitation(data.token, db)

    db.add(
        FamilyMember(
            family_id=invitation.family_id, user_id=current_user.id, role="member"
        )
    )
    invitation.used_by = current_user.id
    invitation.used_at = datetime.utcnow()
    db.commit()

    family = db.query(Family).filter(Family.id == invitation.family_id).first()
    logger.info(
        "Groupe famille %d : %s a rejoint", invitation.family_id, current_user.username
    )
    return {"family": _serialize(family, db), "role": "member"}
