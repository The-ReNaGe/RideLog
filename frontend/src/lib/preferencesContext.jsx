import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LANGUAGE, isSupported as isSupportedLanguage, translate } from './i18n';
import { DEFAULT_UNITS } from './units';

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
  setLang: () => {},
  setUnits: () => {},
  t: (text) => text,
});

export function PreferencesProvider({ user, children }) {
  const [prefs, setPrefs] = useState(readStored);
  const [region, setRegion] = useState(null);

  // Ce que le backend a résolu l'emporte dès qu'on le connaît.
  useEffect(() => {
    const effective = user?.effective;
    if (!effective) return;
    setRegion(effective.region || null);
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
    setLang: (code) => {
      if (!isSupportedLanguage(code)) return;
      setPrefs((c) => { const n = { ...c, lang: code }; store(n); return n; });
    },
    setUnits: (code) => {
      if (code !== 'metric' && code !== 'imperial') return;
      setPrefs((c) => { const n = { ...c, units: code }; store(n); return n; });
    },
    t: (text, vars) => translate(prefs.lang, text, vars),
  }), [prefs, region]);

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
