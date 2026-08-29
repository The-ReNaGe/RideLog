/**
 * Catalogue anglais.
 *
 * Les clés sont les chaînes FRANÇAISES telles qu'elles apparaissent dans le
 * code — voir l'en-tête de `lib/i18n.js` pour la raison. Une chaîne absente
 * d'ici s'affiche donc en français, ce qui est le comportement voulu pendant
 * une traduction progressive : l'écran reste lisible au lieu d'afficher une
 * clé technique.
 *
 * `{nom}` marque une valeur interpolée. Les garder identiques des deux côtés.
 *
 * ⚠️ Renommer un libellé français dans un composant SANS le renommer ici casse
 * silencieusement sa traduction. Le catalogue vivant dans le dépôt, la clé
 * orpheline se voit au diff — mais elle ne lève aucune erreur.
 *
 * ── Avancement ────────────────────────────────────────────────────────────
 * Vague 1 : coquille de l'application (navigation, en-tête, pied de page) et
 * onglets des paramètres. Ce sont les libellés visibles depuis tous les
 * écrans, donc ceux dont la traduction se remarque le plus tôt.
 *
 * Restent à faire : AuthPage, les écrans véhicules, entretiens, carburant, et
 * les 82 messages d'erreur du backend (qui demandent d'abord de décider si
 * l'API renvoie des codes ou du texte).
 */

export const EN = {
  // ── Navigation ──────────────────────────────────────────────────────────
  'Véhicules': 'Vehicles',
  'Tableau de bord': 'Dashboard',
  'Bilan': 'Summary',
  'Stations': 'Stations',
  'Planning': 'Planning',
  'Paramètres': 'Settings',
  'Réglages': 'Settings',
  'Admin': 'Admin',

  // ── En-tête ─────────────────────────────────────────────────────────────
  'Passer en mode nuit': 'Switch to dark mode',
  'Passer en mode jour': 'Switch to light mode',
  'Connecté en tant que {name}': 'Signed in as {name}',
  'Se déconnecter': 'Sign out',

  // ── Pied de page ────────────────────────────────────────────────────────
  "suivi d'entretien open source": 'open-source maintenance tracker',
  'connecté en tant que {name}': 'signed in as {name}',

  // ── Onglets des paramètres ──────────────────────────────────────────────
  'Préférences': 'Preferences',
  'Discord': 'Discord',
  'Home Assistant': 'Home Assistant',
  'Rappels': 'Reminders',
  'Famille': 'Household',
  'Compte': 'Account',
  'Inscription': 'Registration',
  'API': 'API',

  // ── Écran Préférences ───────────────────────────────────────────────────
  'Pays': 'Country',
  "Décide du format de plaque d'immatriculation, du service qui la décode et du calendrier du contrôle technique. S'applique à toute l'instance.":
    'Sets the licence-plate format, the service that decodes it, and the roadworthiness-test schedule. Applies to the whole instance.',
  "Seul un administrateur peut changer le pays de l'instance.":
    'Only an administrator can change the country of this instance.',
  "La France est pour l'instant le seul pays pris en charge. D'autres apparaîtront ici sans qu'aucun réglage ne soit à refaire.":
    'France is the only supported country for now. Others will appear here with nothing to reconfigure.',

  'Langue': 'Language',
  'Ne vaut que pour votre compte. Par défaut, celle de {country}.':
    'Applies to your account only. Defaults to the language of {country}.',
  'Ne vaut que pour votre compte.': 'Applies to your account only.',
  'La traduction anglaise est en cours : certains écrans sont encore en français.':
    'The English translation is a work in progress — some screens are still in French.',

  'Unités': 'Units',
  "Ne vaut que pour votre compte, et ne change que l'affichage : vos données restent enregistrées en kilomètres et en litres.":
    'Applies to your account only, and changes the display alone — your data stays stored in kilometres and litres.',
  'Kilomètres': 'Kilometres',
  'Miles': 'Miles',
};
