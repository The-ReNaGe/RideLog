"""
Couture régionale — ce qui dépend du pays, et non de la langue.

Pourquoi ce paquet existe
─────────────────────────
Une partie du projet n'est pas seulement écrite en français : elle est
spécifique à la France, et le resterait même après traduction de l'interface.
Le format d'une plaque, l'API qui la décode et les champs qu'elle renvoie
(`marque`, `energieNGC`, `date1erCir_fr`…), le calendrier réglementaire du
contrôle technique, le fichier des communes, la source des prix de carburant :
rien de tout cela ne se traduit, il faut le remplacer pays par pays.

Tant que cette logique vivait dispersée dans `routes/vehicles.py`, rien ne
signalait qu'elle était nationale. Ajouter un second pays aurait voulu dire
relire chaque route à la recherche des hypothèses françaises implicites.

Ce que ce paquet fait aujourd'hui
─────────────────────────────────
Il porte la **lecture de plaque**, et elle seule. Le pays actif se lit dans la
variable d'environnement `REGION` (défaut `FR`) : le comportement d'une
installation existante est donc inchangé.

Ce qu'il reste à y faire remonter
─────────────────────────────────
Trois blocs sont encore franco-spécifiques et à déplacer ici quand un second
pays sera réellement demandé — les déplacer avant serait de l'abstraction sans
second cas pour la valider :

- `maintenance_calculator.calculate_inspection_technical_date()` — calendrier
  du contrôle technique, purement réglementaire français ;
- `routes/fuel_stations.py` — `communes.csv` et prix-carburants.gouv.fr ;
- `data/maintenance_intervals.json` — libellés français, dont les clés
  techniques sont désormais découplées (voir migration 007).
"""

import os
import re
from typing import Protocol


class Region(Protocol):
    """Ce qu'un pays doit fournir pour que la lecture de plaque fonctionne."""

    code: str
    name: str
    plate_example: str

    def normalize_plate(self, plate: str) -> str:
        """Forme canonique de la plaque, ou chaîne vide si le format est invalide."""

    def parse_plate_response(self, payload: dict, vehicle_type_hint: str = None) -> dict:
        """Traduit la réponse du service national en champs véhicule RideLog."""


def format_model_text(value: str) -> str:
    """Normalise une marque ou un modèle renvoyé par un service externe.

    Partagé entre les analyseurs régionaux et le décodage de VIN (NHTSA) : les
    sources externes renvoient indifféremment « PEUGEOT », « peugeot » ou
    « Peugeot 308 SW », et les chiffres romains doivent rester en capitales.
    """
    text = re.sub(r"\s+", " ", (value or "").strip())
    if not text:
        return ""
    titled = text.title()
    return re.sub(
        r"\b([ivxlcdm]{1,8})\b",
        lambda m: m.group(1).upper(),
        titled,
        flags=re.IGNORECASE,
    )


def to_int(value):
    """Premier nombre trouvé dans une valeur, arrondi. None si aucun.

    Les services de plaque renvoient des nombres sous des formes très variées
    (« 1998 cm3 », « 5,5 », 7) — d'où l'extraction tolérante.
    """
    if value is None:
        return None
    text = str(value).replace(",", ".")
    match = re.search(r"\d+(?:\.\d+)?", text)
    if not match:
        return None
    return int(round(float(match.group(0))))


# ═══════════════════════════════════════════════════════════════════════════
# Registre
# ═══════════════════════════════════════════════════════════════════════════

from regions import fr as _fr  # noqa: E402  (import après les helpers partagés)

REGIONS: dict[str, Region] = {
    _fr.REGION.code: _fr.REGION,
}

DEFAULT_REGION_CODE = "FR"


def get_region(code: str = None) -> Region:
    """Pays actif. Un code inconnu retombe sur la France plutôt que d'empêcher
    le démarrage : une variable d'environnement mal orthographiée ne doit pas
    rendre l'instance inutilisable."""
    wanted = (code or os.getenv("REGION") or DEFAULT_REGION_CODE).strip().upper()
    return REGIONS.get(wanted, REGIONS[DEFAULT_REGION_CODE])
