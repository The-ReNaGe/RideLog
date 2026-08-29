import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LANGUAGE,
  isSupported,
  readStoredLanguage,
  storeLanguage,
  translate,
} from './i18n';

/**
 * Diffusion de la langue active dans l'arbre React.
 *
 * Deux sources, dans cet ordre :
 *
 *   1. `user.language` — la préférence du compte, qui suit l'utilisateur d'un
 *      navigateur à l'autre ;
 *   2. localStorage — un cache local, lu au tout premier rendu pour éviter que
 *      l'interface s'affiche en français puis bascule en anglais à chaque
 *      chargement de page.
 *
 * `null` côté compte veut dire « aucune préférence exprimée » et non « veut du
 * français » (voir migration 011). Dans ce cas le cache local, s'il existe,
 * garde la main : quelqu'un qui a choisi l'anglais avant de se connecter ne
 * doit pas repasser en français en se connectant.
 */

const I18nContext = createContext({
  lang: DEFAULT_LANGUAGE,
  setLang: () => {},
  t: (text) => text,
});

export function I18nProvider({ user, children }) {
  const [lang, setLangState] = useState(readStoredLanguage);

  // La préférence du compte l'emporte dès qu'elle est connue et explicite.
  useEffect(() => {
    const preferred = user?.language;
    if (isSupported(preferred) && preferred !== lang) {
      setLangState(preferred);
      storeLanguage(preferred);
    }
    // `lang` est volontairement absent des dépendances : le réintroduire
    // rejouerait l'effet à chaque changement local de langue et écraserait le
    // choix que l'utilisateur vient de faire par celui du compte, avant même
    // que la requête d'enregistrement ait répondu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.language]);

  const value = useMemo(() => ({
    lang,
    setLang: (code) => {
      if (!isSupported(code)) return;
      setLangState(code);
      storeLanguage(code);
    },
    t: (text, vars) => translate(lang, text, vars),
  }), [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Hook d'accès : `const { t, lang, setLang } = useI18n();` */
export function useI18n() {
  return useContext(I18nContext);
}

/** Raccourci pour le cas courant, qui ne veut que traduire. */
export function useT() {
  return useContext(I18nContext).t;
}
