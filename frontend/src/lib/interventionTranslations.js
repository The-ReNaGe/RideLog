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
