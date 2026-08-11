// Logique partagée des checklists de révision (voitures et motos)
// Utilisé par MaintenanceForm.jsx, MaintenanceHistory.jsx et RevisionChecklistModal.jsx

// Types déclenchant la checklist complète de révision
export const REVISION_TRIGGERS = [
  'Révision périodique (km)',
  'Entretien annuel',
];

// Types déclenchant uniquement les sous-cases avant/arrière (freins ou pneus seuls)
export const SUBITEM_TRIGGERS = [
  'Remplacement freins',
  'Remplacement pneus',
];

export const BRAKE_SUBITEMS = [
  { key: 'brake_pads_front', name: 'Plaquettes avant' },
  { key: 'brake_pads_rear', name: 'Plaquettes arrière' },
  { key: 'brake_discs_front', name: 'Disques avant' },
  { key: 'brake_discs_rear', name: 'Disques arrière' },
];

export const TIRE_SUBITEMS = [
  { key: 'tires_front', name: 'Pneus avant' },
  { key: 'tires_rear', name: 'Pneus arrière' },
];

// Items pré-cochés par défaut lors d'une révision (create mode, pas d'historique préalable)
export const DEFAULT_CHECKED_CAR = ['oil_change', 'air_filter', 'cabin_filter', 'fuel_filter_diesel'];
export const DEFAULT_CHECKED_MOTO = ['oil_change_moto'];

export const REVISION_ITEMS_MOTO = [
  { key: 'oil_change_moto', name: "Vidange d'huile + Remplacement filtre à huile", group: 'Moteur', emoji: '🔧' },
  { key: 'spark_plug', name: "Remplacement bougie d'allumage", group: 'Moteur', emoji: '🔧' },
  { key: 'air_filter', name: 'Remplacement filtre à air', group: 'Moteur', emoji: '🔧' },
  { key: 'valve_clearance', name: 'Contrôle et ajustement jeu aux soupapes', group: 'Moteur', emoji: '🔧' },
  { key: 'chain_kit', name: 'Remplacement kit chaîne (chaîne + pignon + couronne)', group: 'Transmission', emoji: '⛓️' },
  { key: 'chain_maintenance', name: 'Tension et lubrification chaîne', group: 'Transmission', emoji: '⛓️' },
  {
    key: 'brake_replacement', name: 'Remplacement freins', group: 'Freinage', emoji: '🛑',
    hasSubItems: true, subItems: BRAKE_SUBITEMS,
  },
  { key: 'fork_service', name: 'Révision fourche (vidange + joints)', group: 'Suspension', emoji: '🔩' },
  { key: 'wheel_bearings', name: 'Contrôle roulements de roue', group: 'Suspension', emoji: '🔩' },
  { key: 'steering_bearings', name: 'Contrôle roulements de direction', group: 'Suspension', emoji: '🔩' },
  { key: 'brake_fluid', name: 'Remplacement liquide de frein', group: 'Liquides', emoji: '💧' },
  { key: 'coolant', name: 'Remplacement liquide de refroidissement', group: 'Liquides', emoji: '💧' },
  {
    key: 'tire_replacement', name: 'Remplacement pneus', group: 'Pneumatiques', emoji: '🏍️',
    hasSubItems: true, subItems: TIRE_SUBITEMS,
  },
  { key: 'battery', name: 'Remplacement batterie', group: 'Électronique', emoji: '⚡' },
  { key: 'carburetor_cleaning', name: 'Nettoyage carburateur', group: 'Électronique', emoji: '⚡' },
  { key: 'injection_sync', name: 'Synchronisation injection', group: 'Électronique', emoji: '⚡' },
  { key: 'electronic_diagnosis', name: 'Diagnostic électronique', group: 'Électronique', emoji: '⚡' },
];

export const REVISION_ITEMS_CAR = [
  { key: 'oil_change', name: 'Vidange + filtre à huile', group: 'Moteur', emoji: '🔧' },
  { key: 'air_filter', name: 'Remplacement filtre à air', group: 'Moteur', emoji: '🔧' },
  { key: 'spark_plug', name: "Remplacement bougies d'allumage", group: 'Moteur', emoji: '🔧' },
  { key: 'cabin_filter', name: "Remplacement filtre d'habitacle", group: 'Filtration', emoji: '🌬️' },
  { key: 'fuel_filter_diesel', name: 'Remplacement filtre à gasoil', group: 'Filtration', emoji: '🌬️', motorization: 'diesel' },
  { key: 'fuel_filter_gasoline', name: 'Remplacement filtre à essence', group: 'Filtration', emoji: '🌬️', motorization: 'essence' },
  { key: 'brake_fluid', name: 'Purge de frein', group: 'Liquides', emoji: '💧' },
  { key: 'coolant', name: 'Renouvellement liquide de refroidissement', group: 'Liquides', emoji: '💧' },
  { key: 'transmission_fluid', name: 'Renouvellement liquide de transmission', group: 'Liquides', emoji: '💧' },
  {
    key: 'brake_replacement', name: 'Remplacement freins', group: 'Freinage', emoji: '🛑',
    hasSubItems: true, subItems: BRAKE_SUBITEMS,
  },
  {
    key: 'tire_replacement', name: 'Remplacement pneus', group: 'Pneumatiques', emoji: '🚗',
    hasSubItems: true, subItems: TIRE_SUBITEMS,
  },
  { key: 'battery', name: 'Remplacement batterie', group: 'Électrique', emoji: '⚡' },
];

export function getRevisionItems(vehicleType) {
  return vehicleType === 'motorcycle' ? REVISION_ITEMS_MOTO : REVISION_ITEMS_CAR;
}

export function getDefaultChecked(vehicleType) {
  return vehicleType === 'motorcycle' ? DEFAULT_CHECKED_MOTO : DEFAULT_CHECKED_CAR;
}

// Filtre les items non pertinents pour la motorisation du véhicule (diesel/essence)
export function filterItemsForMotorization(items, vehicleType, motorization) {
  if (vehicleType !== 'car') return items;
  return items.filter((item) => {
    if (!item.motorization) return true;
    if (item.motorization === 'diesel') return motorization === 'diesel';
    if (item.motorization === 'essence') return ['essence', 'hybride'].includes(motorization);
    return true;
  });
}

// Construit le tableau final [{key, name}, ...] à partir d'un état "checked" { key: bool }
export function buildSelectedSubInterventions({ items, checked, vehicleType, motorization }) {
  const filtered = filterItemsForMotorization(items, vehicleType, motorization);
  const selected = [];
  filtered.forEach((item) => {
    if (!checked[item.key]) return;
    if (item.hasSubItems && item.subItems) {
      const subs = item.subItems.filter((sub) => checked[sub.key]);
      if (subs.length > 0) selected.push(...subs);
    } else {
      selected.push({ key: item.key, name: item.name });
    }
  });
  return selected;
}

// Reconstruit un état "checked" { key: bool } à partir de sub_interventions déjà enregistrées (mode édition)
export function buildCheckedFromSubInterventions(subInterventions, items) {
  const checked = {};
  (subInterventions || []).forEach((sub) => {
    const key = sub.key || sub.name;
    checked[key] = true;
  });
  // Coche aussi le parent si au moins un de ses sous-items est coché (freins/pneus)
  items.forEach((item) => {
    if (item.hasSubItems && item.subItems) {
      const hasCheckedSub = item.subItems.some((sub) => checked[sub.key]);
      if (hasCheckedSub) checked[item.key] = true;
    }
  });
  return checked;
}

// Pré-coche les items "en retard/urgent" d'après le résultat de GET /upcoming
export function getUrgencyMap(upcomingData, items) {
  const map = {};
  for (const upcomingItem of upcomingData || []) {
    const match = items.find((item) => item.name === upcomingItem.intervention_type);
    if (match) {
      if (upcomingItem.status === 'overdue' || upcomingItem.status === 'urgent') map[match.key] = 'due';
      else if (upcomingItem.status === 'warning') map[match.key] = 'soon';
    }
  }
  return map;
}