import React from 'react';

/**
 * Drapeaux — composant distinct d'`Icon`, et volontairement.
 *
 * Le jeu d'icônes est monochrome par construction : chaque tracé hérite de
 * `currentColor`, ce qui le rend juste dans les deux thèmes sans effort
 * (§23.3). Un drapeau ne peut pas suivre cette règle — ses couleurs *sont* son
 * identité. Le mélanger à `Icon` obligerait à poser des couleurs en dur dans
 * la table des tracés et ouvrirait la porte à ce qu'on en pose ailleurs.
 *
 * C'est donc la seconde exception documentée à la règle « aucune couleur
 * littérale », après le fond de la plaque du logo. Elle s'arrête ici.
 *
 * Le cadre porte une bordure en `var(--border)` : sans elle, la bande blanche
 * du drapeau français se fond dans la surface d'une carte en thème clair, et
 * le drapeau paraît amputé.
 *
 * ⚠️ Un drapeau désigne un **pays**, jamais une langue. L'anglais n'est pas la
 * propriété du Royaume-Uni et le français n'est pas celle de la France. Le
 * sélecteur de langue affiche donc des noms de langue en toutes lettres ; les
 * drapeaux sont réservés au choix du pays, où ils veulent dire quelque chose.
 */

const FLAGS = {
  FR: (
    <>
      <rect width="20" height="40" fill="#002395" />
      <rect x="20" width="20" height="40" fill="#FFFFFF" />
      <rect x="40" width="20" height="40" fill="#ED2939" />
    </>
  ),
  GB: (
    <>
      <rect width="60" height="40" fill="#012169" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#FFFFFF" strokeWidth="8" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 V40 M0,20 H60" stroke="#FFFFFF" strokeWidth="13" />
      <path d="M30,0 V40 M0,20 H60" stroke="#C8102E" strokeWidth="8" />
    </>
  ),
};

export const FLAG_CODES = Object.keys(FLAGS);

export default function Flag({ code, width = 22, className = '', style }) {
  const shape = FLAGS[(code || '').toUpperCase()];
  // Un code inconnu ne rend rien plutôt que de casser la page — même règle
  // que pour un nom d'icône inconnu.
  if (!shape) return null;

  return (
    <svg
      viewBox="0 0 60 40"
      width={width}
      height={Math.round((width * 2) / 3)}
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{
        display: 'block',
        flexShrink: 0,
        borderRadius: 3,
        border: '1px solid var(--border)',
        ...style,
      }}
    >
      {shape}
    </svg>
  );
}
