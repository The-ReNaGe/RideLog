import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

// Types déclenchant la checklist de révision (voitures et motos)
const REVISION_TRIGGERS = [
  'Révision périodique (km)',
  'Entretien annuel',
];

// Types déclenchant les sous-cases de freins/pneus (voitures et motos)
const SUBITEM_TRIGGERS = [
  'Remplacement freins',
  'Remplacement pneus',
];

// Sous-items pour "Remplacement freins"
const BRAKE_SUBITEMS = [
  { key: 'brake_pads_front', name: 'Plaquettes avant' },
  { key: 'brake_pads_rear', name: 'Plaquettes arrière' },
  { key: 'brake_discs_front', name: 'Disques avant' },
  { key: 'brake_discs_rear', name: 'Disques arrière' },
];

// Sous-items pour "Remplacement pneus"
const TIRE_SUBITEMS = [
  { key: 'tires_front', name: 'Pneus avant' },
  { key: 'tires_rear', name: 'Pneus arrière' },
];

// Items de checklist de révision pour motos
const REVISION_ITEMS_MOTO = [
  { key: 'oil_change_moto', name: "Vidange d'huile + Remplacement filtre à huile", group: 'Moteur', emoji: '🔧' },
  { key: 'spark_plug', name: 'Remplacement bougie d\'allumage', group: 'Moteur', emoji: '🔧' },
  { key: 'air_filter', name: 'Remplacement filtre à air', group: 'Moteur', emoji: '🔧' },
  { key: 'valve_clearance', name: 'Contrôle et ajustement jeu aux soupapes', group: 'Moteur', emoji: '🔧' },
  { key: 'chain_kit', name: 'Remplacement kit chaîne (chaîne + pignon + couronne)', group: 'Transmission', emoji: '⛓️' },
  { key: 'chain_maintenance', name: 'Tension et lubrification chaîne', group: 'Transmission', emoji: '⛓️' },
  { key: 'brake_replacement', name: 'Remplacement freins', group: 'Freinage', emoji: '🛑', hasSubItems: true, subItems: [
    { key: 'brake_pads_front', name: 'Plaquettes avant' },
    { key: 'brake_pads_rear', name: 'Plaquettes arrière' },
    { key: 'brake_discs_front', name: 'Disques avant' },
    { key: 'brake_discs_rear', name: 'Disques arrière' },
  ]},
  { key: 'fork_service', name: 'Révision fourche (vidange + joints)', group: 'Suspension', emoji: '🔩' },
  { key: 'wheel_bearings', name: 'Contrôle roulements de roue', group: 'Suspension', emoji: '🔩' },
  { key: 'steering_bearings', name: 'Contrôle roulements de direction', group: 'Suspension', emoji: '🔩' },
  { key: 'brake_fluid', name: 'Remplacement liquide de frein', group: 'Liquides', emoji: '💧' },
  { key: 'coolant', name: 'Remplacement liquide de refroidissement', group: 'Liquides', emoji: '💧' },
  { key: 'tire_replacement', name: 'Remplacement pneus', group: 'Pneumatiques', emoji: '🏍️', hasSubItems: true, subItems: [
    { key: 'tires_front', name: 'Pneus avant' },
    { key: 'tires_rear', name: 'Pneus arrière' },
  ]},
  { key: 'battery', name: 'Remplacement batterie', group: 'Électronique', emoji: '⚡' },
  { key: 'carburetor_cleaning', name: 'Nettoyage carburateur', group: 'Électronique', emoji: '⚡' },
  { key: 'injection_sync', name: 'Synchronisation injection', group: 'Électronique', emoji: '⚡' },
  { key: 'electronic_diagnosis', name: 'Diagnostic électronique', group: 'Électronique', emoji: '⚡' },
];

// Items de checklist de révision pour voitures
const REVISION_ITEMS_CAR = [
  { key: 'oil_change', name: 'Vidange + filtre à huile', group: 'Moteur', emoji: '🔧' },
  { key: 'air_filter', name: 'Remplacement filtre à air', group: 'Moteur', emoji: '🔧' },
  { key: 'spark_plug', name: 'Remplacement bougies d\'allumage', group: 'Moteur', emoji: '🔧' },
  { key: 'cabin_filter', name: 'Remplacement filtre d\'habitacle', group: 'Filtration', emoji: '🌬️' },
  { key: 'fuel_filter_diesel', name: 'Remplacement filtre à gasoil', group: 'Filtration', emoji: '🌬️', motorization: 'diesel' },
  { key: 'fuel_filter_gasoline', name: 'Remplacement filtre à essence', group: 'Filtration', emoji: '🌬️', motorization: 'essence' },
  { key: 'brake_fluid', name: 'Purge de frein', group: 'Liquides', emoji: '💧' },
  { key: 'coolant', name: 'Renouvellement liquide de refroidissement', group: 'Liquides', emoji: '💧' },
  { key: 'transmission_fluid', name: 'Renouvellement liquide de transmission', group: 'Liquides', emoji: '💧' },
  { key: 'brake_replacement', name: 'Remplacement freins', group: 'Freinage', emoji: '🛑', hasSubItems: true, subItems: [
    { key: 'brake_pads_front', name: 'Plaquettes avant' },
    { key: 'brake_pads_rear', name: 'Plaquettes arrière' },
    { key: 'brake_discs_front', name: 'Disques avant' },
    { key: 'brake_discs_rear', name: 'Disques arrière' },
  ]},
  { key: 'tire_replacement', name: 'Remplacement pneus', group: 'Pneumatiques', emoji: '🚗', hasSubItems: true, subItems: [
    { key: 'tires_front', name: 'Pneus avant' },
    { key: 'tires_rear', name: 'Pneus arrière' },
  ]},
  { key: 'battery', name: 'Remplacement batterie', group: 'Électrique', emoji: '⚡' },
];

const STATIC_MAINTENANCE_TYPES = {
  car: [
    'Entretien annuel',
    'Vidange d\'huile',
    'Remplacement filtre à air',
    'Remplacement filtre d\'habitacle',
    'Remplacement filtre à gasoil',
    'Remplacement filtre à essence',
    'Remplacement bougies d\'allumage',
    'Purge de frein',
    'Remplacement courroie de distribution',
    'Renouvellement liquide de refroidissement',
    'Renouvellement liquide de transmission',
    'Remplacement freins',
    'Remplacement batterie',
    'Contrôle technique',
    'Remplacement pneus',
    'Autre',
  ],
  motorcycle: [
    'Révision périodique (km)',
    'Entretien annuel',
    'Vidange d\'huile + Remplacement filtre à huile',
    'Remplacement filtre à air',
    'Remplacement bougie d\'allumage',
    'Remplacement liquide de frein',
    'Renouvellement liquide de refroidissement',
    'Remplacement huile de transmission',
    'Révision fourche (vidange + joints)',
    'Remplacement kit chaîne (chaîne + pignon + couronne)',
    'Tension et lubrification chaîne',
    'Remplacement freins',
    'Remplacement pneus',
    'Remplacement batterie',
    'Contrôle et ajustement jeu aux soupapes',
    'Nettoyage carburateur',
    'Synchronisation injection',
    'Diagnostic électronique',
    'Contrôle technique',
    'Autre',
  ],
};

export default function MaintenanceForm({
  vehicleId,
  vehicleType,
  displacement,
  rangeCategory,
  motorization,
  upcomingMaintenances = [],
  onSubmit,
  onCancel,
}) {
  const [formData, setFormData] = useState({
    intervention_type: '',
    execution_date: new Date().toISOString().split('T')[0],
    mileage_at_intervention: '',
    cost_paid: '',
    notes: '',
    maintenance_category: 'scheduled',
    other_title: '',
  });
  const [invoiceFiles, setInvoiceFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [availableInterventions, setAvailableInterventions] = useState([]);
  const [selectedInterventionDetails, setSelectedInterventionDetails] = useState(null);
  const [subItemsChecked, setSubItemsChecked] = useState({});
  const [revisionSubItemsChecked, setRevisionSubItemsChecked] = useState({});

  useEffect(() => {
    const getInterventions = async () => {
      try {
        const response = await api.getAvailableInterventions(vehicleId, vehicleType, displacement);
        let interventions = response.data.interventions || [];
        const hasAutre = interventions.some(i =>
          (typeof i === 'string' && i === 'Autre') ||
          (i.name && i.name === 'Autre')
        );
        if (!hasAutre) interventions = [...interventions, { name: 'Autre' }];
        setAvailableInterventions(interventions);
      } catch (err) {
        console.warn('Failed to load interventions from API, using static list', err);
        const types = vehicleType === 'car'
          ? STATIC_MAINTENANCE_TYPES.car
          : STATIC_MAINTENANCE_TYPES.motorcycle;
        setAvailableInterventions(types.map(name => ({ name })));
      }
    };
    getInterventions();
  }, [vehicleId, vehicleType, displacement]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'intervention_type') {
      const selected = availableInterventions.find(i => i.name === value || i.id === value);
      setSelectedInterventionDetails(selected);
      // Réinitialiser les sous-items quand on change le type
      setSubItemsChecked({});
      setRevisionSubItemsChecked({});
    }
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'mileage_at_intervention' || name === 'cost_paid'
        ? (value ? (name === 'cost_paid' ? parseFloat(value) : parseInt(value)) : '')
        : value,
    }));
  };

  const handleInvoiceChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length + invoiceFiles.length > 10) {
      setError(`Maximum 10 factures autorisées (actuellement ${invoiceFiles.length})`);
      return;
    }
    setInvoiceFiles((prev) => [...prev, ...files]);
    setError(null);
  };

  const removeInvoice = (index) => {
    setInvoiceFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const getEstimatedPrice = () => {
    if (!selectedInterventionDetails?.prices) return null;
    const priceData = selectedInterventionDetails.prices[rangeCategory || 'generalist'];
    if (!priceData) return null;
    return { min: priceData.min, max: priceData.max };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      const isSubItemTrigger = SUBITEM_TRIGGERS.includes(formData.intervention_type);
      const isRevisionTrigger = REVISION_TRIGGERS.includes(formData.intervention_type);

      // Créer l'enregistrement
      const payload = new FormData();
      payload.append('intervention_type', formData.intervention_type);
      payload.append('execution_date', new Date(formData.execution_date).toISOString());
      if (formData.mileage_at_intervention) {
        payload.append('mileage_at_intervention', String(parseInt(formData.mileage_at_intervention)));
      }
      payload.append('maintenance_category', formData.maintenance_category);
      if (formData.other_title && formData.intervention_type === 'Autre') {
        payload.append('other_description', formData.other_title);
      }
      if (formData.cost_paid) payload.append('cost_paid', String(parseFloat(formData.cost_paid)));
      if (formData.notes) payload.append('notes', formData.notes);
      invoiceFiles.forEach((file) => payload.append('invoice_files', file));

      // Ajouter les sous-interventions pour freins/pneus
      if (isSubItemTrigger) {
        const subItems = formData.intervention_type === 'Remplacement freins' ? BRAKE_SUBITEMS : TIRE_SUBITEMS;
        const selectedSubItems = subItems.filter(item => subItemsChecked[item.key]);
        if (selectedSubItems.length > 0) {
          payload.append('sub_interventions', JSON.stringify(selectedSubItems));
        }
      }

      // Ajouter les sous-interventions pour révisions
      if (isRevisionTrigger) {
        const revisionItems = vehicleType === 'motorcycle' ? REVISION_ITEMS_MOTO : REVISION_ITEMS_CAR;
        const selectedRevisionItems = [];

        revisionItems.forEach(item => {
          // Filtrer selon la motorisation pour les voitures
          if (vehicleType === 'car' && item.motorization) {
            if (item.motorization === 'diesel' && motorization !== 'diesel') return;
            if (item.motorization === 'essence' && !['essence', 'hybride'].includes(motorization)) return;
          }

          if (revisionSubItemsChecked[item.key]) {
            // Si l'item a des sous-items, on les ajoute à la place de l'item principal
            if (item.hasSubItems && item.subItems) {
              const selectedSubItems = item.subItems.filter(sub => revisionSubItemsChecked[sub.key]);
              if (selectedSubItems.length > 0) {
                selectedRevisionItems.push(...selectedSubItems);
              }
            } else {
              // Sinon on ajoute l'item principal
              selectedRevisionItems.push({ key: item.key, name: item.name });
            }
          }
        });

        if (selectedRevisionItems.length > 0) {
          payload.append('sub_interventions', JSON.stringify(selectedRevisionItems));
        }
      }

      await api.createMaintenance(vehicleId, payload);
      onSubmit();
    } catch (err) {
      setError(err.response?.data?.detail || 'Impossible de créer l\'enregistrement d\'entretien');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const estimatedPrice = getEstimatedPrice();

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <h3 className="text-lg font-bold mb-4">Enregistrer une intervention</h3>

        {error && (
          <div className="p-3 bg-red-100 border border-red-300 rounded text-red-800 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Type d'intervention*</label>
            <select
              name="intervention_type"
              value={formData.intervention_type}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Sélectionnez une intervention...</option>
              {availableInterventions.map((intervention) => {
                const displayName = typeof intervention === 'string' ? intervention : intervention.name;
                return (
                  <option key={displayName} value={displayName}>{displayName}</option>
                );
              })}
            </select>

            {formData.intervention_type === 'Autre' && (
              <div className="mt-3">
                <label className="block text-sm font-medium mb-1">Titre d'intervention*</label>
                <input
                  type="text"
                  name="other_title"
                  value={formData.other_title}
                  onChange={handleChange}
                  placeholder="Ex: Remplacement silencieux, Réparation moteur..."
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            )}

            {estimatedPrice && (
              <p className="mt-2 text-sm p-2 rounded" style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', color: 'var(--text-1)' }}>
                <strong>Prix estimé :</strong> €{estimatedPrice.min}–€{estimatedPrice.max}
                <span className="text-xs ml-1" style={{ color: 'var(--text-3)' }}>
                  (catégorie {rangeCategory || 'generalist'})
                </span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Date*</label>
            <input
              type="date"
              name="execution_date"
              value={formData.execution_date}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Kilométrage (km)
              <span className="ml-1 font-normal text-xs" style={{ color: 'var(--text-3)' }}>(optionnel — estimé si absent)</span>
            </label>
            <input
              type="number"
              name="mileage_at_intervention"
              value={formData.mileage_at_intervention}
              onChange={handleChange}
              placeholder="Laisser vide pour estimation auto"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Coût payé (€)</label>
            <input
              type="number"
              name="cost_paid"
              value={formData.cost_paid}
              onChange={handleChange}
              placeholder="Optionnel"
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Catégorie d'intervention*</label>
            <select
              name="maintenance_category"
              value={formData.maintenance_category}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
            >
              <option value="scheduled">🔧 Entretien</option>
              <option value="repair">⚠️ Réparation/Panne</option>
              <option value="modification">🔨 Modification véhicule</option>
            </select>
          </div>
        </div>

        {/* Sous-cases à cocher pour freins/pneus */}
        {SUBITEM_TRIGGERS.includes(formData.intervention_type) && (
          <div className="card p-3" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-1)' }}>
              Détails de l'intervention :
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(formData.intervention_type === 'Remplacement freins' ? BRAKE_SUBITEMS : TIRE_SUBITEMS).map((item) => (
                <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={subItemsChecked[item.key] || false}
                    onChange={(e) => setSubItemsChecked(prev => ({ ...prev, [item.key]: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm" style={{ color: 'var(--text-2)' }}>{item.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Checklist de révision */}
        {REVISION_TRIGGERS.includes(formData.intervention_type) && (
          <div className="card p-3" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-1)' }}>
              Détail de la révision :
            </p>
            <div className="space-y-3">
              {(vehicleType === 'motorcycle' ? REVISION_ITEMS_MOTO : REVISION_ITEMS_CAR)
                .filter(item => {
                  // Filtrer selon la motorisation pour les voitures
                  if (vehicleType === 'car' && item.motorization) {
                    if (item.motorization === 'diesel' && motorization !== 'diesel') return false;
                    if (item.motorization === 'essence' && !['essence', 'hybride'].includes(motorization)) return false;
                  }
                  return true;
                })
                .reduce((groups, item) => {
                  const group = groups.find(g => g.label === item.group);
                  if (group) {
                    group.items.push(item);
                  } else {
                    groups.push({ label: item.group, emoji: item.emoji, items: [item] });
                  }
                  return groups;
                }, [])
                .map(group => (
                  <div key={group.label}>
                    <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>
                      {group.emoji} {group.label}
                    </div>
                    <div className="grid grid-cols-1 gap-1">
                      {group.items.map(item => (
                        <div key={item.key}>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={revisionSubItemsChecked[item.key] || false}
                              onChange={(e) => {
                                setRevisionSubItemsChecked(prev => ({ ...prev, [item.key]: e.target.checked }));
                                // Réinitialiser les sous-items quand on décoche l'item principal
                                if (!e.target.checked && item.hasSubItems) {
                                  item.subItems.forEach(sub => {
                                    setRevisionSubItemsChecked(prev => ({ ...prev, [sub.key]: false }));
                                  });
                                }
                              }}
                              className="w-4 h-4 rounded border-gray-300"
                            />
                            <span className="text-sm" style={{ color: 'var(--text-2)' }}>{item.name}</span>
                          </label>
                          {/* Sous-items pour freins et pneus */}
                          {item.hasSubItems && revisionSubItemsChecked[item.key] && (
                            <div className="ml-6 mt-1 grid grid-cols-2 gap-1">
                              {item.subItems.map(sub => (
                                <label key={sub.key} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={revisionSubItemsChecked[sub.key] || false}
                                    onChange={(e) => setRevisionSubItemsChecked(prev => ({ ...prev, [sub.key]: e.target.checked }))}
                                    className="w-4 h-4 rounded border-gray-300"
                                  />
                                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>{sub.name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Remarques</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Notes additionnelles..."
            rows="2"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Factures (PDF / Images)</label>
          <p className="text-xs mb-2" style={{ color: 'var(--text-3)' }}>Jusqu'à 10 fichiers, max 10 Mo chacun</p>
          <input
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={handleInvoiceChange}
            disabled={invoiceFiles.length >= 10}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
          />
          {invoiceFiles.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium">Fichiers sélectionnés ({invoiceFiles.length}/10) :</p>
              <ul className="space-y-1">
                {invoiceFiles.map((file, index) => (
                  <li key={index} className="flex items-center justify-between p-2 rounded text-sm" style={{ background: 'var(--bg-base)' }}>
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeInvoice(index)}
                      className="ml-2 text-red-600 hover:text-red-800 font-medium"
                    >✕</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <button type="submit" disabled={loading} className="btn btn-primary flex-1">
            {loading ? 'Enregistrement...' : 'Enregistrer l\'intervention'}
          </button>
          <button type="button" onClick={onCancel} className="btn btn-secondary flex-1">
            Annuler
          </button>
        </div>
      </form>
    </>
  );
}