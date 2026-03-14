from datetime import datetime, timezone
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean, JSON, inspect, text
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
        }
        if include_password:
            data["password_hash"] = self.password_hash
        return data


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
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Relations
    owner = relationship("User", back_populates="vehicles")
    maintenances = relationship("Maintenance", back_populates="vehicle", cascade="all, delete-orphan")
    fuel_logs = relationship("FuelLog", cascade="all, delete-orphan")

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
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class Maintenance(Base):
    __tablename__ = "maintenances"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    intervention_type = Column(String(200), nullable=False)  # Oil change, Brake fluid, etc.
    execution_date = Column(DateTime, nullable=False)
    mileage_at_intervention = Column(Integer, nullable=False)
    cost_paid = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    maintenance_category = Column(String(50), default="scheduled", nullable=False)  # scheduled, repair
    other_description = Column(String(200), nullable=True)  # Custom title for 'Autre' intervention type
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    vehicle = relationship("Vehicle", back_populates="maintenances")
    invoices = relationship("MaintenanceInvoice", back_populates="maintenance", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "vehicle_id": self.vehicle_id,
            "intervention_type": self.intervention_type,
            "execution_date": self.execution_date.isoformat(),
            "mileage_at_intervention": self.mileage_at_intervention,
            "cost_paid": self.cost_paid,
            "notes": self.notes,
            "maintenance_category": self.maintenance_category,
            "other_description": self.other_description,
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
    Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)

    if "maintenances" in inspector.get_table_names():
        columns = {column["name"] for column in inspector.get_columns("maintenances")}
        with engine.begin() as conn:
            if "invoice_filename" not in columns:
                conn.execute(text("ALTER TABLE maintenances ADD COLUMN invoice_filename VARCHAR(255)"))
            if "invoice_path" not in columns:
                conn.execute(text("ALTER TABLE maintenances ADD COLUMN invoice_path VARCHAR(500)"))
            if "invoice_mime_type" not in columns:
                conn.execute(text("ALTER TABLE maintenances ADD COLUMN invoice_mime_type VARCHAR(100)"))
            if "maintenance_category" not in columns:
                conn.execute(text("ALTER TABLE maintenances ADD COLUMN maintenance_category VARCHAR(50) DEFAULT 'scheduled'"))
            if "other_description" not in columns:
                conn.execute(text("ALTER TABLE maintenances ADD COLUMN other_description VARCHAR(200)"))

    if "vehicles" in inspector.get_table_names():
        columns = {column["name"] for column in inspector.get_columns("vehicles")}
        with engine.begin() as conn:
            if "photo_path" not in columns:
                conn.execute(text("ALTER TABLE vehicles ADD COLUMN photo_path VARCHAR(500)"))
            if "service_interval_km" not in columns:
                conn.execute(text("ALTER TABLE vehicles ADD COLUMN service_interval_km INTEGER"))
            if "service_interval_months" not in columns:
                conn.execute(text("ALTER TABLE vehicles ADD COLUMN service_interval_months INTEGER"))

    if "fuel_logs" not in inspector.get_table_names():
        FuelLog.__table__.create(bind=engine)

    # Migrate fuel_logs to nullable liters/price_per_liter if needed (SQLite workaround)
    if "fuel_logs" in inspector.get_table_names():
        columns = {col["name"]: col for col in inspector.get_columns("fuel_logs")}
        if "liters" in columns and not columns["liters"]["nullable"]:
            # For SQLite, we need to recreate the table to change nullable constraints
            # This is a workaround - in production, use Alembic migrations
            with engine.begin() as conn:
                # Disable foreign key constraints
                conn.execute(text("PRAGMA foreign_keys=OFF"))
                
                # Create new table with nullable columns
                conn.execute(text("""
                    CREATE TABLE fuel_logs_new (
                        id INTEGER PRIMARY KEY,
                        vehicle_id INTEGER NOT NULL,
                        fill_date DATETIME NOT NULL,
                        mileage_at_fill INTEGER NOT NULL,
                        liters FLOAT,
                        total_cost FLOAT NOT NULL,
                        price_per_liter FLOAT,
                        station VARCHAR(255),
                        notes TEXT,
                        created_at DATETIME NOT NULL,
                        FOREIGN KEY(vehicle_id) REFERENCES vehicles (id)
                    )
                """))
                
                # Copy data from old table
                conn.execute(text("""
                    INSERT INTO fuel_logs_new 
                    SELECT id, vehicle_id, fill_date, mileage_at_fill, liters, total_cost, 
                           price_per_liter, station, notes, created_at 
                    FROM fuel_logs
                """))
                
                # Drop old table
                conn.execute(text("DROP TABLE fuel_logs"))
                
                # Rename new table
                conn.execute(text("ALTER TABLE fuel_logs_new RENAME TO fuel_logs"))
                
                # Re-enable foreign keys
                conn.execute(text("PRAGMA foreign_keys=ON"))

    if "notification_logs" not in inspector.get_table_names():
        NotificationLog.__table__.create(bind=engine)

    if "invitations" not in inspector.get_table_names():
        Invitation.__table__.create(bind=engine)
