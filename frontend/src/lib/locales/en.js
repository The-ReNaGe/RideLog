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
  'Discord': 'Discord',
  'Home Assistant': 'Home Assistant',
  'Rappels': 'Reminders',
  'Famille': 'Household',
  'Compte': 'Account',
  'Inscription': 'Registration',
  'API': 'API',

  // ── Réglage de langue ───────────────────────────────────────────────────
  'Langue': 'Language',
  "Ce choix ne vaut que pour votre compte et vous suit d'un navigateur à l'autre.":
    'This applies to your account only, and follows you from one browser to another.',
  'La traduction anglaise est en cours : certains écrans sont encore en français.':
    'The English translation is a work in progress — some screens are still in French.',
  "Le choix est appliqué ici, mais n'a pas pu être enregistré : {error}":
    'Applied here, but could not be saved: {error}',
};
