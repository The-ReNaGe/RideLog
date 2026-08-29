// Traductions des noms d'interventions (anglais → français)
// Utilisé dans MaintenanceHistory et UpcomingMaintenance

export const interventionTranslations = {
  'Oil change': 'Vidange d\'huile',
  'Air filter replacement': 'Remplacement filtre à air',
  'Cabin filter replacement': 'Remplacement filtre d\'habitacle',
  'Cabin air filter replacement': 'Remplacement filtre d\'habitacle',
  'Brake fluid flush': 'Purge de frein',
  'Timing belt replacement': 'Remplacement courroie de distribution',
  'Coolant replacement': 'Renouvellement liquide de refroidissement',
  'Coolant fluid renewal': 'Renouvellement liquide de refroidissement',
  'Transmission fluid renewal': 'Renouvellement liquide de transmission',
  'Transmission fluid replacement': 'Renouvellement liquide de transmission',
  'Brake pads replacement': 'Remplacement plaquettes de frein',
  'Battery replacement': 'Remplacement batterie',
  'MOT inspection': 'Contrôle technique',
  'Technical inspection': 'Contrôle technique',
  'Spark plug replacement': 'Remplacement bougie d\'allumage',
  'Chain lubrication': 'Lubrification chaîne',
  'Tire replacement': 'Remplacement pneus',
  'Tire inspection': 'Inspection pneus',
  'Chain replacement': 'Remplacement chaîne',
  'Other': 'Autre',
};

export function getInterventionDisplayName(name) {
  return interventionTranslations[name] || name;
}

/**
 * Libellés ABRÉGÉS, pour le calendrier du planning.
 *
 * Ce n'est pas un doublon de la table ci-dessus : une case de calendrier fait
 * quelques dizaines de pixels, et « Remplacement courroie de distribution » y
 * déborde. Les deux tables coexistent donc volontairement — mais dans le même
 * fichier, pour qu'un ajout dans l'une saute aux yeux quand on oublie l'autre.
 * Elles vivaient jusqu'ici dans deux fichiers différents, ce qui rendait la
 * divergence invisible.
 */
const shortNames = {
  'Oil change': 'Vidange',
  'Air filter replacement': 'Filtre à air',
  'Cabin filter replacement': 'Filtre habitacle',
  'Cabin air filter replacement': 'Filtre habitacle',
  'Brake fluid flush': 'Purge freins',
  'Timing belt replacement': 'Courroie distrib.',
  'Coolant replacement': 'Liquide refroid.',
  'Coolant fluid renewal': 'Liquide refroid.',
  'Transmission fluid renewal': 'Liquide transm.',
  'Transmission fluid replacement': 'Liquide transm.',
  'Brake pads replacement': 'Plaquettes frein',
  'Battery replacement': 'Batterie',
  'MOT inspection': 'Contrôle technique',
  'Technical inspection': 'Contrôle technique',
  'Spark plug replacement': 'Bougies',
  'Chain lubrication': 'Graissage chaîne',
  'Tire replacement': 'Pneus',
  'Tire inspection': 'Inspection pneus',
  'Chain replacement': 'Chaîne',
  'Other': 'Autre',
  'Fork service (oil change + seals)': 'Fourche',
  'Valve clearance check': 'Jeu soupapes',
};

export function getShortInterventionName(name) {
  return shortNames[name] || name;
}
