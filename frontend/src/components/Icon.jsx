import React from 'react';

/**
 * Jeu d'icônes maison — traits, pas d'emojis.
 *
 * Pourquoi pas une librairie : le frontend n'a aucune dépendance d'interface,
 * l'image est construite en CI depuis un lockfile figé et publiée en amd64 ET
 * arm64. Ajouter un paquet pour une cinquantaine de tracés coûterait plus cher
 * en maintenance qu'il ne rapporte, et aucun jeu générique ne dessine une moto
 * correctement.
 *
 * Toutes les icônes partagent la même grille 24×24 et un trait de 1,75 px en
 * `currentColor` : la couleur vient donc du texte environnant, ce qui les rend
 * automatiquement justes dans les deux thèmes. Ne jamais y mettre de couleur
 * en dur.
 */

const P = {
  // ── Navigation ────────────────────────────────────────────────────────────
  car: (
    <>
      <path d="M18.5 17H20a1.5 1.5 0 0 0 1.5-1.5v-2.6a2 2 0 0 0-1.4-1.9L16.8 10l-2-2.4a2.5 2.5 0 0 0-1.9-.9H6.4a2 2 0 0 0-1.8 1.1L3.1 11a3 3 0 0 0-.6 1.8v2.7A1.5 1.5 0 0 0 4 17h1.5" />
      <path d="M9.5 17h5" />
      <circle cx="7.5" cy="17" r="2" />
      <circle cx="16.5" cy="17" r="2" />
    </>
  ),
  motorcycle: (
    <>
      <circle cx="5.5" cy="16" r="3.5" />
      <circle cx="18.5" cy="16" r="3.5" />
      <path d="M5.5 16h4.2l3-4.5h4.1" />
      <path d="M18.5 16 16 9.8" />
      <path d="M16 9.8h-2.4l-1.4-1.6" />
      <path d="M9.7 16 7.8 12.2h4.1" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8.5 20v-6" />
      <path d="M13 20V8.5" />
      <path d="M17.5 20v-9" />
    </>
  ),
  fuel: (
    <>
      <path d="M4 20V6.5A2.5 2.5 0 0 1 6.5 4h4A2.5 2.5 0 0 1 13 6.5V20" />
      <path d="M3 20h11" />
      <path d="M6.5 10.5h4" />
      <path d="M16 20v-6.5h1.5A2.5 2.5 0 0 0 20 11V8.2l-2.4-2.4" />
      <path d="M16 20h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.75h17" />
      <path d="M8 3.5v3M16 3.5v3" />
      <path d="M7.5 13.5h3M7.5 17h3M13.5 13.5h3" />
    </>
  ),
  // Roue dentée, pas un cercle à rayons : la version précédente était le
  // dessin du soleil au trait près, et « Paramètres » ressemblait au bouton
  // de thème. Contour à 8 dents généré sur la grille 24×24, plus le moyeu.
  settings: (
    <>
      <path d="M10.36 4.89 L10.64 1.69 L13.36 1.69 L13.64 4.89 L15.87 5.81 L18.33 3.75 L20.25 5.67 L18.19 8.13 L19.11 10.36 L22.31 10.64 L22.31 13.36 L19.11 13.64 L18.19 15.87 L20.25 18.33 L18.33 20.25 L15.87 18.19 L13.64 19.11 L13.36 22.31 L10.64 22.31 L10.36 19.11 L8.13 18.19 L5.67 20.25 L3.75 18.33 L5.81 15.87 L4.89 13.64 L1.69 13.36 L1.69 10.64 L4.89 10.36 L5.81 8.13 L3.75 5.67 L5.67 3.75 L8.13 5.81 Z" />
      <circle cx="12" cy="12" r="3.4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 5.8v5.5c0 4.1 2.8 7.9 7 9.2 4.2-1.3 7-5.1 7-9.2V5.8L12 3Z" />
      <path d="m9.2 12 2 2 3.6-3.7" />
    </>
  ),
  home: (
    <>
      <path d="M4 10.4 12 4l8 6.4" />
      <path d="M5.8 9v10.5h12.4V9" />
      <path d="M9.8 19.5v-5.2h4.4v5.2" />
    </>
  ),

  // ── Actions ───────────────────────────────────────────────────────────────
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  trash: (
    <>
      <path d="M4 6.5h16" />
      <path d="M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.2 6.5 7 19.3a1.8 1.8 0 0 0 1.8 1.7h6.4a1.8 1.8 0 0 0 1.8-1.7l.8-12.8" />
      <path d="M10.3 10.5v6M13.7 10.5v6" />
    </>
  ),
  pencil: (
    <>
      <path d="M15.8 4.6a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L8.6 18.9l-4.1 1.3 1.3-4.1Z" />
      <path d="m14.4 6 3.6 3.6" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11.5A8 8 0 0 0 6.2 6.4L3.6 8.8" />
      <path d="M4 12.5a8 8 0 0 0 13.8 5.1l2.6-2.4" />
      <path d="M3.4 4.6v4.4h4.4M20.6 19.4V15h-4.4" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m15.4 15.4 4.4 4.4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.8v10.4" />
      <path d="m7.6 10 4.4 4.4 4.4-4.4" />
      <path d="M4.5 16v2.5a1.7 1.7 0 0 0 1.7 1.7h11.6a1.7 1.7 0 0 0 1.7-1.7V16" />
    </>
  ),
  upload: (
    <>
      <path d="M12 20.2V9.8" />
      <path d="M7.6 14 12 9.6l4.4 4.4" />
      <path d="M4.5 8V5.5a1.7 1.7 0 0 1 1.7-1.7h11.6a1.7 1.7 0 0 1 1.7 1.7V8" />
    </>
  ),
  camera: (
    <>
      <path d="M3.5 8.8A2 2 0 0 1 5.5 6.8h1.9l1.3-2.1h6.6l1.3 2.1h1.9a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="13" r="3.6" />
    </>
  ),
  paperclip: <path d="M18.9 11.6 12 18.5a4.4 4.4 0 0 1-6.2-6.2l7.3-7.3a2.9 2.9 0 0 1 4.1 4.1l-7.2 7.3a1.5 1.5 0 0 1-2.1-2.1l6.6-6.6" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2" />
      <path d="M15.5 5.6a2.2 2.2 0 0 0-2.2-1.6H6.2A2.2 2.2 0 0 0 4 6.2v7.1a2.2 2.2 0 0 0 1.6 2.2" />
    </>
  ),
  clipboard: (
    <>
      <path d="M9 4.5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-12a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="2.8" width="6" height="3.6" rx="1.2" />
      <path d="M8.8 11.5h6.4M8.8 15.5h4.4" />
    </>
  ),
  link: (
    <>
      <path d="M10.2 13.8a3.6 3.6 0 0 0 5.2 0l2.9-3a3.7 3.7 0 0 0-5.2-5.2l-1.6 1.6" />
      <path d="M13.8 10.2a3.6 3.6 0 0 0-5.2 0l-2.9 3a3.7 3.7 0 0 0 5.2 5.2l1.6-1.6" />
    </>
  ),
  send: (
    <>
      <path d="M20.5 3.5 10.8 13.2" />
      <path d="M20.5 3.5 14.3 20.5l-3.5-7.3-7.3-3.5Z" />
    </>
  ),
  save: (
    <>
      <path d="M4.5 6.2A1.7 1.7 0 0 1 6.2 4.5h9.3L19.5 8.5v9.3a1.7 1.7 0 0 1-1.7 1.7H6.2a1.7 1.7 0 0 1-1.7-1.7Z" />
      <path d="M8 4.5v4.7h6.8V4.5" />
      <path d="M8 19.5v-5.3h8v5.3" />
    </>
  ),
  eye: (
    <>
      <path d="M2.8 12S6.3 5.8 12 5.8 21.2 12 21.2 12 17.7 18.2 12 18.2 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  filter: <path d="M4 5.5h16l-6.2 7.2v5.6l-3.6 2v-7.6Z" />,
  sliders: (
    <>
      <path d="M4 8h9M17.5 8H20M4 16h3.5M12 16h8" />
      <circle cx="15" cy="8" r="2.2" />
      <circle cx="9.5" cy="16" r="2.2" />
    </>
  ),

  // ── Flèches ───────────────────────────────────────────────────────────────
  arrowRight: <path d="M4.5 12h15m-5.6-5.6L19.5 12l-5.6 5.6" />,
  arrowLeft: <path d="M19.5 12h-15m5.6-5.6L4.5 12l5.6 5.6" />,
  arrowUp: <path d="M12 19.5v-15m-5.6 5.6L12 4.5l5.6 5.6" />,
  arrowDown: <path d="M12 4.5v15m-5.6-5.6L12 19.5l5.6-5.6" />,
  chevronRight: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  chevronLeft: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  chevronDown: <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />,
  chevronUp: <path d="m5.5 14.5 6.5-6.5 6.5 6.5" />,
  external: (
    <>
      <path d="M13.5 4.5H19.5v6" />
      <path d="M19.5 4.5 11 13" />
      <path d="M18 14.2v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </>
  ),
  trendUp: (
    <>
      <path d="M3.5 16.5 9.5 10l4 4 7-7.5" />
      <path d="M15.5 6.5h5v5" />
    </>
  ),
  trendDown: (
    <>
      <path d="M3.5 7.5 9.5 14l4-4 7 7.5" />
      <path d="M15.5 17.5h5v-5" />
    </>
  ),

  // ── États ─────────────────────────────────────────────────────────────────
  alert: (
    <>
      <path d="M12 4.2 21 19.3H3Z" />
      <path d="M12 9.8v4.2" />
      <path d="M12 16.8h.01" />
    </>
  ),
  alertCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8V13" />
      <path d="M12 16.2h.01" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.2 12.2 2.6 2.6 5-5.4" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6.5 17.5 11-11" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 16.2V11.5" />
      <path d="M12 8.2h.01" />
    </>
  ),
  bulb: (
    <>
      <path d="M9.2 17.5a6 6 0 1 1 5.6 0" />
      <path d="M9.5 17.5h5v1.8a2.5 2.5 0 0 1-5 0Z" />
      <path d="M9.8 14.5h4.4" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 10.5a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5Z" />
      <path d="M10.2 19a2 2 0 0 0 3.6 0" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </>
  ),
  lock: (
    <>
      <rect x="4.8" y="10.2" width="14.4" height="9.8" rx="2.2" />
      <path d="M8.2 10.2V7.8a3.8 3.8 0 0 1 7.6 0v2.4" />
    </>
  ),
  unlock: (
    <>
      <rect x="4.8" y="10.2" width="14.4" height="9.8" rx="2.2" />
      <path d="M8.2 10.2V7.8a3.8 3.8 0 0 1 7.3-1.4" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="4.2" />
      <path d="m11 11 8 8" />
      <path d="m16.5 16.5 2-2M14 14l2-2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.2" r="3.7" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9.2" cy="8.5" r="3.4" />
      <path d="M3.2 19.5a6 6 0 0 1 12 0" />
      <path d="M15.8 5.5a3.4 3.4 0 0 1 0 6.6" />
      <path d="M17 14.2a6 6 0 0 1 3.8 5.3" />
    </>
  ),
  logout: (
    <>
      <path d="M14.5 4.5h3.3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3.3" />
      <path d="M9.5 8 5.5 12l4 4" />
      <path d="M5.8 12h9" />
    </>
  ),
  moon: <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2M12 19.2v2M21.2 12h-2M4.8 12h-2M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4M18.5 18.5l-1.4-1.4M6.9 6.9 5.5 5.5" />
    </>
  ),

  // ── Domaine véhicule ──────────────────────────────────────────────────────
  wrench: <path d="M15.5 3.5a5.5 5.5 0 0 0-5 7.7L4 17.7a2.3 2.3 0 0 0 3.3 3.3l6.5-6.5a5.5 5.5 0 0 0 6.9-7.2l-3 3-3-3 3-3a5.5 5.5 0 0 0-2.2-.8Z" />,
  gauge: (
    <>
      <path d="M3.8 17a9 9 0 1 1 16.4 0" />
      <path d="m14.6 9.9-2.6 4.3" />
      <circle cx="12" cy="15.4" r="1.6" />
    </>
  ),
  droplet: <path d="M12 3.5s5.8 6 5.8 9.8a5.8 5.8 0 0 1-11.6 0C6.2 9.5 12 3.5 12 3.5Z" />,
  oil: (
    <>
      <path d="M3.5 12.5h7l2.5 2.5h4.5a3 3 0 0 1 0 6h-11a3 3 0 0 1-3-3Z" />
      <path d="M8 12.5v-3h6" />
      <path d="M14 6.2s2.2 2.4 2.2 3.6a2.2 2.2 0 1 1-4.4 0c0-1.2 2.2-3.6 2.2-3.6Z" />
    </>
  ),
  bolt: <path d="M13.5 3 5 13.5h6L10.5 21 19 10.5h-6Z" />,
  wind: (
    <>
      <path d="M3.5 8.5h9.8a2.8 2.8 0 1 0-2.8-2.8" />
      <path d="M3.5 12.5h13a2.8 2.8 0 1 1-2.8 2.8" />
      <path d="M3.5 16.5h5.3" />
    </>
  ),
  disc: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
    </>
  ),
  tire: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3.5V8M12 16v4.5M3.5 12H8M16 12h4.5" />
    </>
  ),
  chain: (
    <>
      <rect x="3.5" y="9" width="7.5" height="6" rx="3" />
      <rect x="13" y="9" width="7.5" height="6" rx="3" />
      <path d="M11 12h2" />
    </>
  ),
  battery: (
    <>
      <rect x="2.8" y="7.5" width="15.5" height="9" rx="2.2" />
      <path d="M21.2 10.8v2.4" />
      <path d="M6.2 10.5v3M9.5 10.5v3M12.8 10.5v3" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3.5v3.8" />
      <rect x="9.5" y="7.3" width="5" height="6.2" rx="1" />
      <path d="M12 13.5v3.2l-1.6 3.8" />
      <path d="M8.6 9.4H6M8.6 11.6H6" />
    </>
  ),
  engine: (
    <>
      <path d="M3.5 10.5h2.2V8.2h4L12 6h3.5v3h2.2l2.8 2.4v4.3l-2.8 2.4H8.5l-2.8-2.4H3.5Z" />
      <path d="M9.5 6h4" />
    </>
  ),
  snowflake: (
    <>
      <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5 4.2 16.5" />
      <path d="M9.5 5.2 12 7.7l2.5-2.5M9.5 18.8 12 16.3l2.5 2.5" />
    </>
  ),
  road: (
    <>
      <path d="M7.5 3.5 4.5 20.5M16.5 3.5l3 17" />
      <path d="M12 4v3M12 10.5v3M12 17v3" />
    </>
  ),
  mapPin: (
    <>
      <path d="M12 21s6.5-6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15 12 21 12 21Z" />
      <circle cx="12" cy="10.3" r="2.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.6 12h16.8" />
      <path d="M12 3.5c2.2 2.4 3.4 5.4 3.4 8.5s-1.2 6.1-3.4 8.5c-2.2-2.4-3.4-5.4-3.4-8.5S9.8 5.9 12 3.5Z" />
    </>
  ),
  building: (
    <>
      <path d="M4.5 20.5V6.2L12 3.5l7.5 2.7v14.3" />
      <path d="M3 20.5h18" />
      <path d="M8.2 9.5h2M13.8 9.5h2M8.2 13.5h2M13.8 13.5h2" />
      <path d="M10 20.5v-3.8h4v3.8" />
    </>
  ),

  // ── Documents & données ───────────────────────────────────────────────────
  file: (
    <>
      <path d="M13.5 3.5H7.2a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9.6a2 2 0 0 0 2-2V9Z" />
      <path d="M13.5 3.5V9h5.3" />
      <path d="M8.8 13.5h6.4M8.8 16.5h4.2" />
    </>
  ),
  folder: <path d="M3.5 18.5V6.8a1.8 1.8 0 0 1 1.8-1.8h3.6l2.2 2.5h7.1a1.8 1.8 0 0 1 1.8 1.8v9.2a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8Z" />,
  package: (
    <>
      <path d="M12 3.2 20.2 7.6v8.8L12 20.8 3.8 16.4V7.6Z" />
      <path d="M3.8 7.6 12 12l8.2-4.4" />
      <path d="M12 12v8.8" />
    </>
  ),
  euro: (
    <>
      <path d="M17.5 6.5A6.5 6.5 0 0 0 7.2 12a6.5 6.5 0 0 0 10.3 5.5" />
      <path d="M4.5 10.5h8M4.5 13.5h8" />
    </>
  ),
  mail: (
    <>
      <rect x="3.2" y="5.5" width="17.6" height="13" rx="2.2" />
      <path d="m3.8 7 8.2 6 8.2-6" />
    </>
  ),
  message: <path d="M20.5 12.5a7.5 7.5 0 0 1-8.5 7.4L5.5 21l1.2-4.8A7.5 7.5 0 1 1 20.5 12.5Z" />,
  note: (
    <>
      <path d="M5 4.5h11l3.5 3.5v11.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 5 4.5Z" />
      <path d="M8 10h8M8 13.5h8M8 17h5" />
    </>
  ),
  pin: (
    <>
      <path d="M9 3.5h6l-.8 5.5 3.3 3.3H6.5l3.3-3.3Z" />
      <path d="M12 12.3v8.2" />
    </>
  ),
  star: <path d="m12 3.8 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 10l5.9-.8Z" />,
  crown: (
    <>
      <path d="M3.8 7.5 7 13l5-8 5 8 3.2-5.5-1.4 11H5.2Z" />
      <path d="M5.2 20.5h13.6" />
    </>
  ),
  leaf: (
    <>
      <path d="M4 20.5c0-9 5.5-14 16.5-14.5C20.5 16 15 20 4 20.5Z" />
      <path d="M4 20.5c3.5-5.5 7.5-8.5 12-10.5" />
    </>
  ),
  plug: (
    <>
      <path d="M9.5 3.5v5M14.5 3.5v5" />
      <path d="M6.5 8.5h11v3a5.5 5.5 0 0 1-11 0Z" />
      <path d="M12 17v3.5" />
    </>
  ),
  cpu: (
    <>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
      <rect x="10" y="10" width="4" height="4" rx="1" />
      <path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.8 0-1.4-1.2-1.7-1.2-2.9 0-.9.7-1.6 1.7-1.6h1.8a4.2 4.2 0 0 0 4.2-4.2c0-3.6-3.8-6.5-8.5-6.5Z" />
      <circle cx="8.2" cy="9.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.8" cy="9.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="7.8" cy="14" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  flask: (
    <>
      <path d="M9.5 3.5h5" />
      <path d="M10.5 3.5v6L5.6 17.8a2 2 0 0 0 1.7 3h9.4a2 2 0 0 0 1.7-3L13.5 9.5v-6" />
      <path d="M8.2 14.5h7.6" />
    </>
  ),
  webhook: (
    <>
      <path d="M9.5 8.2a3 3 0 1 1 4.3 2.7l2.4 4.1" />
      <path d="M16.6 12.5a3 3 0 1 1-1.3 5.2H10.5" />
      <path d="M10.7 17.7a3 3 0 1 1-3-4.5l2.4-4.2" />
    </>
  ),
  dot: <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />,
};

export default function Icon({
  name,
  size = 18,
  strokeWidth = 1.75,
  className = '',
  style,
  title,
}) {
  const body = P[name];
  if (!body) return null;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, display: 'block', ...style }}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {body}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(P);
