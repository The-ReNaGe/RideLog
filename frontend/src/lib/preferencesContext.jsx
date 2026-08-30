import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { currencySymbolOf } from './currencies';
import { DEFAULT_LANGUAGE, isSupported as isSupportedLanguage, translate } from './i18n';
import {
  DEFAULT_UNITS,
  consumptionUnit,
  costPerDistanceToDisplay,
  distanceToDisplay,
  distanceToStorage,
  distanceUnit,
  formatConsumption,
  formatDistance,
  localeOf,
} from './units';

/**
 * Préférences d'affichage diffusées dans l'arbre React : langue et unités.
 *
 * Les deux vont ensemble parce qu'elles ont exactement la même mécanique —
 * un choix personnel, un repli sur le pays de l'instance, un cache local — et
 * parce que presque tout composant qui traduit un libellé affiche aussi un
 * kilométrage. Deux contextes distincts auraient doublé le câblage sans rien
 * séparer d'utile.
 *
 * Trois sources, dans cet ordre de priorité :
 *
 *   1. `user.effective` — calculé par le backend : le choix explicite du
 *      compte, ou à défaut celui du pays actif. C'est la source de vérité ;
 *   2. localStorage — un cache lu au tout premier rendu, avant que /auth/me
 *      ait répondu. Sans lui l'interface s'afficherait une fraction de seconde
 *      en français métrique avant de basculer, à chaque chargement de page ;
 *   3. les défauts en dur, si les deux précédents manquent.
 *
 * `user.language` (le choix brut) n'est PAS lu ici : `null` y signifie
 * « aucune préférence exprimée », et c'est justement au backend d'avoir déjà
 * résolu ce cas dans `effective`. Les lire tous les deux ici, c'est
 * réimplémenter le repli côté frontend et le faire diverger.
 */

const STORAGE_KEY = 'ridelog.preferences';

function readStored() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      lang: isSupportedLanguage(raw.lang) ? raw.lang : DEFAULT_LANGUAGE,
      units: raw.units === 'imperial' || raw.units === 'metric' ? raw.units : DEFAULT_UNITS,
    };
  } catch {
    // Navigation privée, stockage désactivé : les défauts font l'affaire.
    return { lang: DEFAULT_LANGUAGE, units: DEFAULT_UNITS };
  }
}

function store(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Sans persistance, /auth/me reprendra la main au prochain démarrage.
  }
}

const PreferencesContext = createContext({
  lang: DEFAULT_LANGUAGE,
  units: DEFAULT_UNITS,
  region: null,
  plateExample: null,
  currency: null,
  currencySymbol: '€',
  setLang: () => {},
  setUnits: () => {},
  t: (text) => text,
});

export function PreferencesProvider({ user, children }) {
  const [prefs, setPrefs] = useState(readStored);
  const [region, setRegion] = useState(null);
  const [plateExample, setPlateExample] = useState(null);
  const [currency, setCurrency] = useState(null);
  // Seul « € » littéral admis du frontend : la valeur affichée au tout premier
  // rendu, avant que /auth/me ait dit quelle devise l'instance utilise. Tout
  // le reste passe par fmt.money() ou fmt.currencySymbol.
  const [currencySymbol, setCurrencySymbol] = useState('€');

  // Ce que le backend a résolu l'emporte dès qu'on le connaît.
  useEffect(() => {
    const effective = user?.effective;
    if (!effective) return;
    setRegion(effective.region || null);
    setPlateExample(effective.plate_example || null);
    setCurrency(effective.currency || null);
    setCurrencySymbol(effective.currency_symbol || '€');
    setPrefs((current) => {
      const next = {
        lang: isSupportedLanguage(effective.language) ? effective.language : current.lang,
        units: effective.units === 'imperial' || effective.units === 'metric'
          ? effective.units
          : current.units,
      };
      if (next.lang === current.lang && next.units === current.units) return current;
      store(next);
      return next;
    });
  }, [user?.effective]);

  const value = useMemo(() => ({
    lang: prefs.lang,
    units: prefs.units,
    region,
    plateExample,
    currency,
    currencySymbol,
    setLang: (code) => {
      if (!isSupportedLanguage(code)) return;
      setPrefs((c) => { const n = { ...c, lang: code }; store(n); return n; });
    },
    setUnits: (code) => {
      if (code !== 'metric' && code !== 'imperial') return;
      setPrefs((c) => { const n = { ...c, units: code }; store(n); return n; });
    },
    t: (text, vars) => translate(prefs.lang, text, vars),
  }), [prefs, region, plateExample, currency, currencySymbol]);

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
}

/** `const { t, lang, units, setUnits } = usePreferences();` */
export function usePreferences() {
  return useContext(PreferencesContext);
}

/** Raccourci pour le cas courant, qui ne veut que traduire. */
export function useT() {
  return useContext(PreferencesContext).t;
}

/**
 * Formateurs déjà liés aux préférences actives.
 *
 * Sans ce hook, chaque affichage d'un kilométrage s'écrirait
 * `formatDistance(km, units, lang)` — trois arguments à retenir, sur des
 * centaines de sites d'appel. Le premier oubli du troisième donne des
 * séparateurs de milliers français dans une interface anglaise, sans erreur
 * ni avertissement. Ici on écrit `fmt.dist(km)`.
 *
 * `toStorage` fait le trajet inverse et doit être appelé sur TOUTE valeur de
 * distance saisie dans un formulaire : sans lui, un utilisateur en miles voit
 * ses miles enregistrés comme des kilomètres.
 */
export function useFormat() {
  const { units, lang, currencySymbol } = useContext(PreferencesContext);
  return useMemo(() => {
    /**
     * Un montant, dans la devise où il a été saisi.
     *
     * ⚠️ **Le second argument est la devise DE LA LIGNE**, et il faut le passer
     * partout où on en dispose : `fmt.money(m.cost_paid, m.currency)`. Une
     * révision payée 200 $ doit continuer de s'écrire « 200 $ » même si
     * l'instance affiche des euros depuis. Omis — ou `null`, pour une ligne
     * antérieure au marquage — on retombe sur le réglage d'instance, ce qui
     * est exactement le comportement d'avant.
     *
     * Aucune conversion nulle part : le nombre stocké est affiché tel quel.
     * `digits` : 0 pour un total qu'on lit d'un coup d'œil, 2 pour un montant
     * qu'on relit contre un ticket, 3 pour un prix au litre.
     */
    const money = (amount, rowCurrency, digits = 0) => {
      if (amount === null || amount === undefined || amount === '') return '—';
      const n = Number(amount);
      if (!Number.isFinite(n)) return '—';
      const symbol = currencySymbolOf(rowCurrency, currencySymbol);
      const formatted = n.toLocaleString(localeOf(lang), {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
      return `${formatted} ${symbol}`;
    };

    /**
     * Une date, écrite dans le format de la LANGUE active.
     *
     * ⚠️ **Jamais `toLocaleDateString('fr-FR')` en dur.** C'était le cas sur
     * quatorze sites, et le symptôme est discret : l'interface passe en
     * anglais, les libellés suivent, et les dates continuent de s'écrire
     * « 30/08/2026 » au milieu. Rien ne casse, personne ne le signale.
     *
     * Le format suit la langue et non les unités, pour la même raison que les
     * séparateurs de milliers : un francophone qui compte en miles attend
     * toujours une date française.
     *
     * `opts` est passé tel quel à `toLocaleDateString` — mêmes options que
     * l'appel natif, donc rien de nouveau à apprendre.
     */
    const date = (value, opts) => {
      if (value === null || value === undefined || value === '') return '—';
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleDateString(localeOf(lang), opts);
    };

    /**
     * Un nombre nu, séparateurs de milliers compris.
     *
     * Pour tout ce qui n'est ni une distance, ni un montant, ni une
     * consommation — un décompte, un volume en litres, une valeur d'axe.
     */
    const num = (value, opts) => {
      if (value === null || value === undefined || value === '') return '—';
      const n = Number(value);
      if (!Number.isFinite(n)) return '—';
      return n.toLocaleString(localeOf(lang), opts);
    };

    return {
      units,
      lang,
      locale: localeOf(lang),

      date,
      num,

      // Affichage
      dist: (km, opts) => formatDistance(km, units, lang, opts),
      cons: (l100, opts) => formatConsumption(l100, units, lang, opts),
      costPerDist: (costPerKm) => costPerDistanceToDisplay(costPerKm, units),

      // Valeurs brutes, quand le libellé est posé séparément
      distValue: (km) => distanceToDisplay(km, units),

      money,
      currencySymbol,

      /**
       * Un TOTAL ventilé par devise, tel que le backend le renvoie
       * (`cost_by_currency`, voir currency.totals_by_currency).
       *
       * Cas courant — une seule devise : le montant habituel, rien ne change.
       * Deux devises : « 1 200 € + 300 $ ». Les additionner pour poser un
       * symbole unique donnerait un nombre faux, et faux en silence.
       */
      totals: (byCurrency, digits = 0) => {
        const entries = Object.entries(byCurrency || {}).filter(([, value]) => value);
        if (entries.length === 0) return money(0, null, digits);
        return entries.map(([code, value]) => money(value, code, digits)).join(' + ');
      },

      /** `true` si un total enjambe plusieurs devises — pour nuancer un libellé. */
      isMixed: (byCurrency) => Object.values(byCurrency || {}).filter(Boolean).length > 1,

      // Unités, pour les libellés de champs et les en-têtes de colonne.
      // Pas de `volUnit` : le carburant reste en litres même en miles, voir
      // le bloc « Volumes » de units.js.
      distUnit: distanceUnit(units),
      consUnit: consumptionUnit(units),

      // Saisie → stockage. Obligatoire sur TOUT champ de distance.
      toStorage: (value) => distanceToStorage(value, units),
    };
  }, [units, lang, currencySymbol]);
}
