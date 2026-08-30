"""Devises : le catalogue, et la conversion explicite.

Deux choses vivent ici, et elles ne se ressemblent pas.

**Le catalogue** (`CURRENCIES`) dit comment écrire un montant. Volontairement
une liste courte, vérifiée à la main, et non un référentiel ISO complet : cent
quatre-vingts lignes non relues donneraient surtout cent quatre-vingts façons
de se tromper de symbole.

**La conversion** (`convert_instance_amounts`) est une opération ponctuelle,
déclenchée par un administrateur, avec un taux qu'il fournit lui-même.

Pourquoi le taux vient de l'humain
──────────────────────────────────
Un taux automatique supposerait un service externe, et surtout un taux **à la
date de chaque ligne** : le plein de mars et celui de novembre n'ont pas été
payés au même cours. Sans ça, une conversion « automatique » est déjà
approximative — autant que celle-ci, mais en prétendant le contraire, et en
faisant bouger l'historique tout seul entre deux consultations.

Ici l'administrateur pose un taux, voit ce qu'il va toucher avant de valider,
et une sauvegarde est prise. C'est une opération que l'on assume, pas un effet
de bord d'un menu déroulant.

Pourquoi la conversion n'est PAS déclenchée par le changement de devise
───────────────────────────────────────────────────────────────────────
Changer la devise d'affichage et convertir l'historique sont deux intentions
différentes :

    « je me suis trompé de symbole »        → changer la devise, rien d'autre
    « j'ai déménagé, je repars en dollars » → convertir, puis changer

Les fondre en une seule commande obligerait à deviner laquelle. Et le premier
cas est de loin le plus fréquent — le convertir silencieusement abîmerait
l'historique d'un utilisateur venu corriger un détail d'affichage.

C'est pourquoi chaque montant porte la devise dans laquelle il a été saisi
(`maintenances.currency`, `fuel_logs.currency`, `vehicles.currency`) : sans ce
marquage, une révision payée 200 $ redeviendrait « 200 € » au premier
changement de réglage, et plus rien ne permettrait de savoir laquelle des deux
phrases est vraie.
"""

import logging

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

CURRENCIES = {
    "EUR": {"code": "EUR", "symbol": "€", "name": "Euro"},
    "USD": {"code": "USD", "symbol": "$", "name": "Dollar américain"},
}

DEFAULT_CURRENCY = "EUR"

# Bornes du taux. Un taux nul ou négatif n'a pas de sens ; au-delà de 100 000
# on est plus probablement devant une faute de frappe que devant le forint.
MIN_RATE = 1e-6
MAX_RATE = 100_000.0


def is_known_currency(code: str | None) -> bool:
    return bool(code) and code.strip().upper() in CURRENCIES


def symbol_of(code: str | None) -> str:
    """Symbole d'une devise, avec repli sur celui de l'euro."""
    entry = CURRENCIES.get((code or "").strip().upper())
    return entry["symbol"] if entry else CURRENCIES[DEFAULT_CURRENCY]["symbol"]


def convert_amount(amount: float | None, rate: float, decimals: int = 2) -> float | None:
    """Un montant converti, ou None si l'original était vide.

    `decimals` vaut 2 pour un montant et 3 pour un prix au litre — c'est
    l'arrondi que le reste du code applique déjà à ces deux grandeurs.
    """
    if amount is None:
        return None
    return round(float(amount) * rate, decimals)


def stamp_unmarked_amounts(db: Session, currency: str) -> dict[str, int]:
    """Fige la devise des lignes qui n'en portaient pas encore.

    Appelé **avant** de changer la devise d'affichage de l'instance. Sans ce
    geste, tout ce qui a été saisi avant le marquage suivrait le nouveau
    symbole : une révision payée 200 € s'afficherait « 200 $ » sans que rien
    ne l'indique.

    Une ligne sans marquage a toujours été affichée avec le symbole en vigueur
    jusqu'ici — c'est donc bien celui-là qu'il faut écrire, au dernier moment
    où on le connaît encore.
    """
    from models import FuelLog, Maintenance, Vehicle

    counts = {}
    for name, model in (
        ("maintenances", Maintenance),
        ("fuel_logs", FuelLog),
        ("vehicles", Vehicle),
    ):
        query = db.query(model).filter(model.currency.is_(None))
        if model is Vehicle:
            query = query.filter(Vehicle.purchase_price.isnot(None))
        counts[name] = query.update({model.currency: currency}, synchronize_session=False)
    db.commit()
    logger.info("Devise %s figée sur les montants non marqués : %s", currency, counts)
    return counts


def totals_by_currency(rows, attribute: str, fallback: str) -> dict[str, float]:
    """Le total d'un ensemble de lignes, VENTILÉ PAR DEVISE.

    Un seul nombre ne peut pas dire la vérité sur un historique à deux
    monnaies : additionner 200 € et 200 $ pour afficher « 400 » est faux, et
    faux en silence — c'est le genre de chiffre qu'on ne recompte jamais.

    La phrase vraie est « j'ai dépensé 1 200 € et 300 $ », et c'est ce que
    renvoie cette fonction. L'interface affiche un seul montant dans le cas
    courant (une seule devise) et deux lignes dans l'autre, sans jamais poser
    un symbole au hasard sur une somme mêlée.

    Le cas existe pour de vrai : changer de devise sans convertir est
    légitime — on a déménagé et on saisit désormais en dollars, sans vouloir
    réécrire l'historique européen.

    `fallback` sert aux lignes non marquées, antérieures au marquage : elles
    ont toujours été affichées avec le symbole de l'instance.
    """
    totals: dict[str, float] = {}
    for row in rows:
        amount = getattr(row, attribute, None)
        if not amount:
            continue
        code = (getattr(row, "currency", None) or fallback).upper()
        totals[code] = totals.get(code, 0.0) + float(amount)
    return {code: round(value, 2) for code, value in sorted(totals.items())}


def merge_totals(*totals: dict[str, float]) -> dict[str, float]:
    """Fusionne plusieurs ventilations — entretiens + carburant, par exemple."""
    merged: dict[str, float] = {}
    for block in totals:
        for code, value in block.items():
            merged[code] = merged.get(code, 0.0) + value
    return {code: round(value, 2) for code, value in sorted(merged.items())}


# ═══════════════════════════════════════════════════════════════════════════
# Conversion de l'instance
# ═══════════════════════════════════════════════════════════════════════════

def _rows_to_convert(db: Session, source: str):
    """Les lignes portant `source`, ou aucune devise.

    ⚠️ **Une devise absente compte comme la devise source.** `NULL` désigne
    une ligne écrite avant que le marquage existe : elle a toujours été
    affichée avec le symbole de l'instance, donc elle a été saisie dans cette
    devise-là. L'exclure laisserait tout l'historique antérieur non converti,
    mélangé au reste, et l'utilisateur n'aurait aucun moyen de le rattraper.
    """
    from models import FuelLog, Maintenance, Vehicle

    def pick(model):
        return db.query(model).filter(
            (model.currency == source) | (model.currency.is_(None))
        ).all()

    return {
        "maintenances": pick(Maintenance),
        "fuel_logs": pick(FuelLog),
        # Seuls les véhicules qui portent un prix d'achat : marquer les autres
        # d'une devise reviendrait à dire quelque chose d'un montant absent.
        "vehicles": [v for v in pick(Vehicle) if v.purchase_price is not None],
    }


def preview_conversion(db: Session, source: str) -> dict[str, int]:
    """Ce qu'une conversion toucherait, sans rien toucher."""
    rows = _rows_to_convert(db, source)
    return {name: len(items) for name, items in rows.items()}


def convert_instance_amounts(db: Session, source: str, target: str, rate: float) -> dict[str, int]:
    """Convertit tous les montants de `source` vers `target`, au taux donné.

    Les lignes déjà marquées d'une **troisième** devise ne sont pas touchées :
    le taux fourni vaut pour un couple, pas pour toutes les monnaies du monde.
    Elles gardent leur marquage et resteront affichées telles quelles.

    L'appelant est responsable de la sauvegarde préalable et du changement du
    réglage d'instance — les deux vivent dans la route, où l'ordre des
    opérations se lit d'un coup d'œil.
    """
    rows = _rows_to_convert(db, source)

    for maintenance in rows["maintenances"]:
        maintenance.cost_paid = convert_amount(maintenance.cost_paid, rate)
        maintenance.currency = target

    for log in rows["fuel_logs"]:
        log.total_cost = convert_amount(log.total_cost, rate)
        # Le prix au litre garde ses trois décimales : à deux, un carburant à
        # 1,799 et un à 1,795 deviendraient le même nombre.
        log.price_per_liter = convert_amount(log.price_per_liter, rate, decimals=3)
        log.currency = target

    for vehicle in rows["vehicles"]:
        vehicle.purchase_price = convert_amount(vehicle.purchase_price, rate)
        vehicle.currency = target

    db.commit()

    counts = {name: len(items) for name, items in rows.items()}
    logger.info(
        "Conversion %s → %s au taux %s : %s",
        source, target, rate, counts,
    )
    return counts
