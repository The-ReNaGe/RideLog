"""
Contrôle d'accès aux véhicules — point de passage unique.

Avant ce module, la question « cet appelant a-t-il le droit de voir ce
véhicule ? » était réécrite à la main dans 28 endroits répartis sur six
fichiers de routes. Toute évolution de la règle devait donc être appliquée 28
fois, et un seul oubli produisait soit une fuite de données, soit une
fonctionnalité morte — sans que rien ne le signale.

Les quatre fonctions ci-dessous sont désormais le SEUL endroit où cette règle
est écrite. Une nouvelle forme de partage ne doit jamais être ajoutée dans une
route : elle s'ajoute ici, et toutes les routes en héritent.

---

Deux niveaux d'accès, qui reproduisent exactement le comportement historique :

    LECTURE (`readable`)  propriétaire, ou compte d'intégration Home Assistant
    ÉCRITURE (`owned`)    propriétaire uniquement

Le compte d'intégration (`is_integration_account`) voit les véhicules de tous
les utilisateurs, mais n'a jamais pu en modifier un : il alimente des capteurs,
il ne saisit pas d'entretien. Cette asymétrie était déjà celle du code, elle
est simplement nommée ici.

---

Trois routes de LECTURE utilisent volontairement `owned` plutôt que
`readable`, et sont donc invisibles au compte Home Assistant :

    get_planning            (vehicles.py)      GET /vehicles/planning
    get_dashboard           (dashboard.py)     GET /dashboard
    get_interval_overrides  (maintenances.py)  GET .../interval-overrides

C'est le comportement d'origine, conservé tel quel : ce module a été introduit
par un refactor à comportement constant, dont ce n'était pas le rôle de
trancher. Si l'on veut un jour les exposer à Home Assistant, c'est un choix
délibéré à faire — pas un détail à corriger au passage.
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import User, Vehicle

# Message volontairement identique pour « n'existe pas » et « pas à vous » :
# distinguer les deux révélerait l'existence des véhicules d'autrui.
_NOT_FOUND = "Vehicle not found"


def get_owned_vehicle(vehicle_id: int, current_user: User, db: Session) -> Vehicle:
    """
    Véhicule dont l'appelant est PROPRIÉTAIRE, sinon 404.

    À utiliser dès qu'une route écrit : création, modification ou suppression
    d'un entretien, d'un plein, d'une photo, d'un intervalle personnalisé.
    """
    vehicle = (
        db.query(Vehicle)
        .filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id)
        .first()
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return vehicle


def get_readable_vehicle(vehicle_id: int, current_user: User, db: Session) -> Vehicle:
    """
    Véhicule que l'appelant a le droit de CONSULTER, sinon 404.

    Propriétaire, ou compte d'intégration Home Assistant.
    """
    query = db.query(Vehicle).filter(Vehicle.id == vehicle_id)
    if not current_user.is_integration_account:
        query = query.filter(Vehicle.user_id == current_user.id)

    vehicle = query.first()
    if not vehicle:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return vehicle


def require_owned_vehicle(vehicle_id: int, current_user: User, db: Session) -> None:
    """
    Exige que l'appelant soit PROPRIÉTAIRE du véhicule, sinon 404.

    Même contrôle que `get_owned_vehicle`, pour les routes qui n'ont aucun
    usage de l'objet retourné et ne s'en servent que comme garde-fou.

    Cette forme existe pour une raison précise : écrit `vehicle = get_owned_
    vehicle(...)` sans jamais relire `vehicle`, l'appel ressemble à une ligne
    morte. Un contributeur pressé — ou un correcteur automatique de linter — la
    supprime, et c'est le contrôle d'accès qui disparaît, sans qu'aucun test
    fonctionnel ne rougisse. Le nom dit ici que l'effet EST le contrôle.
    """
    get_owned_vehicle(vehicle_id, current_user, db)


def require_readable_vehicle(vehicle_id: int, current_user: User, db: Session) -> None:
    """
    Exige que l'appelant puisse CONSULTER le véhicule, sinon 404.

    Pendant de `require_owned_vehicle` pour les routes de lecture — même
    raison d'être.
    """
    get_readable_vehicle(vehicle_id, current_user, db)


def list_owned_vehicles(current_user: User, db: Session) -> list[Vehicle]:
    """Véhicules appartenant à l'appelant, lui seul."""
    return db.query(Vehicle).filter(Vehicle.user_id == current_user.id).all()


def list_readable_vehicles(current_user: User, db: Session) -> list[Vehicle]:
    """Véhicules que l'appelant a le droit de consulter."""
    if current_user.is_integration_account:
        return db.query(Vehicle).all()
    return db.query(Vehicle).filter(Vehicle.user_id == current_user.id).all()
