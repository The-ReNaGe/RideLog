"""Le carnet d'entretien — un PDF à remettre lors d'une vente.

Ce que ce document n'est pas
────────────────────────────
Ce n'est pas l'archive ZIP. Celle-ci rassemble les justificatifs : elle
prouve. Le carnet, lui, **récapitule** — une ligne par intervention, dans
l'ordre chronologique, sur deux ou trois pages qu'un acheteur lit debout dans
un parking. Les deux répondent à des questions différentes, et remplacer l'un
par l'autre laisserait soit un acheteur devant quarante PDF à recouper, soit
un vendeur avec un tableau que rien n'appuie.

Pourquoi il est austère, et doit le rester
──────────────────────────────────────────
Il sert à convaincre quelqu'un qui ne connaît ni le vendeur ni RideLog. Un
document couvert d'aplats de couleur, d'émojis et de coins arrondis se lit
comme une capture d'écran d'application ; un tableau réglé, en noir sur blanc,
avec un filet sous l'en-tête et une pagination « 1/3 », se lit comme un
relevé. C'est la même information et ce n'est pas la même crédibilité.

D'où : aucune couleur en aplat hors des filets, aucune icône, une seule
famille de caractères, et rien qui nomme un outil de génération autrement que
dans la mention de pied de page.

Ce que le document affirme, et ce qu'il n'affirme pas
─────────────────────────────────────────────────────
Il affirme ce que le propriétaire a consigné, rien de plus. La colonne
« Factures » compte les justificatifs archivés dans RideLog : le seul appui
vérifiable qu'il offre, et la raison pour laquelle le carnet voyage **aussi**
dans l'archive, à côté des pièces qu'il dénombre.

Il n'y a **pas de mention légale en pied de page**. Elle y était, elle a été
retirée : quatre lignes de précautions sur un document d'une page disent au
lecteur qu'on se méfie de son propre document. L'en-tête de chaque colonne se
suffit, et c'est ce qui permet de garder la feuille courte.

Les montants gardent la devise de leur saisie (§20.7). Un total n'est jamais
affiché à cheval sur deux devises : il est ventilé, comme partout ailleurs.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from currency import symbol_of

logger = logging.getLogger(__name__)

# ── Palette : trois gris et un filet. Aucun aplat. ─────────────────────────
#
# Les fonds gris ont été retirés : le document se sort sur l'imprimante du
# vendeur, souvent en noir et blanc, et un aplat étendu vide une cartouche
# pour un gain de lisibilité nul — deux filets font le même travail de
# séparation. Ne pas les réintroduire.
INK = colors.HexColor("#1a1a1a")
MUTED = colors.HexColor("#6b6b6b")
RULE = colors.HexColor("#9a9a9a")
HAIRLINE = colors.HexColor("#d4d4d4")

MARGIN = 18 * mm
CONTENT_WIDTH = A4[0] - 2 * MARGIN

KM_PER_MILE = 1.609344

CATEGORY_LABELS = {
    "scheduled": "Entretien",
    "repair": "Réparation",
    "modification": "Modification",
}

# Qui a réalisé l'intervention. Libellés complets pour le CSV ; le carnet
# abrège « Professionnel » en « Pro » — la colonne fait 18 mm, et « Soi-même »
# y tient déjà de justesse.
PERFORMED_BY_LABELS = {"pro": "Professionnel", "self": "Soi-même"}
PERFORMED_BY_SHORT = {"pro": "Pro", "self": "Soi-même"}

MOTORIZATION_LABELS = {
    "essence": "Essence",
    "diesel": "Diesel",
    "hybride": "Hybride",
    "electrique": "Électrique",
    "thermal": "Thermique",
}

TYPE_LABELS = {"car": "Voiture", "motorcycle": "Moto"}


# ═══════════════════════════════════════════════════════════════════════════
# Formatage
# ═══════════════════════════════════════════════════════════════════════════

NBSP = " "


def _number(value: float, decimals: int = 0) -> str:
    """« 62 137 » / « 1 234,56 » — séparateurs français.

    Le carnet est un document français, comme le reste de l'interface. Il
    n'emprunte pas le formatage localisé du frontend : celui-ci vit dans un
    hook React (§20.6) qui n'existe pas ici.
    """
    text = f"{value:,.{decimals}f}"
    return text.replace(",", NBSP).replace(".", ",")


def _distance(km: int | float | None, units: str) -> str:
    if km is None:
        return "—"
    if units == "imperial":
        return f"{_number(round(km / KM_PER_MILE))}{NBSP}mi"
    return f"{_number(round(km))}{NBSP}km"


def _money(amount: float | None, code: str | None, fallback: str) -> str:
    if amount is None:
        return "—"
    return f"{_number(amount, 2)}{NBSP}{symbol_of(code or fallback)}"


def _totals(totals: dict[str, float]) -> str:
    """« 1 234,00 € » ou « 1 234,00 € + 300,00 $ » — jamais une somme mêlée."""
    if not totals:
        return "—"
    return "  +  ".join(
        f"{_number(value, 2)}{NBSP}{symbol_of(code)}" for code, value in totals.items()
    )


def _date(value: datetime | None) -> str:
    return value.strftime("%d/%m/%Y") if value else "—"


# ═══════════════════════════════════════════════════════════════════════════
# Styles
# ═══════════════════════════════════════════════════════════════════════════

def _styles() -> dict[str, ParagraphStyle]:
    base = ParagraphStyle(
        "base", fontName="Helvetica", fontSize=8.5, leading=11, textColor=INK
    )
    return {
        "title": ParagraphStyle(
            "title", parent=base, fontName="Helvetica-Bold", fontSize=17, leading=20,
        ),
        "subtitle": ParagraphStyle(
            "subtitle", parent=base, fontSize=10, leading=13, textColor=MUTED,
        ),
        "section": ParagraphStyle(
            "section", parent=base, fontName="Helvetica-Bold", fontSize=9,
            leading=11, textColor=MUTED,
        ),
        "cell": base,
        "cell_bold": ParagraphStyle("cell_bold", parent=base, fontName="Helvetica-Bold"),
        "cell_right": ParagraphStyle("cell_right", parent=base, alignment=TA_RIGHT),
        "detail": ParagraphStyle(
            "detail", parent=base, fontSize=7.5, leading=9.5, textColor=MUTED,
        ),
        # `leftIndent` > `bulletIndent` : les lignes de repli d'un poste long
        # s'alignent sous son texte, pas sous le tiret. Sans cet écart, une
        # liste de neuf postes redevient le pavé qu'elle remplace.
        "bullet": ParagraphStyle(
            "bullet", parent=base, fontSize=7.5, leading=9.5, textColor=MUTED,
            leftIndent=7, bulletIndent=0, spaceAfter=1.5,
        ),
        "head": ParagraphStyle(
            "head", parent=base, fontName="Helvetica-Bold", fontSize=7.5, leading=9.5,
        ),
        "head_right": ParagraphStyle(
            "head_right", parent=base, fontName="Helvetica-Bold", fontSize=7.5,
            leading=9.5, alignment=TA_RIGHT,
        ),
        "note": ParagraphStyle(
            "note", parent=base, fontSize=7.5, leading=10, textColor=MUTED,
        ),
    }


def _escape(text: str | None) -> str:
    """Un `&` ou un `<` dans une note d'entretien ne doit pas casser le rendu."""
    if not text:
        return ""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


# ═══════════════════════════════════════════════════════════════════════════
# Blocs du document
# ═══════════════════════════════════════════════════════════════════════════

def _identity_rows(vehicle, units: str) -> list[list[str]]:
    """Les caractéristiques du véhicule, dans l'ordre où un acheteur les cherche.

    **Pas de `vehicle.name`.** C'est le surnom que le propriétaire donne à sa
    fiche dans l'application — « Ma Ducati », « La familiale ». Utile pour s'y
    retrouver dans son garage, hors sujet sur un document remis à un tiers, et
    de nature à faire passer le carnet pour une capture d'écran.

    **La plaque est en tête**, quand elle est renseignée : c'est la seule ligne
    qui dit que le document décrit *ce* véhicule-là et pas un modèle
    équivalent. Sans elle, le carnet reste vrai mais ne prouve plus rien.
    """
    rows = []
    if vehicle.license_plate:
        rows.append(("Immatriculation", vehicle.license_plate))
    rows += [
        ("Marque et modèle", f"{vehicle.brand} {vehicle.model}"),
        ("Catégorie", TYPE_LABELS.get(vehicle.vehicle_type, vehicle.vehicle_type)),
        ("Année", str(vehicle.year) if vehicle.year else "—"),
        ("Mise en circulation", _date(vehicle.registration_date)),
        (
            "Motorisation",
            MOTORIZATION_LABELS.get(vehicle.motorization, vehicle.motorization or "—"),
        ),
    ]
    if vehicle.displacement:
        rows.append(("Cylindrée", f"{_number(vehicle.displacement)}{NBSP}cm³"))
    rows.append(("Kilométrage relevé", _distance(vehicle.current_mileage, units)))
    return [[label, value or "—"] for label, value in rows]


def _identity_table(rows, styles, width: float) -> Table:
    data = [
        [Paragraph(label, styles["note"]), Paragraph(_escape(value), styles["cell_bold"])]
        for label, value in rows
    ]
    table = Table(data, colWidths=[width * 0.44, width * 0.56])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LINEBELOW", (0, 0), (-1, -2), 0.4, HAIRLINE),
            ]
        )
    )
    return table


def _summary_table(cells: list[tuple[str, str]], styles, width: float) -> Table:
    data = [
        [Paragraph(label.upper(), styles["note"]) for label, _ in cells],
        [Paragraph(_escape(value), styles["cell_bold"]) for _, value in cells],
    ]
    table = Table(data, colWidths=[width / len(cells)] * len(cells))
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("LEFTPADDING", (1, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (0, 0), 6),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
                ("TOPPADDING", (0, 1), (-1, 1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 0),
                ("LINEABOVE", (0, 0), (-1, 0), 0.8, RULE),
                ("LINEBELOW", (0, -1), (-1, -1), 0.8, RULE),
            ]
        )
    )
    return table


def _detail_flowables(maintenance, styles) -> list:
    """Ce que l'intervention a couvert — une ligne par poste.

    Les sous-interventions d'une révision (§15) vivent dans un seul
    enregistrement. Sans elles, la ligne « Entretien annuel » ne dit pas si les
    plaquettes ont été changées, ce qu'un acheteur cherche précisément.

    Elles étaient d'abord jointes par des points médians, en un seul
    paragraphe. Sur un entretien annuel qui en compte neuf, cela donnait un
    pavé de huit lignes coupées n'importe où, illisible **et** faux à l'œil :
    on n'y distinguait plus « Remplacement filtre à air » de « Remplacement
    filtre à huile ». Une puce par poste coûte la même hauteur et se parcourt
    d'un regard — c'est un document qu'on lit en diagonale.
    """
    out = []
    subs = maintenance.sub_interventions or []
    if isinstance(subs, list):
        for sub in subs:
            if isinstance(sub, dict) and sub.get("name"):
                out.append(
                    Paragraph(_escape(sub["name"]), styles["bullet"], bulletText="\u2013")
                )
    if maintenance.notes:
        out.append(Paragraph(f"<i>{_escape(maintenance.notes)}</i>", styles["detail"]))
    return out or [Paragraph("", styles["detail"])]


def _history_table(maintenances, styles, units: str, fallback_currency: str) -> Table:
    # La somme des largeurs vaut CONTENT_WIDTH (174 mm) — au-delà, le tableau
    # déborde de la feuille sans qu'aucune erreur ne le signale.
    widths = [19 * mm, 20 * mm, 18 * mm, 32 * mm, 34 * mm, 18 * mm, 19 * mm, 14 * mm]
    # « Factures » plutôt que « Just. » : la mention de pied qui expliquait
    # l'abréviation a été retirée, un en-tête doit donc se suffire.
    # Les trois colonnes de chiffres sont alignées à droite, en-tête compris,
    # sans quoi l'intitulé flotte au-dessus d'une colonne qui, elle, est calée.
    header = [
        Paragraph(label, styles["head_right"] if right else styles["head"])
        for label, right in (
            ("Date", False), ("Compteur", True), ("Catégorie", False),
            ("Intervention", False), ("Détail", False), ("Par", False),
            ("Coût", True), ("Factures", True),
        )
    ]
    data = [header]
    for m in maintenances:
        label = (
            m.other_description
            if m.intervention_type == "Autre" and m.other_description
            else m.intervention_type
        )
        invoices = len(m.invoices or [])
        data.append(
            [
                Paragraph(_date(m.execution_date), styles["cell"]),
                Paragraph(_distance(m.mileage_at_intervention, units), styles["cell_right"]),
                Paragraph(
                    CATEGORY_LABELS.get(
                        m.maintenance_category or "scheduled", m.maintenance_category or ""
                    ),
                    styles["cell"],
                ),
                Paragraph(_escape(label), styles["cell_bold"]),
                _detail_flowables(m, styles),
                # « — » plutôt qu'une case vide : une colonne à trous se lit
                # comme un oubli de mise en page, un tiret comme une réponse.
                Paragraph(PERFORMED_BY_SHORT.get(m.performed_by, "—"), styles["cell"]),
                Paragraph(_money(m.cost_paid, m.currency, fallback_currency), styles["cell_right"]),
                Paragraph(str(invoices) if invoices else "—", styles["cell_right"]),
            ]
        )

    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("LEFTPADDING", (1, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (-1, 0), (-1, -1), 0),
                # L'en-tête se répète en haut de chaque page (`repeatRows`) :
                # une colonne « 62 137 » sans intitulé, page 3, ne veut rien dire.
                ("LINEABOVE", (0, 0), (-1, 0), 0.8, RULE),
                ("LINEBELOW", (0, 0), (-1, 0), 0.8, RULE),
                ("LINEBELOW", (0, 1), (-1, -2), 0.4, HAIRLINE),
                ("LINEBELOW", (0, -1), (-1, -1), 0.8, RULE),
            ]
        )
    )
    return table


# ═══════════════════════════════════════════════════════════════════════════
# Gabarit de page
# ═══════════════════════════════════════════════════════════════════════════

def _numbered_canvas(footer_left: str):
    """Un canevas qui connaît le nombre total de pages.

    Le pied doit dire « 2/3 », pas « page 2 » : c'est ce qui permet à
    l'acheteur de constater qu'on ne lui a pas retiré la dernière feuille.
    Or au moment où reportlab peint la page 2, le total n'existe pas encore.

    La parade classique : retenir l'état de chaque page au lieu de l'émettre,
    puis tout rejouer à la fermeture, quand le compte est connu. Une passe de
    rendu, pas deux — `multiBuild` ne relancerait de toute façon le document
    que s'il portait un index ou une table des matières.
    """

    class _Canvas(canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._pages: list[dict] = []

        def showPage(self):  # noqa: N802 — API reportlab
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                self._footer(total)
                super().showPage()
            super().save()

        def _footer(self, total: int):
            self.saveState()
            y = MARGIN + 3 * mm
            self.setStrokeColor(HAIRLINE)
            self.setLineWidth(0.4)
            self.line(MARGIN, y + 5 * mm, A4[0] - MARGIN, y + 5 * mm)
            self.setFont("Helvetica", 7.5)
            self.setFillColor(MUTED)
            self.drawString(MARGIN, y, footer_left)
            self.drawRightString(A4[0] - MARGIN, y, f"{self._pageNumber}/{total}")
            self.restoreState()

    return _Canvas


# ═══════════════════════════════════════════════════════════════════════════
# Point d'entrée
# ═══════════════════════════════════════════════════════════════════════════

def build_maintenance_booklet(
    vehicle,
    maintenances,
    *,
    units: str = "metric",
    currency: str = "EUR",
    totals_by_currency: dict[str, float] | None = None,
    generated_at: datetime | None = None,
) -> bytes:
    """Le carnet d'entretien complet, en octets.

    `maintenances` est attendu **trié par date croissante** : un acheteur lit
    un historique dans le sens où il s'est produit, pas du plus récent au plus
    ancien comme l'écran de l'application.
    """
    styles = _styles()
    generated_at = generated_at or datetime.now(timezone.utc)
    totals = totals_by_currency or {}

    story: list = []

    # ── Titre ────────────────────────────────────────────────────────────
    story.append(Paragraph("Carnet d'entretien", styles["title"]))
    story.append(
        Paragraph(
            f"{_escape(vehicle.brand)} {_escape(vehicle.model)}"
            + (f" — {vehicle.year}" if vehicle.year else ""),
            styles["subtitle"],
        )
    )
    story.append(Spacer(1, 7 * mm))

    # ── Identification ───────────────────────────────────────────────────
    #
    # Sur DEUX colonnes. En une seule, les caractéristiques laissaient la
    # moitié droite de la feuille vide : un blanc de cette taille, en haut
    # d'un document, se lit comme une page mal finie.
    rows = _identity_rows(vehicle, units)
    half = (len(rows) + 1) // 2
    header = Table(
        [[
            _identity_table(rows[:half], styles, CONTENT_WIDTH * 0.46),
            _identity_table(rows[half:], styles, CONTENT_WIDTH * 0.46),
        ]],
        colWidths=[CONTENT_WIDTH * 0.5, CONTENT_WIDTH * 0.5],
    )
    header.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("LEFTPADDING", (1, 0), (1, 0), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(header)
    story.append(Spacer(1, 7 * mm))

    # ── Synthèse ─────────────────────────────────────────────────────────
    dates = [m.execution_date for m in maintenances if m.execution_date]
    period = f"{_date(min(dates))} – {_date(max(dates))}" if dates else "—"
    documents = sum(len(m.invoices or []) for m in maintenances)
    story.append(
        _summary_table(
            [
                ("Interventions", str(len(maintenances))),
                ("Période couverte", period),
                ("Montant engagé", _totals(totals)),
                ("Factures", str(documents)),
            ],
            styles,
            CONTENT_WIDTH,
        )
    )
    story.append(Spacer(1, 8 * mm))

    # ── Historique ───────────────────────────────────────────────────────
    story.append(Paragraph("HISTORIQUE DES INTERVENTIONS", styles["section"]))
    story.append(Spacer(1, 3 * mm))
    if maintenances:
        story.append(_history_table(maintenances, styles, units, currency))
    else:
        story.append(
            Paragraph("Aucune intervention n'a été consignée pour ce véhicule.", styles["note"])
        )

    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN + 10 * mm,
        title=f"Carnet d'entretien — {vehicle.brand} {vehicle.model}",
        author="RideLog",
        subject="Historique des interventions",
    )
    # Le pied nomme le véhicule par sa plaque, ou à défaut par son modèle —
    # jamais par `vehicle.name`, pour la raison donnée dans `_identity_rows`.
    identifier = vehicle.license_plate or f"{vehicle.brand} {vehicle.model}"
    footer = f"{identifier} — édité le {generated_at.strftime('%d/%m/%Y')} avec RideLog"
    document.build(story, canvasmaker=_numbered_canvas(footer))
    return buffer.getvalue()
