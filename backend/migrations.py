"""
Migrations de schéma versionnées, avec registre en base et contrôle d'intégrité.

Pourquoi ce module existe
─────────────────────────
Avant lui, `init_db()` déduisait l'état du schéma à chaque démarrage
(« est-ce que cette colonne existe ? ») et appliquait des ALTER TABLE en
conséquence. Trois défauts :

1. Deux chemins produisaient le schéma — `create_all()` pour une installation
   neuve, une pile d'ALTER pour une installation existante — et rien ne
   vérifiait qu'ils aboutissaient au même résultat. Une divergence n'apparaît
   que chez les utilisateurs anciens, et y est très difficile à diagnostiquer.
2. L'état n'était jamais enregistré : impossible de dire à quelle version est
   une base, ni de détecter qu'on redescend sur une image plus ancienne — le
   vieux code tournait alors sur un schéma qu'il ne comprend pas.
3. Rien n'était atomique. La reconstruction de `fuel_logs` faisait DROP TABLE
   puis RENAME dans des transactions distinctes : un processus tué entre les
   deux (le conteneur est plafonné à 256 Mo) perdait tous les pleins.

Principes retenus
─────────────────
- **Registre** (`schema_migrations`) : une ligne par migration appliquée. La
  base dit où elle en est, on ne le devine plus.
- **Migrations numérotées et immuables.** Une migration publiée n'est JAMAIS
  modifiée ni réordonnée — c'est la seule règle qui garantit qu'une base neuve
  et une base migrée convergent.
- **Idempotence en plus du registre.** Chaque opération vérifie l'état réel
  avant d'agir (`add_column_if_missing`). Le registre évite de rejouer, mais si
  le registre se trompait, l'opération ne casserait rien pour autant. Ceinture
  et bretelles : une base cassée n'est pas rattrapable.
- **Une migration = une transaction.** SQLite sait faire du DDL transactionnel.
  Échec → annulation complète, et le backend refuse de démarrer plutôt que de
  servir une base à moitié migrée.
- **Sauvegarde avant toute migration**, dans `/data/backups`.
- **Refus de démarrer sur une base plus récente que le code.**

Ajouter une migration
─────────────────────
Ajouter une entrée à la fin de `MIGRATIONS` avec le numéro suivant, et ne
jamais toucher aux précédentes. Voir §13 de CLAUDE.md.
"""

import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, NamedTuple

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import Connection, Engine

logger = logging.getLogger("ridelog.migrations")

BACKUP_DIR = os.getenv("DB_BACKUP_DIR", "/data/backups")
BACKUP_KEEP = int(os.getenv("DB_BACKUP_KEEP", "5"))


# ═══════════════════════════════════════════════════════════════════════════
# Moteur dédié aux migrations : DDL réellement transactionnel
# ═══════════════════════════════════════════════════════════════════════════

def _make_transactional_engine(source: Engine) -> tuple[Engine, bool]:
    """Moteur sur la même base, mais où le DDL est vraiment transactionnel.

    Le pilote sqlite3 de Python n'ouvre une transaction implicite que devant du
    DML (INSERT/UPDATE/DELETE), jamais devant du DDL : un ALTER TABLE s'exécute
    donc en autocommit, et le `with engine.begin()` qui l'entoure ne protège
    rien. Sans ce correctif, la promesse « une migration échouée est annulée »
    était fausse — vérifié par
    test_failing_migration_rolls_back_and_refuses_to_start, qui échouait.

    On passe le pilote en mode manuel (`isolation_level = None`) et on émet le
    BEGIN nous-mêmes. C'est fait sur un moteur JETABLE, dédié aux migrations :
    le moteur applicatif garde exactement le comportement qu'il avait, cette
    modification ne peut donc rien changer au reste de l'application.

    Retourne (moteur, doit_être_fermé). Une base en mémoire ne peut pas être
    rouverte — ce serait une autre base — on rend alors le moteur d'origine.
    """
    url = source.url
    if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
        return source, False

    engine = create_engine(url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _disable_driver_autocommit(dbapi_connection, _record):
        dbapi_connection.isolation_level = None

    @event.listens_for(engine, "begin")
    def _emit_explicit_begin(conn):
        conn.exec_driver_sql("BEGIN")

    return engine, True


# ═══════════════════════════════════════════════════════════════════════════
# Helpers idempotents
# ═══════════════════════════════════════════════════════════════════════════

def table_exists(conn: Connection, table: str) -> bool:
    row = conn.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='table' AND name=:t"),
        {"t": table},
    ).fetchone()
    return row is not None


def column_names(conn: Connection, table: str) -> set[str]:
    if not table_exists(conn, table):
        return set()
    return {row[1] for row in conn.execute(text(f'PRAGMA table_info("{table}")'))}


def add_column_if_missing(conn: Connection, table: str, column: str, ddl: str) -> bool:
    """ALTER TABLE ADD COLUMN, sans effet si la colonne est déjà là.

    Retourne True si la colonne a été ajoutée. Le garde-fou est volontairement
    redondant avec le registre : il rend une migration rejouée inoffensive.
    """
    if not table_exists(conn, table):
        # La table n'existe pas encore : elle sera créée par create_all() à
        # partir du modèle, donc déjà avec cette colonne. Rien à faire.
        return False
    if column in column_names(conn, table):
        return False
    conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN {column} {ddl}'))
    logger.info("  + %s.%s", table, column)
    return True


def has_all_columns(conn: Connection, table: str, *columns: str) -> bool:
    """Vraie seulement si TOUTES les colonnes sont présentes.

    Les prédicats d'adoption doivent exiger la totalité de ce que la migration
    ajoute, jamais un échantillon : une migration à demi appliquée serait sinon
    estampillée « faite » et ses colonnes manquantes ne seraient jamais créées.
    Ce n'est pas théorique — l'historique du dépôt contient précisément cet
    état (password_changed_at ajouté dans un commit, must_change_password et
    password_reset_requested_at dans le suivant).
    """
    present = column_names(conn, table)
    return all(column in present for column in columns)


def column_is_nullable(conn: Connection, table: str, column: str) -> bool | None:
    """None si la table ou la colonne n'existe pas."""
    if not table_exists(conn, table):
        return None
    for row in conn.execute(text(f'PRAGMA table_info("{table}")')):
        if row[1] == column:
            return not bool(row[3])  # row[3] = notnull
    return None


# ═══════════════════════════════════════════════════════════════════════════
# Définition des migrations
# ═══════════════════════════════════════════════════════════════════════════

class Migration(NamedTuple):
    version: int
    name: str
    apply: Callable[[Connection], None]
    # Prédicat de détection, utilisé UNIQUEMENT lors de l'adoption d'une base
    # antérieure au registre : renvoie True si la migration est déjà en place.
    # Reprend la logique d'inspection de l'ancien init_db() — c'est la dernière
    # fois qu'elle sert.
    already_applied: Callable[[Connection], bool]


def _m001_maintenance_category(conn: Connection) -> None:
    # Volontairement SANS invoice_filename / invoice_path / invoice_mime_type :
    # l'ancien init_db les ajoutait alors que le modèle ne les déclare plus
    # (les factures vivent dans maintenance_invoices depuis). Les rajouter
    # créerait justement la divergence que la migration 006 répare.
    add_column_if_missing(conn, "maintenances", "maintenance_category", "VARCHAR(50) DEFAULT 'scheduled'")
    add_column_if_missing(conn, "maintenances", "other_description", "VARCHAR(200)")


def _m002_maintenance_sub_interventions(conn: Connection) -> None:
    add_column_if_missing(conn, "maintenances", "sub_interventions", "JSON")


def _m003_vehicle_photo_and_service_intervals(conn: Connection) -> None:
    add_column_if_missing(conn, "vehicles", "photo_path", "VARCHAR(500)")
    add_column_if_missing(conn, "vehicles", "service_interval_km", "INTEGER")
    add_column_if_missing(conn, "vehicles", "service_interval_months", "INTEGER")


def _m004_user_password_lifecycle(conn: Connection) -> None:
    add_column_if_missing(conn, "users", "password_changed_at", "DATETIME")
    add_column_if_missing(conn, "users", "must_change_password", "BOOLEAN DEFAULT 0")
    add_column_if_missing(conn, "users", "password_reset_requested_at", "DATETIME")


def _m005_fuel_logs_nullable_liters(conn: Connection) -> None:
    """Rend `liters` et `price_per_liter` nullables (SQLite ne sait pas faire
    d'ALTER COLUMN : il faut reconstruire la table).

    C'est la seule migration destructive du projet. Elle tourne désormais dans
    une transaction unique : si le processus meurt en cours de route, SQLite
    annule tout au redémarrage. Auparavant, DROP TABLE et RENAME étaient dans
    deux transactions distinctes — mourir entre les deux perdait tous les pleins.

    Le nombre de lignes est vérifié avant/après : une copie incomplète annule la
    transaction au lieu de committer une perte de données silencieuse.
    """
    if not table_exists(conn, "fuel_logs"):
        return
    if column_is_nullable(conn, "fuel_logs", "liters"):
        return  # déjà fait

    before = conn.execute(text("SELECT COUNT(*) FROM fuel_logs")).scalar_one()

    # Cette définition doit reproduire EXACTEMENT le modèle FuelLog. L'ancienne
    # version (héritée d'init_db) déclarait created_at NOT NULL et ne recréait
    # aucun index : toute base passée par cette reconstruction se retrouvait
    # avec un schéma différent d'une installation neuve, et sans index sur
    # vehicle_id — donc avec des requêtes de plein plus lentes à mesure que
    # l'historique grossit. C'est exactement la divergence que
    # test_migrated_schema_matches_fresh_schema attrape.
    conn.execute(text("""
        CREATE TABLE fuel_logs_new (
            id INTEGER NOT NULL,
            vehicle_id INTEGER NOT NULL,
            fill_date DATETIME NOT NULL,
            mileage_at_fill INTEGER NOT NULL,
            liters FLOAT,
            total_cost FLOAT NOT NULL,
            price_per_liter FLOAT,
            station VARCHAR(255),
            notes TEXT,
            created_at DATETIME,
            PRIMARY KEY (id),
            FOREIGN KEY(vehicle_id) REFERENCES vehicles (id)
        )
    """))
    conn.execute(text("""
        INSERT INTO fuel_logs_new
        SELECT id, vehicle_id, fill_date, mileage_at_fill, liters, total_cost,
               price_per_liter, station, notes, created_at
        FROM fuel_logs
    """))

    after = conn.execute(text("SELECT COUNT(*) FROM fuel_logs_new")).scalar_one()
    if after != before:
        raise RuntimeError(
            f"Reconstruction de fuel_logs : {before} lignes avant, {after} après. "
            "Migration annulée, aucune donnée perdue."
        )

    conn.execute(text("DROP TABLE fuel_logs"))
    conn.execute(text("ALTER TABLE fuel_logs_new RENAME TO fuel_logs"))

    # DROP TABLE a emporté les index : il faut les recréer à l'identique du
    # modèle, sinon la table reste durablement différente d'une base neuve.
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_fuel_logs_id ON fuel_logs (id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_fuel_logs_vehicle_id ON fuel_logs (vehicle_id)"))

    logger.info("  ~ fuel_logs reconstruite (%d lignes préservées, index recréés)", after)


LEGACY_INVOICE_COLUMNS = ("invoice_filename", "invoice_path", "invoice_mime_type")


def _m006_drop_legacy_invoice_columns(conn: Connection) -> None:
    """Retire trois colonnes que le modèle ne déclare plus.

    L'ancien init_db ajoutait `invoice_filename`, `invoice_path` et
    `invoice_mime_type` à `maintenances`. Les factures ont ensuite migré vers la
    table `maintenance_invoices`, mais les ALTER sont restés : toute base
    passée par ce chemin porte trois colonnes qu'une installation neuve n'a
    pas. Divergence constatée en vrai sur une instance en service.

    Les données éventuelles ne sont pas jetées : une facture encore décrite par
    ces colonnes est d'abord reversée dans `maintenance_invoices`.
    """
    present = [c for c in LEGACY_INVOICE_COLUMNS if c in column_names(conn, "maintenances")]
    if not present:
        return

    if "invoice_path" in present and table_exists(conn, "maintenance_invoices"):
        orphans = conn.execute(text("""
            SELECT m.id, m.invoice_filename, m.invoice_path, m.invoice_mime_type, m.created_at
            FROM maintenances m
            WHERE m.invoice_path IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM maintenance_invoices i WHERE i.maintenance_id = m.id
              )
        """)).fetchall()

        for maintenance_id, filename, file_path, mime_type, created_at in orphans:
            size = 0
            try:
                size = Path(file_path).stat().st_size
            except OSError:
                # Fichier disparu du disque : on conserve tout de même la trace,
                # perdre la ligne serait pire que garder une taille à zéro.
                pass
            conn.execute(
                text("""
                    INSERT INTO maintenance_invoices
                        (maintenance_id, filename, file_path, mime_type, file_size, uploaded_at)
                    VALUES (:mid, :fn, :fp, :mt, :sz, :ts)
                """),
                {
                    "mid": maintenance_id,
                    "fn": filename or Path(file_path).name,
                    "fp": file_path,
                    "mt": mime_type or "application/octet-stream",
                    "sz": size,
                    "ts": created_at or datetime.now(timezone.utc).isoformat(),
                },
            )
        if orphans:
            logger.info("  ↳ %d facture(s) héritée(s) reversée(s) dans maintenance_invoices", len(orphans))

    for column in present:
        conn.execute(text(f"ALTER TABLE maintenances DROP COLUMN {column}"))
        logger.info("  - maintenances.%s (colonne héritée retirée)", column)


MIGRATIONS: list[Migration] = [
    Migration(
        1, "maintenance_category",
        _m001_maintenance_category,
        lambda c: has_all_columns(c, "maintenances", "maintenance_category", "other_description"),
    ),
    Migration(
        2, "maintenance_sub_interventions",
        _m002_maintenance_sub_interventions,
        lambda c: has_all_columns(c, "maintenances", "sub_interventions"),
    ),
    Migration(
        3, "vehicle_photo_and_service_intervals",
        _m003_vehicle_photo_and_service_intervals,
        lambda c: has_all_columns(
            c, "vehicles", "photo_path", "service_interval_km", "service_interval_months"
        ),
    ),
    Migration(
        4, "user_password_lifecycle",
        _m004_user_password_lifecycle,
        lambda c: has_all_columns(
            c, "users", "password_changed_at", "must_change_password",
            "password_reset_requested_at",
        ),
    ),
    Migration(
        5, "fuel_logs_nullable_liters",
        _m005_fuel_logs_nullable_liters,
        lambda c: column_is_nullable(c, "fuel_logs", "liters") is not False,
    ),
    Migration(
        6, "drop_legacy_invoice_columns",
        _m006_drop_legacy_invoice_columns,
        # Jamais « déjà appliquée » à l'adoption : c'est précisément sur les
        # bases anciennes qu'elle doit tourner. Elle est sans effet si les
        # colonnes sont absentes.
        lambda c: False,
    ),
]

LATEST_VERSION = max(m.version for m in MIGRATIONS) if MIGRATIONS else 0


def _validate_migration_list() -> None:
    """Garde-fou de développement : numéros uniques et consécutifs."""
    versions = [m.version for m in MIGRATIONS]
    if len(set(versions)) != len(versions):
        raise RuntimeError("MIGRATIONS : numéros de version dupliqués")
    if versions != sorted(versions):
        raise RuntimeError("MIGRATIONS : liste non triée par version")
    if versions and versions != list(range(1, len(versions) + 1)):
        raise RuntimeError("MIGRATIONS : les numéros doivent être consécutifs à partir de 1")


# ═══════════════════════════════════════════════════════════════════════════
# Registre
# ═══════════════════════════════════════════════════════════════════════════

REGISTRY_TABLE = "schema_migrations"


def _ensure_registry(conn: Connection) -> None:
    conn.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {REGISTRY_TABLE} (
            version INTEGER PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            applied_at DATETIME NOT NULL
        )
    """))


def applied_versions(conn: Connection) -> set[int]:
    if not table_exists(conn, REGISTRY_TABLE):
        return set()
    return {row[0] for row in conn.execute(text(f"SELECT version FROM {REGISTRY_TABLE}"))}


def _stamp(conn: Connection, migration: Migration) -> None:
    conn.execute(
        text(f"INSERT OR IGNORE INTO {REGISTRY_TABLE} (version, name, applied_at) "
             "VALUES (:v, :n, :t)"),
        {"v": migration.version, "n": migration.name,
         "t": datetime.now(timezone.utc).isoformat()},
    )


def _user_tables(conn: Connection) -> set[str]:
    return {
        row[0] for row in conn.execute(text(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name NOT LIKE 'sqlite_%'"
        ))
    } - {REGISTRY_TABLE}


# ═══════════════════════════════════════════════════════════════════════════
# Sauvegarde
# ═══════════════════════════════════════════════════════════════════════════

def _database_file(engine: Engine) -> Path | None:
    """Chemin du fichier SQLite, ou None (base en mémoire, autre moteur)."""
    url = engine.url
    if url.get_backend_name() != "sqlite":
        return None
    if not url.database or url.database == ":memory:":
        return None
    return Path(url.database)


def backup_database(engine: Engine) -> Path | None:
    """Copie cohérente de la base avant migration.

    Utilise l'API `sqlite3.backup`, qui prend un verrou propre — un simple
    `cp` d'un fichier SQLite en cours d'écriture peut produire une copie
    inutilisable.
    """
    source = _database_file(engine)
    if source is None or not source.exists():
        return None

    try:
        backup_dir = Path(BACKUP_DIR)
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        target = backup_dir / f"{source.stem}-{stamp}.db"

        import sqlite3
        src = sqlite3.connect(str(source))
        try:
            dst = sqlite3.connect(str(target))
            try:
                src.backup(dst)
            finally:
                dst.close()
        finally:
            src.close()

        logger.info("Sauvegarde de la base : %s", target)
        _prune_backups(backup_dir, source.stem)
        return target
    except Exception as exc:
        # Une sauvegarde impossible (disque plein, volume en lecture seule) ne
        # doit pas empêcher le démarrage : on avertit fortement et on continue,
        # les migrations restant transactionnelles.
        logger.error(
            "Sauvegarde de la base IMPOSSIBLE (%s) — les migrations vont "
            "s'appliquer sans filet. Vérifiez %s.", exc, BACKUP_DIR
        )
        return None


def _prune_backups(backup_dir: Path, stem: str) -> None:
    backups = sorted(backup_dir.glob(f"{stem}-*.db"), key=lambda p: p.name)
    for old in backups[:-BACKUP_KEEP] if BACKUP_KEEP > 0 else backups:
        try:
            old.unlink()
            logger.info("Ancienne sauvegarde supprimée : %s", old.name)
        except OSError:
            pass


# ═══════════════════════════════════════════════════════════════════════════
# Exécution
# ═══════════════════════════════════════════════════════════════════════════

def run_migrations(engine: Engine, create_all: Callable[[], None]) -> None:
    """Amène la base au schéma courant.

    `create_all` est passé en paramètre (et non importé) pour éviter une
    dépendance circulaire avec models.py, qui possède les modèles.

    Trois cas :
    - base vide          → create_all(), puis on estampille tout sans rien exécuter
    - base sans registre → adoption : on détecte l'existant, on estampille, on
                           applique le reste
    - base avec registre → on applique ce qui manque
    """
    _validate_migration_list()

    migration_engine, disposable = _make_transactional_engine(engine)
    try:
        _run_migrations_on(migration_engine, engine, create_all)
    finally:
        if disposable:
            migration_engine.dispose()


def _run_migrations_on(
    engine: Engine, app_engine: Engine, create_all: Callable[[], None]
) -> None:
    with engine.connect() as conn:
        existing_tables = _user_tables(conn)
        has_registry = table_exists(conn, REGISTRY_TABLE)
        is_fresh = not existing_tables

    # ── Base vierge ────────────────────────────────────────────────────────
    if is_fresh:
        create_all()
        with engine.begin() as conn:
            _ensure_registry(conn)
            for migration in MIGRATIONS:
                _stamp(conn, migration)
        logger.info(
            "Base vierge initialisée au schéma courant (version %d).", LATEST_VERSION
        )
        return

    # ── Base existante ─────────────────────────────────────────────────────
    # Une seule sauvegarde par démarrage, prise AVANT l'adoption : c'est l'état
    # d'origine qu'on veut pouvoir restaurer, pas un état intermédiaire. Deux
    # appels successifs produisaient le même nom (horodatage à la seconde) et
    # le second écrasait le premier.
    backed_up = False
    if not has_registry:
        backup_database(engine)
        backed_up = True
        _adopt_existing_database(engine)

    with engine.connect() as conn:
        done = applied_versions(conn)

    _guard_against_newer_database(done)

    pending = [m for m in MIGRATIONS if m.version not in done]

    if pending:
        logger.info(
            "Migrations à appliquer : %s",
            ", ".join(f"{m.version:03d}-{m.name}" for m in pending),
        )
        if not backed_up:
            backup_database(engine)

        for migration in pending:
            try:
                # Une transaction par migration : une migration qui échoue est
                # annulée intégralement, et celles déjà passées restent acquises.
                with engine.begin() as conn:
                    logger.info("→ %03d-%s", migration.version, migration.name)
                    migration.apply(conn)
                    _stamp(conn, migration)
            except Exception as exc:
                logger.error(
                    "Migration %03d-%s ÉCHOUÉE : %s — annulée, la base est "
                    "restée dans son état précédent.",
                    migration.version, migration.name, exc,
                )
                raise RuntimeError(
                    f"Migration {migration.version:03d}-{migration.name} échouée : {exc}. "
                    f"Le backend refuse de démarrer sur une base à moitié migrée. "
                    f"Une sauvegarde a été déposée dans {BACKUP_DIR}."
                ) from exc

    # Les tables entièrement nouvelles sont créées à partir des modèles, jamais
    # par une migration : une déclaration ne peut pas diverger d'elle-même.
    create_all()

    logger.info("Schéma à jour (version %d).", LATEST_VERSION)


def _adopt_existing_database(engine: Engine) -> None:
    """Première rencontre avec une base antérieure au registre.

    On ne peut pas rejouer les migrations : elles sont déjà en place. On
    inspecte donc le schéma une dernière fois pour déduire lesquelles, et on
    les estampille. C'est le seul endroit où cette heuristique subsiste.
    """
    logger.info("Base existante sans registre de migrations — adoption en cours.")

    with engine.begin() as conn:
        _ensure_registry(conn)
        adopted, remaining = [], []
        for migration in MIGRATIONS:
            if migration.already_applied(conn):
                _stamp(conn, migration)
                adopted.append(migration.version)
            else:
                remaining.append(migration.version)

    logger.info(
        "Adoption terminée — déjà en place : %s ; à appliquer : %s",
        adopted or "aucune", remaining or "aucune",
    )


def _guard_against_newer_database(done: set[int]) -> None:
    known = {m.version for m in MIGRATIONS}
    unknown = done - known
    if unknown:
        raise RuntimeError(
            f"La base a été migrée par une version plus récente de RideLog "
            f"(migrations inconnues : {sorted(unknown)}). Ce code ne sait pas "
            f"la lire sans risquer d'y écrire des données incohérentes. "
            f"Remettez l'image à jour, ou restaurez une sauvegarde depuis "
            f"{BACKUP_DIR}."
        )


def current_version(engine: Engine) -> int:
    """Plus haute migration appliquée — 0 si aucune. Pour le diagnostic."""
    with engine.connect() as conn:
        done = applied_versions(conn)
    return max(done) if done else 0


# ═══════════════════════════════════════════════════════════════════════════
# Contrôle d'intégrité
# ═══════════════════════════════════════════════════════════════════════════

def schema_fingerprint(engine: Engine) -> dict:
    """Empreinte comparable du schéma : tables, colonnes, types, nullabilité,
    index et unicité.

    Sert au test de parité entre une base neuve et une base migrée — le contrôle
    qui attrape une divergence entre les deux chemins de création du schéma.
    Le registre lui-même est exclu : son contenu diffère légitimement.
    """
    inspector = inspect(engine)
    fingerprint: dict = {}

    for table in sorted(inspector.get_table_names()):
        if table == REGISTRY_TABLE:
            continue
        columns = {}
        for col in inspector.get_columns(table):
            columns[col["name"]] = {
                "type": str(col["type"]).upper(),
                "nullable": bool(col["nullable"]),
                "primary_key": bool(col.get("primary_key", False)),
            }
        indexes = sorted(
            (idx["name"] or "", tuple(idx["column_names"]), bool(idx.get("unique", False)))
            for idx in inspector.get_indexes(table)
        )
        uniques = sorted(
            tuple(uc["column_names"]) for uc in inspector.get_unique_constraints(table)
        )
        fingerprint[table] = {
            "columns": columns,
            "indexes": indexes,
            "unique_constraints": uniques,
        }

    return fingerprint
