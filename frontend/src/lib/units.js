/**
 * Système d'unités de l'interface.
 *
 * Ce que ce module fait, et ne fait pas
 * ─────────────────────────────────────
 * Il convertit **à l'affichage uniquement**. La base reste intégralement en
 * kilomètres et en litres, quoi que choisisse l'utilisateur.
 *
 * C'est le point à ne jamais défaire. Stocker les valeurs dans l'unité choisie
 * au moment de la saisie rendrait tout l'historique ambigu : un relevé de
 * 30 000 saisi l'an dernier, faut-il le lire en kilomètres ou en miles ? Un
 * changement de préférence réécrirait le passé. Et deux membres d'un groupe
 * famille, qui partagent les mêmes véhicules avec des réglages différents,
 * verraient deux historiques incohérents. Une seule unité en base, la
 * conversion au dernier moment.
 *
 * « Sans nombre à virgule »
 * ─────────────────────────
 * Les distances sont des entiers, des deux côtés. Un compteur affiche 62 137
 * miles, pas 62 137,12 — et une échéance « dans 621 miles » ne gagne rien à
 * porter des décimales. `toDisplay` et `toStorage` arrondissent donc toutes
 * deux à l'entier.
 *
 * Conséquence à connaître : la conversion n'est pas exactement réversible.
 * Saisir 1 000 miles enregistre 1 609 km, qui se réaffichent en 1 000 miles —
 * ça retombe juste ici, mais pas pour toute valeur. L'écart est d'au plus
 * 1 mile, invisible sur un compteur, et c'est le prix explicitement accepté
 * de l'absence de décimales.
 *
 * La consommation fait exception, et c'est inévitable : L/100 km et MPG sont
 * deux grandeurs INVERSES l'une de l'autre. Un entier y perdrait trop
 * d'information (5,2 et 5,8 L/100 km deviendraient tous deux « 5 »), donc une
 * décimale y est conservée. Le prix au litre aussi, pour la même raison :
 * arrondi à l'entier, un carburant à 1,79 € coûterait « 2 € ».
 */

const KM_PER_MILE = 1.609344;
const LITRES_PER_GALLON_UK = 4.54609; // gallon impérial, celui du Royaume-Uni

export const UNIT_SYSTEMS = [
  { code: 'metric', label: 'Kilomètres', hint: 'km, litres, L/100 km' },
  { code: 'imperial', label: 'Miles', hint: 'miles, gallons, MPG' },
];

export const DEFAULT_UNITS = 'metric';

export function isImperial(units) {
  return units === 'imperial';
}

// ── Distances ──────────────────────────────────────────────────────────────

/** Kilomètres stockés → valeur à afficher, entière. */
export function distanceToDisplay(km, units) {
  if (km === null || km === undefined || km === '') return km;
  const n = Number(km);
  if (!Number.isFinite(n)) return null;
  return Math.round(isImperial(units) ? n / KM_PER_MILE : n);
}

/** Valeur saisie par l'utilisateur → kilomètres à stocker, entiers. */
export function distanceToStorage(value, units) {
  if (value === null || value === undefined || value === '') return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(isImperial(units) ? n * KM_PER_MILE : n);
}

export function distanceUnit(units) {
  return isImperial(units) ? 'mi' : 'km';
}

// ── Volumes ────────────────────────────────────────────────────────────────
//
// ⚠️ CES FONCTIONS NE SONT VOLONTAIREMENT PAS BRANCHÉES sur le réglage
// métrique/impérial, et le carburant reste affiché en litres même en miles.
//
// Ce n'est pas un oubli. Le Royaume-Uni — le seul pays à miles qu'on ajouterait
// de façon plausible après la France — **vend son carburant au litre** tout en
// comptant ses distances en miles et sa consommation en MPG. Convertir les
// volumes en gallons parce que l'utilisateur a choisi « miles » afficherait
// donc un prix au gallon que personne ne voit jamais à la pompe, et rendrait
// incomparables les relevés d'un même conducteur.
//
// Le gallon appartient aux États-Unis, et le gallon américain (3,785 L) n'est
// pas l'impérial (4,546 L). Ce choix relève donc de la RÉGION, pas d'une
// bascule à deux valeurs — il sera porté par `regions/us.py` le jour venu.
// D'ici là ces fonctions restent disponibles et non câblées.

/**
 * Litres → gallons. Une décimale conservée : un plein de 42 L fait 9,2 gal,
 * et l'arrondir à 9 ferait perdre un demi-litre à chaque ligne d'historique.
 */
export function volumeToDisplay(litres, units) {
  if (litres === null || litres === undefined || litres === '') return litres;
  const n = Number(litres);
  if (!Number.isFinite(n)) return null;
  return isImperial(units) ? Math.round((n / LITRES_PER_GALLON_UK) * 10) / 10 : n;
}

export function volumeToStorage(value, units) {
  if (value === null || value === undefined || value === '') return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return isImperial(units) ? Math.round(n * LITRES_PER_GALLON_UK * 100) / 100 : n;
}

export function volumeUnit(units) {
  return isImperial(units) ? 'gal' : 'L';
}

// ── Consommation ───────────────────────────────────────────────────────────

/**
 * L/100 km → MPG (gallon impérial).
 *
 * ⚠️ Grandeurs **inverses** : plus le MPG est élevé, moins la voiture
 * consomme. Ce n'est pas un facteur multiplicatif, et traiter cette conversion
 * comme les autres donnerait un résultat inversé — 5 L/100 km deviendrait une
 * consommation énorme au lieu d'un excellent 56 MPG.
 */
export function consumptionToDisplay(litresPer100km, units) {
  if (litresPer100km === null || litresPer100km === undefined || litresPer100km === '') {
    return litresPer100km;
  }
  const n = Number(litresPer100km);
  if (!Number.isFinite(n) || n <= 0) return isImperial(units) ? null : n;
  if (!isImperial(units)) return n;
  // n L/100 km  →  100/n km par litre  →  (100/n)/1,609344 miles par litre
  //             →  × 4,54609 L par gallon impérial
  const mpg = (100 / n) / KM_PER_MILE * LITRES_PER_GALLON_UK;
  return Math.round(mpg * 10) / 10;
}

export function consumptionUnit(units) {
  return isImperial(units) ? 'MPG' : 'L/100 km';
}

// ── Formatage ──────────────────────────────────────────────────────────────

/**
 * Distance prête à afficher, séparateurs de milliers compris.
 *
 * Le format des nombres suit la LANGUE, pas le système d'unités : un
 * francophone qui compte en miles attend toujours « 62 137 », pas « 62,137 ».
 */
export function localeOf(lang) {
  return lang === 'en' ? 'en-GB' : 'fr-FR';
}

export function formatDistance(km, units, lang = 'fr', { withUnit = true } = {}) {
  const value = distanceToDisplay(km, units);
  if (value === null || value === undefined || value === '') return '—';
  const text = value.toLocaleString(localeOf(lang));
  return withUnit ? `${text} ${distanceUnit(units)}` : text;
}

export function formatVolume(litres, units, lang = 'fr', { withUnit = true } = {}) {
  const value = volumeToDisplay(litres, units);
  if (value === null || value === undefined || value === '') return '—';
  const text = value.toLocaleString(localeOf(lang), { maximumFractionDigits: 2 });
  return withUnit ? `${text} ${volumeUnit(units)}` : text;
}

export function formatConsumption(litresPer100km, units, lang = 'fr', { withUnit = true } = {}) {
  const value = consumptionToDisplay(litresPer100km, units);
  if (value === null || value === undefined || value === '') return '—';
  const text = value.toLocaleString(localeOf(lang), { maximumFractionDigits: 1 });
  return withUnit ? `${text} ${consumptionUnit(units)}` : text;
}

/**
 * Coût par unité de distance.
 *
 * Ce n'est PAS une conversion d'unité mais un rapport : un prix au kilomètre
 * devient un prix au mile, donc il AUGMENTE (un mile est plus long). Diviser
 * là où l'on multiplie ailleurs — l'erreur est facile et le résultat reste
 * plausible à l'œil, d'où ce commentaire.
 */
export function costPerDistanceToDisplay(costPerKm, units) {
  if (costPerKm === null || costPerKm === undefined || costPerKm === '') return costPerKm;
  const n = Number(costPerKm);
  if (!Number.isFinite(n)) return null;
  return isImperial(units) ? n * KM_PER_MILE : n;
}
