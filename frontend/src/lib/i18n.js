/**
 * Moteur de traduction de l'interface.
 *
 * Pourquoi maison plutôt qu'une bibliothèque
 * ──────────────────────────────────────────
 * Le frontend n'a que cinq dépendances d'exécution et l'image est construite
 * en CI depuis un lockfile figé, publiée en amd64 ET arm64. Ajouter i18next et
 * ses greffons pour ce dont on a besoin ici — une table de chaînes, une
 * interpolation, un pluriel — coûterait plus en maintenance qu'il ne rapporte.
 * Le même raisonnement que pour le jeu d'icônes (§23.3).
 *
 * Le français est la langue de référence
 * ──────────────────────────────────────
 * Les clés SONT les chaînes françaises. Deux conséquences voulues :
 *
 *   - une chaîne non encore traduite s'affiche en français plutôt qu'en
 *     `settings.country.title`, illisible. Pendant une traduction progressive,
 *     c'est la différence entre une interface partiellement anglaise et une
 *     interface cassée ;
 *   - aucune migration de contenu à faire : on enveloppe une chaîne existante
 *     dans `t()` et elle continue de s'afficher à l'identique tant que le
 *     catalogue anglais ne la porte pas.
 *
 * Le revers : renommer un libellé français casse sa traduction. C'est
 * acceptable ici parce que le catalogue est dans le dépôt — la clé morte se
 * voit au diff. Ce serait inacceptable en base, et c'est exactement pourquoi
 * les entretiens enregistrés portent une clé technique et non leur libellé
 * (§20.2).
 */

import { EN } from './locales/en';

export const LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
];

export const DEFAULT_LANGUAGE = 'fr';

const CATALOGS = { en: EN };

export function isSupported(code) {
  return LANGUAGES.some((l) => l.code === code);
}

/**
 * Traduit une chaîne française.
 *
 * @param {string} lang   code de langue actif
 * @param {string} text   la chaîne française, qui sert aussi de clé
 * @param {object} [vars] valeurs à interpoler, référencées par {nom}
 */
export function translate(lang, text, vars) {
  const catalog = CATALOGS[lang];
  let out = (catalog && catalog[text]) || text;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      out = out.split(`{${name}}`).join(String(value));
    }
  }
  return out;
}

/**
 * Ce que le catalogue anglais ne couvre pas encore.
 *
 * Sert au bandeau d'avancement des réglages : annoncer « traduction partielle »
 * sans dire de combien serait une information creuse, et le chiffre se périme
 * tout seul à mesure que le catalogue se remplit.
 */
export function catalogCoverage(lang) {
  const catalog = CATALOGS[lang];
  if (!catalog) return null;
  return Object.keys(catalog).length;
}
