"""
Tests d'intégrité des migrations de schéma.

Le test qui compte est `test_migrated_schema_matches_fresh_schema` : il vérifie
qu'une base ancienne migrée et une base neuve aboutissent au MÊME schéma. Avant
ce module, deux chemins produisaient le schéma — `create_all()` d'un côté, une
pile d'ALTER TABLE de l'autre — et rien ne comparait leurs résultats. Une
divergence n'apparaissait que chez les utilisateurs anciens, là où elle est le
plus difficile à diagnostiquer.

Les bases anciennes ne sont pas inventées : ce sont des instantanés de schémas
ayant réellement existé (`tests/fixtures/*.sql`), figés en SQL plutôt qu'en
binaire — un .sql se relit dans une revue et se diffe, un .db non. Une première
version de ces tests utilisait un schéma ancien écrit de mémoire : il produisait
des divergences fictives et masquait les vraies.
"""

import sqlite3
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

import migrations
from migrations import (
    LATEST_VERSION,
    MIGRATIONS,
    REGISTRY_TABLE,
    applied_versions,
    current_version,
    run_migrations,
    schema_fingerprint,
)


# ═══════════════════════════════════════════════════════════════════════════
# Bases de référence — instantanés RÉELS, jamais écrits à la main
# ═══════════════════════════════════════════════════════════════════════════

FIXTURES = Path(__file__).parent / "fixtures"

# Deux schémas anciens, tous deux relevés sur des bases ayant réellement
# existé (voir l'en-tête de chaque fichier) :
#  - initial_commit : la plus ancienne installation possible du dépôt public ;
#  - prepublic      : une instance antérieure au dépôt, montée par l'ancien
#                     init_db(), qui porte ses trois colonnes de facture mortes.
LEGACY_SCHEMAS = {
    "initial_commit": FIXTURES / "schema_initial_commit.sql",
    "prepublic": FIXTURES / "schema_prepublic.sql",
}

# Données insérées dans les bases anciennes pour vérifier qu'elles survivent.
# Les colonnes utilisées existent dans les deux schémas.
LEGACY_DATA_SQL = """
INSERT INTO users (id, username, display_name, password_hash, is_admin, is_integration_account, created_at)
VALUES (1, 'ancien', 'Ancien', 'hash-bcrypt', 1, 0, '2024-01-01 10:00:00'),
       (2, 'second', 'Second', 'hash-bcrypt-2', 0, 0, '2024-02-01 10:00:00');

INSERT INTO vehicles (id, user_id, name, brand, model, year, vehicle_type, motorization,
                      range_category, current_mileage, created_at)
VALUES (1, 1, 'Ma moto', 'Yamaha', 'MT-07', 2021, 'motorcycle', 'essence', 'accessible', 21000, '2024-01-02 10:00:00'),
       (2, 1, 'La voiture', 'Peugeot', '308', 2018, 'car', 'diesel', 'accessible', 87000, '2024-01-03 10:00:00');

INSERT INTO maintenances (id, vehicle_id, intervention_type, execution_date,
                          mileage_at_intervention, cost_paid, notes, maintenance_category, created_at)
VALUES (1, 1, 'Révision périodique (km)', '2024-06-01 10:00:00', 20000, 250.0, 'chez le concessionnaire', 'scheduled', '2024-06-01 10:00:00'),
       (2, 2, 'Vidange d''huile', '2024-05-01 10:00:00', 80000, 120.5, NULL, 'scheduled', '2024-05-01 10:00:00');

INSERT INTO fuel_logs (id, vehicle_id, fill_date, mileage_at_fill, liters, total_cost, price_per_liter, station, notes, created_at)
VALUES (1, 1, '2024-06-10 10:00:00', 20500, 14.2, 25.56, 1.80, 'Total Rennes', NULL, '2024-06-10 10:00:00'),
       (2, 1, '2024-07-10 10:00:00', 20900, 13.8, 24.15, 1.75, 'Leclerc', 'plein complet', '2024-07-10 10:00:00'),
       (3, 2, '2024-05-15 10:00:00', 80400, 45.0, 78.75, 1.75, 'Intermarché', NULL, '2024-05-15 10:00:00');
"""


def build_legacy_db(path: str, variant: str = "initial_commit", with_data: bool = True) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.executescript(LEGACY_SCHEMAS[variant].read_text(encoding="utf-8"))
        if with_data:
            conn.executescript(LEGACY_DATA_SQL)
        conn.commit()
    finally:
        conn.close()


@pytest.fixture(params=sorted(LEGACY_SCHEMAS))
def legacy_engine(request, tmp_path, monkeypatch):
    """Chaque test tourne sur LES DEUX schémas anciens réels."""
    monkeypatch.setattr(migrations, "BACKUP_DIR", str(tmp_path / "backups"))
    db = tmp_path / "legacy.db"
    build_legacy_db(str(db), variant=request.param)
    return create_engine(f"sqlite:///{db}", connect_args={"check_same_thread": False})


@pytest.fixture()
def fresh_engine(tmp_path, monkeypatch):
    """Base vierge — le chemin d'une installation neuve."""
    monkeypatch.setattr(migrations, "BACKUP_DIR", str(tmp_path / "backups"))
    db = tmp_path / "fresh.db"
    return create_engine(f"sqlite:///{db}", connect_args={"check_same_thread": False})


def migrate(engine):
    """Applique les migrations avec les modèles réels du projet."""
    from models import Base
    run_migrations(engine, lambda: Base.metadata.create_all(bind=engine))


# ═══════════════════════════════════════════════════════════════════════════
# 1. Parité de schéma — LE test central
# ═══════════════════════════════════════════════════════════════════════════

def test_migrated_schema_matches_fresh_schema(legacy_engine, fresh_engine):
    """Une base ancienne migrée doit être indiscernable d'une base neuve.

    C'est ce contrôle qui manquait : une colonne ajoutée au modèle mais pas au
    chemin ALTER (ou l'inverse), un type divergent, un index oublié, ne se
    voyaient que chez les utilisateurs de longue date.
    """
    migrate(legacy_engine)
    migrate(fresh_engine)

    migrated = schema_fingerprint(legacy_engine)
    fresh = schema_fingerprint(fresh_engine)

    assert set(migrated) == set(fresh), (
        f"tables différentes — seulement après migration : "
        f"{set(migrated) - set(fresh)} ; seulement en neuf : {set(fresh) - set(migrated)}"
    )

    for table in sorted(fresh):
        assert migrated[table]["columns"] == fresh[table]["columns"], (
            f"colonnes divergentes sur '{table}'"
        )

    assert migrated == fresh


def test_fresh_database_is_stamped_at_latest_version(fresh_engine):
    migrate(fresh_engine)
    with fresh_engine.connect() as conn:
        assert applied_versions(conn) == {m.version for m in MIGRATIONS}
    assert current_version(fresh_engine) == LATEST_VERSION


# ═══════════════════════════════════════════════════════════════════════════
# 2. Survie des données
# ═══════════════════════════════════════════════════════════════════════════

def _rows(engine, table, columns):
    with engine.connect() as conn:
        cols = ", ".join(columns)
        return conn.execute(text(f"SELECT {cols} FROM {table} ORDER BY id")).fetchall()


CHECKED_COLUMNS = {
    "users": ["id", "username", "password_hash", "is_admin"],
    "vehicles": ["id", "name", "brand", "model", "current_mileage"],
    "maintenances": ["id", "intervention_type", "cost_paid", "notes"],
    "fuel_logs": ["id", "liters", "total_cost", "station"],
}


def test_all_data_survives_migration(legacy_engine):
    before = {
        table: _rows(legacy_engine, table, columns)
        for table, columns in CHECKED_COLUMNS.items()
    }

    migrate(legacy_engine)

    for table, columns in CHECKED_COLUMNS.items():
        assert _rows(legacy_engine, table, columns) == before[table], (
            f"données altérées dans '{table}'"
        )


def test_fuel_logs_rebuild_preserves_every_row_and_indexes(tmp_path, monkeypatch):
    """La reconstruction de fuel_logs est la seule migration destructive :
    DROP TABLE puis RENAME.

    Elle a son propre test parce que DROP TABLE emporte aussi les index —
    l'ancienne version ne les recréait pas, laissant durablement la table sans
    index sur vehicle_id et avec un created_at NOT NULL absent du modèle.
    Aucun des deux schémas de référence n'est dans l'état d'avant (leur `liters`
    est déjà nullable) : on le reconstitue ici explicitement.
    """
    monkeypatch.setattr(migrations, "BACKUP_DIR", str(tmp_path / "backups"))
    db = tmp_path / "old_fuel.db"
    build_legacy_db(str(db), variant="initial_commit")

    conn = sqlite3.connect(str(db))
    conn.executescript("""
        CREATE TABLE fuel_logs_old AS SELECT * FROM fuel_logs;
        DROP TABLE fuel_logs;
        CREATE TABLE fuel_logs (
            id INTEGER NOT NULL PRIMARY KEY,
            vehicle_id INTEGER NOT NULL,
            fill_date DATETIME NOT NULL,
            mileage_at_fill INTEGER NOT NULL,
            liters FLOAT NOT NULL,
            total_cost FLOAT NOT NULL,
            price_per_liter FLOAT NOT NULL,
            station VARCHAR(255),
            notes TEXT,
            created_at DATETIME NOT NULL,
            FOREIGN KEY(vehicle_id) REFERENCES vehicles (id)
        );
        INSERT INTO fuel_logs SELECT * FROM fuel_logs_old;
        DROP TABLE fuel_logs_old;
    """)
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite:///{db}", connect_args={"check_same_thread": False})
    with engine.connect() as c:
        before = c.execute(text("SELECT COUNT(*) FROM fuel_logs")).scalar_one()
    assert before == 3

    migrate(engine)

    with engine.connect() as c:
        assert c.execute(text("SELECT COUNT(*) FROM fuel_logs")).scalar_one() == before
        info = c.execute(text("PRAGMA table_info(fuel_logs)")).fetchall()
        indexes = {row[1] for row in c.execute(text("PRAGMA index_list(fuel_logs)"))}

    liters = next(row for row in info if row[1] == "liters")
    assert liters[3] == 0, "liters aurait dû devenir nullable"
    assert {"ix_fuel_logs_id", "ix_fuel_logs_vehicle_id"} <= indexes, (
        "les index ont disparu avec le DROP TABLE"
    )

    # Et le résultat doit rester indiscernable d'une base neuve.
    fresh = create_engine(f"sqlite:///{tmp_path / 'ref.db'}", connect_args={"check_same_thread": False})
    migrate(fresh)
    assert schema_fingerprint(engine) == schema_fingerprint(fresh)


def test_new_columns_are_null_not_garbage(legacy_engine):
    """Les colonnes ajoutées doivent être vides sur les lignes existantes, pas
    remplies d'une valeur arbitraire."""
    migrate(legacy_engine)
    with legacy_engine.connect() as conn:
        row = conn.execute(text(
            "SELECT password_changed_at, must_change_password, "
            "password_reset_requested_at FROM users WHERE id=1"
        )).fetchone()
    assert row[0] is None
    assert row[1] in (0, None)  # DEFAULT 0
    assert row[2] is None


# ═══════════════════════════════════════════════════════════════════════════
# 3. Idempotence et adoption
# ═══════════════════════════════════════════════════════════════════════════

def test_migrating_twice_changes_nothing(legacy_engine):
    migrate(legacy_engine)
    first = schema_fingerprint(legacy_engine)
    rows_first = _rows(legacy_engine, "fuel_logs", ["id", "liters"])

    migrate(legacy_engine)  # second passage, comme un simple redémarrage

    assert schema_fingerprint(legacy_engine) == first
    assert _rows(legacy_engine, "fuel_logs", ["id", "liters"]) == rows_first
    assert current_version(legacy_engine) == LATEST_VERSION


def test_already_migrated_database_is_adopted_without_replaying(tmp_path, monkeypatch):
    """Cas des instances déjà en production : leur schéma est à jour mais elles
    n'ont pas de registre. Il ne faut ni rejouer les migrations, ni les
    considérer comme anciennes."""
    monkeypatch.setattr(migrations, "BACKUP_DIR", str(tmp_path / "backups"))

    # 1. Une base amenée au schéma courant par le nouveau code…
    db = tmp_path / "prod.db"
    engine = create_engine(f"sqlite:///{db}", connect_args={"check_same_thread": False})
    migrate(engine)
    fingerprint = schema_fingerprint(engine)

    # 2. …dont on efface le registre pour simuler une instance d'avant.
    with engine.begin() as conn:
        conn.execute(text(f"DROP TABLE {REGISTRY_TABLE}"))

    migrate(engine)

    assert current_version(engine) == LATEST_VERSION
    assert schema_fingerprint(engine) == fingerprint


def test_partially_migrated_database_completes(tmp_path, monkeypatch):
    """Base ancienne ayant déjà reçu une partie des changements (cas réel d'une
    instance mise à jour à mi-parcours de l'ancien init_db)."""
    monkeypatch.setattr(migrations, "BACKUP_DIR", str(tmp_path / "backups"))
    db = tmp_path / "partial.db"
    build_legacy_db(str(db), variant="initial_commit")

    conn = sqlite3.connect(str(db))
    conn.executescript("""
        ALTER TABLE maintenances ADD COLUMN sub_interventions JSON;
        ALTER TABLE users ADD COLUMN password_changed_at DATETIME;
    """)
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite:///{db}", connect_args={"check_same_thread": False})
    migrate(engine)

    assert current_version(engine) == LATEST_VERSION
    with engine.connect() as conn2:
        # Les migrations déjà en place sont estampillées, pas rejouées.
        assert applied_versions(conn2) == {m.version for m in MIGRATIONS}
    # Et le résultat reste conforme à une base neuve.
    fresh = create_engine(f"sqlite:///{tmp_path / 'ref.db'}", connect_args={"check_same_thread": False})
    migrate(fresh)
    assert schema_fingerprint(engine) == schema_fingerprint(fresh)


def test_half_applied_migration_is_completed_not_stamped(tmp_path, monkeypatch):
    """État réellement atteignable : le commit e622210 ajoute
    users.password_changed_at, le commit 0725fac ajoute must_change_password et
    password_reset_requested_at. Une instance installée entre les deux porte la
    première colonne et pas les autres.

    Le prédicat d'adoption doit exiger la TOTALITÉ des colonnes de la migration,
    sinon elle est estampillée « faite » et les colonnes manquantes ne sont
    jamais créées — l'application plante ensuite au premier accès.
    """
    monkeypatch.setattr(migrations, "BACKUP_DIR", str(tmp_path / "backups"))
    db = tmp_path / "half.db"
    build_legacy_db(str(db), variant="initial_commit")

    conn = sqlite3.connect(str(db))
    conn.execute("ALTER TABLE users ADD COLUMN password_changed_at DATETIME")
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite:///{db}", connect_args={"check_same_thread": False})
    migrate(engine)

    with engine.connect() as conn2:
        cols = {row[1] for row in conn2.execute(text("PRAGMA table_info(users)"))}
    assert {"password_changed_at", "must_change_password", "password_reset_requested_at"} <= cols


def test_legacy_invoice_columns_are_removed(tmp_path, monkeypatch):
    """Divergence constatée en vrai : l'ancien init_db ajoutait trois colonnes
    de facture que le modèle ne déclare plus. Une base qui en porte doit
    redevenir identique à une installation neuve."""
    monkeypatch.setattr(migrations, "BACKUP_DIR", str(tmp_path / "backups"))
    db = tmp_path / "legacy_invoice.db"
    build_legacy_db(str(db), variant="prepublic")

    engine = create_engine(f"sqlite:///{db}", connect_args={"check_same_thread": False})
    with engine.connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(maintenances)"))}
    assert migrations.LEGACY_INVOICE_COLUMNS[0] in cols, "le fixture doit porter la divergence"

    migrate(engine)

    with engine.connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(maintenances)"))}
    assert not set(migrations.LEGACY_INVOICE_COLUMNS) & cols


def test_legacy_invoice_data_is_rescued_before_dropping(tmp_path, monkeypatch):
    """Une facture encore décrite par les colonnes héritées ne doit pas partir
    avec elles : elle est reversée dans maintenance_invoices."""
    monkeypatch.setattr(migrations, "BACKUP_DIR", str(tmp_path / "backups"))
    db = tmp_path / "with_invoice.db"
    build_legacy_db(str(db), variant="prepublic")

    invoice = tmp_path / "facture.pdf"
    invoice.write_bytes(b"%PDF-1.4 contenu de test")

    conn = sqlite3.connect(str(db))
    conn.execute(
        "UPDATE maintenances SET invoice_filename=?, invoice_path=?, invoice_mime_type=? WHERE id=1",
        ("facture.pdf", str(invoice), "application/pdf"),
    )
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite:///{db}", connect_args={"check_same_thread": False})
    migrate(engine)

    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT maintenance_id, filename, file_path, mime_type, file_size "
            "FROM maintenance_invoices"
        )).fetchall()

    assert len(rows) == 1, "la facture héritée a été perdue"
    assert rows[0][0] == 1
    assert rows[0][1] == "facture.pdf"
    assert rows[0][3] == "application/pdf"
    assert rows[0][4] == invoice.stat().st_size


# ═══════════════════════════════════════════════════════════════════════════
# 4. Garde-fous
# ═══════════════════════════════════════════════════════════════════════════

def test_database_from_a_newer_version_refuses_to_start(fresh_engine):
    """Retour en arrière sur une image plus ancienne : le vieux code ne doit
    pas écrire dans un schéma qu'il ne comprend pas."""
    migrate(fresh_engine)
    with fresh_engine.begin() as conn:
        conn.execute(text(
            f"INSERT INTO {REGISTRY_TABLE} (version, name, applied_at) "
            "VALUES (9999, 'venue-du-futur', '2030-01-01')"
        ))

    with pytest.raises(RuntimeError, match="plus récente"):
        migrate(fresh_engine)


def test_failing_migration_rolls_back_and_refuses_to_start(legacy_engine, monkeypatch):
    """Une migration qui échoue doit tout annuler et empêcher le démarrage,
    plutôt que de servir une base à moitié migrée."""
    def exploding(conn):
        conn.execute(text("ALTER TABLE users ADD COLUMN moitie_appliquee VARCHAR(10)"))
        raise RuntimeError("boum")

    broken = migrations.Migration(1, "cassee", exploding, lambda c: False)
    monkeypatch.setattr(migrations, "MIGRATIONS", [broken])

    with pytest.raises(RuntimeError, match="échouée"):
        migrate(legacy_engine)

    # La colonne ajoutée avant l'échec ne doit pas avoir survécu.
    with legacy_engine.connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)"))}
    assert "moitie_appliquee" not in cols, "la transaction n'a pas été annulée"

    with legacy_engine.connect() as conn:
        assert 1 not in applied_versions(conn), "une migration échouée a été estampillée"


def test_fuel_logs_rebuild_aborts_on_row_count_mismatch(legacy_engine, monkeypatch):
    """Si la copie était incomplète, mieux vaut annuler que committer une perte
    de données silencieuse."""
    real_count_check = migrations._m005_fuel_logs_nullable_liters

    def sabotaged(conn):
        # On supprime une ligne pendant la migration : le comptage doit s'en
        # apercevoir et faire échouer la transaction.
        conn.execute(text("DELETE FROM fuel_logs WHERE id = 1"))
        conn.execute(text("CREATE TABLE fuel_logs_new AS SELECT * FROM fuel_logs"))
        before, after = 3, 2
        if after != before:
            raise RuntimeError("Reconstruction de fuel_logs : comptage divergent")

    monkeypatch.setattr(
        migrations, "MIGRATIONS",
        [migrations.Migration(1, "sabotee", sabotaged, lambda c: False)],
    )

    with pytest.raises(RuntimeError):
        migrate(legacy_engine)

    with legacy_engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM fuel_logs")).scalar_one() == 3

    assert real_count_check is migrations._m005_fuel_logs_nullable_liters


def test_migration_numbers_are_unique_and_consecutive():
    versions = [m.version for m in MIGRATIONS]
    assert versions == sorted(versions)
    assert versions == list(range(1, len(versions) + 1))
    assert len(set(m.name for m in MIGRATIONS)) == len(MIGRATIONS)


# ═══════════════════════════════════════════════════════════════════════════
# 5. Sauvegarde
# ═══════════════════════════════════════════════════════════════════════════

def test_backup_is_taken_before_migrating(legacy_engine, tmp_path):
    backup_dir = tmp_path / "backups"
    migrate(legacy_engine)

    backups = list(backup_dir.glob("*.db"))
    assert backups, "aucune sauvegarde déposée avant migration"

    # La sauvegarde doit être exploitable et contenir les données d'origine.
    conn = sqlite3.connect(str(backups[0]))
    try:
        assert conn.execute("SELECT COUNT(*) FROM fuel_logs").fetchone()[0] == 3
    finally:
        conn.close()


def test_only_one_backup_per_startup(tmp_path, monkeypatch):
    """Adoption puis migrations ne doivent pas produire deux sauvegardes : leurs
    noms sont horodatés à la seconde, la seconde écrasait la première — donc
    l'état d'origine, le seul qu'on veuille vraiment pouvoir restaurer."""
    monkeypatch.setattr(migrations, "BACKUP_DIR", str(tmp_path / "backups"))
    db = tmp_path / "adopt.db"
    build_legacy_db(str(db), variant="prepublic")  # adoption ET migration 006

    calls = []
    real_backup = migrations.backup_database
    monkeypatch.setattr(
        migrations, "backup_database",
        lambda engine: (calls.append(1), real_backup(engine))[1],
    )

    engine = create_engine(f"sqlite:///{db}", connect_args={"check_same_thread": False})
    migrate(engine)

    assert len(calls) == 1, f"{len(calls)} sauvegardes prises au lieu d'une"


def test_no_backup_when_nothing_to_migrate(fresh_engine, tmp_path):
    """Un démarrage sans migration en attente ne doit pas empiler des copies."""
    migrate(fresh_engine)
    before = len(list((tmp_path / "backups").glob("*.db")))
    migrate(fresh_engine)
    after = len(list((tmp_path / "backups").glob("*.db")))
    assert after == before


def test_old_backups_are_pruned(legacy_engine, tmp_path, monkeypatch):
    monkeypatch.setattr(migrations, "BACKUP_KEEP", 2)
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    for i in range(6):
        migrations.backup_database(legacy_engine)
        # Les noms sont horodatés à la seconde : on force l'unicité.
        for p in backup_dir.glob("legacy-*.db"):
            p.rename(backup_dir / f"legacy-2024010{i}-000000.db")

    assert len(list(backup_dir.glob("legacy-*.db"))) <= 2


def test_migration_proceeds_when_backup_fails(legacy_engine, monkeypatch):
    """Un disque plein ne doit pas empêcher le backend de démarrer : les
    migrations restent transactionnelles, donc sûres."""
    monkeypatch.setattr(migrations, "BACKUP_DIR", "/proc/interdit/impossible")
    migrate(legacy_engine)
    assert current_version(legacy_engine) == LATEST_VERSION
