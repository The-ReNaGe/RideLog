"""Le carnet d'entretien PDF — la sortie qu'on remet à un acheteur.

Ce que ces tests verrouillent, et pourquoi ce sont ces choses-là :

- **la route existe et rend bien un PDF** — le carnet est un fichier binaire
  produit par une dépendance externe (reportlab) ; une erreur d'import ou de
  mise en page se traduirait par un 500 qu'aucun autre test ne verrait ;
- **le contrôle d'accès passe par `access.py`** (§22.1) — un export est une
  lecture, il doit donc suivre le partage famille et rester muet sur le parc
  des autres ;
- **l'ordre chronologique** — c'est la propriété qui distingue le carnet de
  l'écran d'historique, et rien à la lecture du PDF ne la rattraperait ;
- **la ventilation par devise** — additionner deux monnaies dans le bandeau de
  synthèse produirait un chiffre faux et silencieux (§20.7).

Le contenu textuel est vérifié en extrayant les chaînes du flux PDF plutôt
qu'en relisant le code : c'est la seule façon de constater que ce qui est
affirmé ici arrive vraiment sur la feuille.
"""

import re
import zipfile
from io import BytesIO

import pytest

import config as app_config


@pytest.fixture(autouse=True)
def readable_pdf_streams():
    """Le PDF est produit sans compression, le temps du test.

    Par défaut reportlab empile ASCII85 sur Flate : lisible par un lecteur
    PDF, opaque à une expression régulière. Couper la compression rend le flux
    de contenu inspectable sans ajouter un lecteur PDF aux dépendances de test
    pour vérifier trois libellés.
    """
    import reportlab.rl_config as rl_config

    previous = rl_config.pageCompression
    rl_config.pageCompression = 0
    yield
    rl_config.pageCompression = previous


@pytest.fixture()
def open_registration():
    """Inscriptions libres — évite de fabriquer une invitation par compte."""
    previous = app_config.REGISTRATION_MODE
    app_config.REGISTRATION_MODE = "open"
    yield
    app_config.REGISTRATION_MODE = previous


def _account(client, username="vendeur"):
    client.post("/api/auth/register", json={
        "username": username, "display_name": username,
        "password": "Password123", "password_confirm": "Password123",
    })
    token = client.post("/api/auth/login", json={
        "username": username, "password": "Password123",
    }).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def headers(client):
    return _account(client)


@pytest.fixture()
def vehicle_id(client, headers):
    res = client.post("/api/vehicles", headers=headers, json={
        "name": "Ma moto", "brand": "Yamaha", "model": "MT-07",
        "year": 2021, "vehicle_type": "motorcycle", "displacement": 689,
        "motorization": "essence", "current_mileage": 20000,
    })
    assert res.status_code in (200, 201), res.text
    return res.json()["id"]


def _record(client, headers, vehicle_id, label, date, mileage, **extra):
    payload = {
        "intervention_type": label,
        "execution_date": date,
        "mileage_at_intervention": mileage,
        "maintenance_category": "scheduled",
    }
    payload.update(extra)
    res = client.post(
        f"/api/vehicles/{vehicle_id}/maintenances", headers=headers, json=payload
    )
    assert res.status_code in (200, 201), res.text
    return res.json()


def _booklet(client, headers, vehicle_id):
    res = client.get(f"/api/vehicles/{vehicle_id}/recap/booklet.pdf", headers=headers)
    assert res.status_code == 200, res.text
    return res


def _pdf_text(payload: bytes) -> str:
    """Les chaînes littérales du PDF, dans l'ordre où elles sont peintes.

    Suffisant pour constater qu'une date, un symbole ou un libellé arrive bien
    sur la feuille — et, comme l'ordre de peinture suit l'ordre du document,
    pour vérifier un tri. Les caractères non ASCII sont échappés en octal dans
    le flux, selon l'encodage WinAnsi des polices de base.
    """
    pieces = []
    for raw in re.findall(rb"\((.*?)\)\s*Tj", payload, re.S):
        unescaped = re.sub(
            rb"\\([0-7]{3})", lambda m: bytes([int(m.group(1), 8)]), raw
        )
        unescaped = re.sub(rb"\\([()\\\\])", lambda m: m.group(1), unescaped)
        pieces.append(unescaped.decode("cp1252", errors="replace"))
    return " ".join(pieces)


def test_the_booklet_is_a_pdf_offered_as_a_download(client, headers, vehicle_id):
    res = _booklet(client, headers, vehicle_id)
    assert res.headers["content-type"].startswith("application/pdf")
    assert "attachment" in res.headers["content-disposition"]
    assert ".pdf" in res.headers["content-disposition"]
    assert res.content.startswith(b"%PDF")


def test_the_booklet_lists_interventions_from_oldest_to_newest(client, headers, vehicle_id):
    """Un carnet se lit dans le sens où les entretiens ont eu lieu.

    L'écran d'historique trie du plus récent au plus ancien ; reprendre cet
    ordre tel quel donnerait un document qui commence par la fin.
    """
    _record(client, headers, vehicle_id, "Remplacement liquide de frein",
            "2024-03-04T10:00:00", 12000)
    _record(client, headers, vehicle_id, "Contrôle jeu aux soupapes",
            "2022-06-21T10:00:00", 5000)
    _record(client, headers, vehicle_id, "Révision fourche",
            "2026-01-15T10:00:00", 19000)

    # À partir du tableau seulement : le bandeau de synthèse cite déjà les
    # dates extrêmes, et les chercher dans le document entier ferait passer le
    # test pour la mauvaise raison.
    text = _pdf_text(_booklet(client, headers, vehicle_id).content)
    history = text[text.index("HISTORIQUE DES INTERVENTIONS"):]
    positions = [history.index(d) for d in ("21/06/2022", "04/03/2024", "15/01/2026")]
    assert positions == sorted(positions), history


def test_the_booklet_identifies_the_vehicle(client, headers, vehicle_id):
    text = _pdf_text(_booklet(client, headers, vehicle_id).content)
    assert "Yamaha" in text and "MT-07" in text


def test_the_booklet_never_prints_the_nickname_given_in_the_app(client, headers, vehicle_id):
    """« Ma moto » est un repère personnel, pas une identité de véhicule.

    Sur un document remis à un tiers, ce surnom ne désigne rien et donne au
    carnet l'air d'une capture d'écran d'application.
    """
    text = _pdf_text(_booklet(client, headers, vehicle_id).content)
    assert "Ma moto" not in text


def test_the_plate_is_printed_and_normalised(client, headers):
    """La plaque est ce qui rattache le carnet à un véhicule physique.

    Saisie « ab123cd », elle doit s'écrire comme sur la carte grise : un
    acheteur compare deux chaînes, pas deux intentions.
    """
    created = client.post("/api/vehicles", headers=headers, json={
        "name": "Ma moto", "brand": "Yamaha", "model": "MT-07",
        "year": 2021, "vehicle_type": "motorcycle", "displacement": 689,
        "motorization": "essence", "current_mileage": 20000,
        "license_plate": "ab123cd",
    })
    assert created.status_code in (200, 201), created.text
    assert created.json()["license_plate"] == "AB-123-CD"

    text = _pdf_text(_booklet(client, headers, created.json()["id"]).content)
    assert "AB-123-CD" in text
    assert "Immatriculation" in text


def test_a_vehicle_without_a_plate_simply_omits_the_line(client, headers, vehicle_id):
    """Le parc existant n'en a pas — la ligne disparaît, elle ne s'affiche pas vide."""
    text = _pdf_text(_booklet(client, headers, vehicle_id).content)
    assert "Immatriculation" not in text


def test_an_unreadable_plate_is_refused_rather_than_stored_as_typed(client, headers):
    """Une plaque fausse imprimée sur un document de vente est pire que pas de plaque."""
    res = client.post("/api/vehicles", headers=headers, json={
        "name": "Ma moto", "brand": "Yamaha", "model": "MT-07",
        "year": 2021, "vehicle_type": "motorcycle", "displacement": 689,
        "motorization": "essence", "current_mileage": 20000,
        "license_plate": "PAS-UNE-PLAQUE",
    })
    assert res.status_code == 400
    assert "plaque" in res.json()["detail"].lower()


def test_a_two_currency_history_is_never_summed_into_one_symbol(client, headers, vehicle_id, db_session):
    """200 € + 200 $ ne fait pas 400 — et surtout pas « 400 € ».

    Le cas se produit quand on change de devise sans convertir (§20.7). Le
    bandeau de synthèse doit alors montrer les deux montants côte à côte.
    """
    from models import Maintenance

    _record(client, headers, vehicle_id, "Révision fourche",
            "2024-03-04T10:00:00", 12000, cost_paid=200)
    _record(client, headers, vehicle_id, "Remplacement liquide de frein",
            "2025-03-04T10:00:00", 15000, cost_paid=200)

    marked = db_session.query(Maintenance).order_by(Maintenance.execution_date).all()
    marked[1].currency = "USD"
    db_session.commit()

    text = _pdf_text(_booklet(client, headers, vehicle_id).content)
    assert "€" in text and "$" in text
    assert "400" not in text


def test_a_vehicle_of_someone_else_yields_the_same_404_as_a_missing_one(
    client, headers, vehicle_id, open_registration
):
    """L'export suit le contrôle d'accès commun, il ne réécrit pas le sien."""
    intruder = _account(client, "curieux")
    foreign = client.get(f"/api/vehicles/{vehicle_id}/recap/booklet.pdf", headers=intruder)
    missing = client.get("/api/vehicles/999999/recap/booklet.pdf", headers=intruder)
    assert foreign.status_code == 404
    assert missing.status_code == 404
    assert foreign.json() == missing.json()


def test_the_booklet_requires_authentication(client, vehicle_id):
    assert client.get(f"/api/vehicles/{vehicle_id}/recap/booklet.pdf").status_code == 401


def test_the_archive_carries_the_booklet_alongside_the_invoices(client, headers, vehicle_id):
    """Le carnet dénombre des justificatifs ; il voyage avec eux."""
    _record(client, headers, vehicle_id, "Révision fourche", "2024-03-04T10:00:00", 12000)

    res = client.get(f"/api/vehicles/{vehicle_id}/recap/download", headers=headers)
    assert res.status_code == 200
    names = zipfile.ZipFile(BytesIO(res.content)).namelist()
    assert any(n.endswith(".pdf") and "carnet" in n for n in names), names
    assert "recapitulatif_entretiens.csv" in names


def test_the_csv_names_the_currency_instead_of_hardcoding_one(client, headers, vehicle_id):
    """Un en-tête « Coût (€) » mentirait dès la première ligne en dollars."""
    _record(client, headers, vehicle_id, "Révision fourche",
            "2024-03-04T10:00:00", 12000, cost_paid=200)

    res = client.get(f"/api/vehicles/{vehicle_id}/recap/download", headers=headers)
    csv_text = zipfile.ZipFile(BytesIO(res.content)).read(
        "recapitulatif_entretiens.csv"
    ).decode("utf-8")
    header = csv_text.splitlines()[0]
    assert "Devise" in header
    assert "Coût (€)" not in header
    assert "EUR" in csv_text.splitlines()[1]


def test_an_empty_history_still_produces_a_readable_booklet(client, headers, vehicle_id):
    """Un véhicule neuf se vend aussi. Le carnet doit le dire, pas planter."""
    text = _pdf_text(_booklet(client, headers, vehicle_id).content)
    assert "Aucune intervention" in text


def test_a_note_containing_markup_is_not_taken_for_formatting(client, headers, vehicle_id):
    """reportlab interprète un mini-langage de balises dans les paragraphes.

    Une note contenant « pneus <avant & arrière> » ferait échouer la mise en
    page — et le vendeur perdrait son document à cause d'un chevron.
    """
    _record(client, headers, vehicle_id, "Remplacement pneus",
            "2024-03-04T10:00:00", 12000, notes="pneus <avant & arrière>")
    assert _booklet(client, headers, vehicle_id).content.startswith(b"%PDF")
