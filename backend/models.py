from datetime import datetime, timezone
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean, JSON
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from typing import Optional
import os

Base = declarative_base()


class User(Base):
    """
    Modèle d'utilisateur local avec authentification sécurisée.
    
    Sécurité:
    - password_hash: Hachage bcrypt, jamais le mot de passe en clair
    - username: Unique, utilisé pour login
    - display_name: Affiché dans l'UI (ex: "Toto" → "Garage de Toto")
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), nullable=False, unique=True, index=True)
    display_name = Column(String(100), nullable=False)  # Affiché dans l'app
    password_hash = Column(String(255), nullable=False)  # bcrypt hash
    is_admin = Column(Boolean, default=False)  # Premier user = admin
    is_integration_account = Column(Boolean, default=False)  # Compte spécial (homeassistant) - accès à tous les véhicules
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    password_changed_at = Column(DateTime, nullable=True)  # Invalide les JWT émis avant ce changement (voir security.py)
    must_change_password = Column(Boolean, default=False)  # True après un mot de passe créé/reset par un admin
    password_reset_requested_at = Column(DateTime, nullable=True)  # Demande de reset initiée par l'utilisateur (login)

    # Relation: Un utilisateur peut avoir plusieurs véhicules
    vehicles = relationship("Vehicle", back_populates="owner", cascade="all, delete-orphan")
    webhooks = relationship("Webhook", back_populates="owner", cascade="all, delete-orphan")

    def to_dict(self, include_password=False):
        """Sérialisation sans exposer le hash du mot de passe."""
        data = {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name,
            "is_admin": self.is_admin,
            "is_integration_account": self.is_integration_account,
            "created_at": self.created_at.isoformat(),
            "must_change_password": bool(self.must_change_password),
            "password_reset_requested_at": self.password_reset_requested_at.isoformat() if self.password_reset_requested_at else None,
        }
        if include_password:
            data["password_hash"] = self.password_hash
        return data


class Family(Base):
    """
    Groupe « famille » — un foyer qui partage la consultation de ses véhicules.

    Le partage est en LECTURE SEULE : un membre voit les véhicules des autres,
    leur historique et leurs échéances, mais seul le propriétaire d'un véhicule
    peut y enregistrer un entretien, un plein, ou modifier quoi que ce soit.
    La règle elle-même vit dans `routes/access.py`, point de passage unique.
    """
    __tablename__ = "families"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    members = relationship(
        "FamilyMember", back_populates="family", cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat(),
            "members": [m.to_dict() for m in self.members],
        }


class FamilyMember(Base):
    """
    Appartenance d'un utilisateur à un groupe famille.

    Un utilisateur n'appartient qu'à UN SEUL groupe à la fois : c'est ce que
    garantit l'unicité posée sur `user_id` seul, et non sur le couple
    (family_id, user_id).

    Ce n'est pas une limitation arbitraire. Autoriser plusieurs groupes rendrait
    la visibilité transitive : deux foyers sans aucun lien se verraient
    mutuellement dès qu'une personne appartiendrait aux deux, sans que personne
    ne l'ait voulu ni ne puisse le constater. Rejoindre un autre groupe suppose
    donc de quitter le sien.
    """
    __tablename__ = "family_members"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=False, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id"), nullable=False, index=True, unique=True
    )
    role = Column(String(20), nullable=False, default="member")  # owner | member
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    family = relationship("Family", back_populates="members")
    user = relationship("User")

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "username": self.user.username if self.user else None,
            "display_name": self.user.display_name if self.user else None,
            "role": self.role,
            "joined_at": self.joined_at.isoformat() if self.joined_at else None,
        }


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    vehicle_type = Column(String(50), nullable=False)  # car, motorcycle
    brand = Column(String(100), nullable=False)
    model = Column(String(100), nullable=False)
    year = Column(Integer, nullable=False)
    registration_date = Column(DateTime, nullable=True)  # Date de mise en circulation
    motorization = Column(String(50), nullable=False)  # essence/diesel/hybrid/electric/thermal
    displacement = Column(Integer, nullable=True)  # cc: mandatory for moto, optional for car
    range_category = Column(String(50), nullable=False)  # accessible/generalist/premium
    current_mileage = Column(Integer, nullable=False, default=0)
    purchase_price = Column(Float, nullable=True)
    service_interval_km = Column(Integer, nullable=True)  # Custom service interval (overrides brand default)
    service_interval_months = Column(Integer, nullable=True)  # Custom service interval months
    photo_path = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    # Exclut ce véhicule du partage famille. Le propriétaire le voit toujours ;
    # les autres membres du groupe ne le voient jamais. Sans groupe famille,
    # ce drapeau n'a aucun effet.
    is_private = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Relations
    owner = relationship("User", back_populates="vehicles")
    maintenances = relationship("Maintenance", back_populates="vehicle", cascade="all, delete-orphan")
    fuel_logs = relationship("FuelLog", cascade="all, delete-orphan")
    maintenance_overrides = relationship("VehicleMaintenanceOverride", back_populates="vehicle", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "vehicle_type": self.vehicle_type,
            "brand": self.brand,
            "model": self.model,
            "year": self.year,
            "registration_date": self.registration_date.isoformat() if self.registration_date else None,
            "motorization": self.motorization,
            "displacement": self.displacement,
            "range_category": self.range_category,
            "current_mileage": self.current_mileage,
            "purchase_price": self.purchase_price,
            "service_interval_km": self.service_interval_km,
            "service_interval_months": self.service_interval_months,
            "photo_url": f"/api/vehicles/{self.id}/photo" if self.photo_path else None,
            "notes": self.notes,
            "is_private": bool(self.is_private),
            # Le front en a besoin pour distinguer un véhicule consulté via le
            # groupe famille du sien propre, et masquer les actions d'écriture
            # qui échoueraient de toute façon en 404.
            "owner_id": self.user_id,
            "owner_display_name": self.owner.display_name if self.owner else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class VehicleMaintenanceOverride(Base):
    """
    Surcharge des intervalles de maintenance par véhicule.
    
    Permet à l'utilisateur de personnaliser km_interval et/ou months_interval
    pour une intervention donnée, indépendamment des valeurs du JSON global.
    
    - Si km_interval est NULL et is_km_disabled=True  → critère km désactivé
    - Si months_interval est NULL et is_months_disabled=True → critère temps désactivé
    - L'override prime TOUJOURS sur le JSON quand il existe pour cette clé.
    """
    __tablename__ = "vehicle_maintenance_overrides"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False, index=True)
    # Clé technique de l'intervention (ex: "fork_service", "oil_change", "brake_fluid")
    intervention_key = Column(String(200), nullable=False)
    # Intervalles surchargés (NULL = utiliser la valeur par défaut du JSON si non désactivé)
    km_interval = Column(Integer, nullable=True)
    months_interval = Column(Integer, nullable=True)
    # Flags de désactivation explicite (distingue "pas de valeur" de "désactivé volontairement")
    is_km_disabled = Column(Boolean, default=False, nullable=False)
    is_months_disabled = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    vehicle = relationship("Vehicle", back_populates="maintenance_overrides")

    def to_dict(self):
        return {
            "id": self.id,
            "vehicle_id": self.vehicle_id,
            "intervention_key": self.intervention_key,
            "km_interval": self.km_interval,
            "months_interval": self.months_interval,
            "is_km_disabled": self.is_km_disabled,
            "is_months_disabled": self.is_months_disabled,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class Maintenance(Base):
    __tablename__ = "maintenances"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    intervention_type = Column(String(200), nullable=False)  # Libellé affiché (français)
    # Clé technique stable (oil_change_moto, brake_fluid…). C'est elle qui fait
    # foi pour les calculs d'échéance ; `intervention_type` n'est plus qu'un
    # libellé d'affichage. Nullable : les lignes antérieures à la migration 007
    # et celles écrites par une version plus ancienne restent lisibles, le code
    # retombe alors sur la traduction du libellé.
    intervention_key = Column(String(100), nullable=True, index=True)
    execution_date = Column(DateTime, nullable=False)
    mileage_at_intervention = Column(Integer, nullable=False)
    cost_paid = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    maintenance_category = Column(String(50), default="scheduled", nullable=False)  # scheduled, repair
    other_description = Column(String(200), nullable=True)  # Custom title for 'Autre' intervention type
    sub_interventions = Column(JSON, nullable=True)  # Liste des interventions détaillées (checklist révision)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    vehicle = relationship("Vehicle", back_populates="maintenances")
    invoices = relationship("MaintenanceInvoice", back_populates="maintenance", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "vehicle_id": self.vehicle_id,
            "intervention_type": self.intervention_type,
            "intervention_key": self.intervention_key,
            "execution_date": self.execution_date.isoformat(),
            "mileage_at_intervention": self.mileage_at_intervention,
            "cost_paid": self.cost_paid,
            "notes": self.notes,
            "maintenance_category": self.maintenance_category,
            "other_description": self.other_description,
            "sub_interventions": self.sub_interventions,
            "invoices": [inv.to_dict() for inv in self.invoices],
            "created_at": self.created_at.isoformat(),
        }


class MaintenanceInvoice(Base):
    __tablename__ = "maintenance_invoices"

    id = Column(Integer, primary_key=True, index=True)
    maintenance_id = Column(Integer, ForeignKey("maintenances.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    maintenance = relationship("Maintenance", back_populates="invoices")

    def to_dict(self):
        return {
            "id": self.id,
            "maintenance_id": self.maintenance_id,
            "filename": self.filename,
            "file_path": self.file_path,
            "mime_type": self.mime_type,
            "file_size": self.file_size,
            "uploaded_at": self.uploaded_at.isoformat(),
        }


class FuelLog(Base):
    __tablename__ = "fuel_logs"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False, index=True)
    fill_date = Column(DateTime, nullable=False)
    mileage_at_fill = Column(Integer, nullable=False)
    liters = Column(Float, nullable=True)
    total_cost = Column(Float, nullable=False)
    price_per_liter = Column(Float, nullable=True)
    station = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "vehicle_id": self.vehicle_id,
            "fill_date": self.fill_date.isoformat(),
            "mileage_at_fill": self.mileage_at_fill,
            "liters": self.liters,
            "total_cost": self.total_cost,
            "price_per_liter": self.price_per_liter,
            "station": self.station,
            "notes": self.notes,
            "created_at": self.created_at.isoformat(),
        }


class Webhook(Base):
    __tablename__ = "webhooks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    url = Column(String(500), nullable=False)
    webhook_type = Column(String(50), default="discord")
    token_secret = Column(String(64), nullable=False, unique=True, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owner = relationship("User")

    def to_dict(self, include_token=False):
        data = {
            "id": self.id,
            "url": self.url[:50] + "..." if len(self.url) > 50 else self.url,
            "webhook_type": self.webhook_type,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat(),
        }
        if include_token:
            data["token_secret"] = self.token_secret
        return data


class VehicleEstimate(Base):
    __tablename__ = "vehicle_estimates"

    id = Column(Integer, primary_key=True, index=True)
    brand = Column(String(100), nullable=False, index=True)
    model = Column(String(100), nullable=False)
    year = Column(Integer, nullable=False)
    estimate_min = Column(Float, nullable=False)
    estimate_max = Column(Float, nullable=False)
    mileage_bracket_min = Column(Integer, nullable=True)
    mileage_bracket_max = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "brand": self.brand,
            "model": self.model,
            "year": self.year,
            "estimate_min": self.estimate_min,
            "estimate_max": self.estimate_max,
            "mileage_bracket_min": self.mileage_bracket_min,
            "mileage_bracket_max": self.mileage_bracket_max,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class NotificationLog(Base):
    __tablename__ = "notification_logs"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False, index=True)
    intervention_key = Column(String(200), nullable=False)
    notification_type = Column(String(50), nullable=False)
    sent_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Invitation(Base):
    """Invitation links for new user registration."""
    __tablename__ = "invitations"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), nullable=False, unique=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    used_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Invitation à rejoindre un groupe famille. NULL = invitation d'inscription
    # ordinaire, créée par un admin — le comportement d'origine, inchangé.
    family_id = Column(Integer, ForeignKey("families.id"), nullable=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    used_at = Column(DateTime, nullable=True)

    creator = relationship("User", foreign_keys=[created_by])

    def to_dict(self):
        # Compare as naive UTC datetimes (SQLite stores naive)
        now_utc = datetime.utcnow()
        expires = self.expires_at if self.expires_at.tzinfo is None else self.expires_at.replace(tzinfo=None)
        return {
            "id": self.id,
            "token": self.token,
            "created_by": self.created_by,
            "creator_username": self.creator.username if self.creator else None,
            "used_by": self.used_by,
            "family_id": self.family_id,
            "expires_at": self.expires_at.isoformat(),
            "created_at": self.created_at.isoformat(),
            "used_at": self.used_at.isoformat() if self.used_at else None,
            "is_expired": now_utc > expires,
            "is_used": self.used_by is not None,
        }


# Database initialization
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./ridelog.db")

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Amène la base au schéma courant.

    Toute la logique vit dans migrations.py : registre versionné, sauvegarde
    préalable, une transaction par migration, refus de démarrer sur une base
    plus récente que le code. Voir §13 de CLAUDE.md.
    """
    from migrations import run_migrations

    run_migrations(engine, lambda: Base.metadata.create_all(bind=engine))
