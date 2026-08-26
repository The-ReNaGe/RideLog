import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import RevisionChecklistModal from './RevisionChecklistModal';
import Icon from './Icon';
import {
  REVISION_TRIGGERS,
  SUBITEM_TRIGGERS,
  getRevisionItems,
  buildCheckedFromSubInterventions,
} from '../lib/revisionChecklist';

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
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [pendingSubInterventions, setPendingSubInterventions] = useState(null);

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
      setPendingSubInterventions(null);
      if (REVISION_TRIGGERS.includes(value) || SUBITEM_TRIGGERS.includes(value)) {
        setShowRevisionModal(true);
      } else {
        setShowRevisionModal(false);
      }
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

  const needsRevisionModal = REVISION_TRIGGERS.includes(formData.intervention_type)
    || SUBITEM_TRIGGERS.includes(formData.intervention_type);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

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

      if (pendingSubInterventions && pendingSubInterventions.length > 0) {
        payload.append('sub_interventions', JSON.stringify(pendingSubInterventions));
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
          <div className="text-sm" style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
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
              className="w-full"
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
                  className="w-full"
                />
              </div>
            )}

            {needsRevisionModal && (
              <div className="mt-2 flex items-center justify-between gap-2 p-2 rounded text-xs" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-3)' }}>
                  <Icon name="clipboard" size={15} />
                  {pendingSubInterventions && pendingSubInterventions.length > 0
                    ? `${pendingSubInterventions.length} élément(s) sélectionné(s)`
                    : 'Aucun détail sélectionné'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowRevisionModal(true)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                >
                  Modifier le détail
                </button>
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
              className="w-full"
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
              className="w-full"
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
              className="w-full"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Catégorie d'intervention*</label>
            <select
              name="maintenance_category"
              value={formData.maintenance_category}
              onChange={handleChange}
              className="w-full mb-3"
            >
              <option value="scheduled">Entretien</option>
              <option value="repair">Réparation / panne</option>
              <option value="modification">Modification du véhicule</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Remarques</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Notes additionnelles..."
            rows="2"
            className="w-full"
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
            className="w-full"
          />
          {invoiceFiles.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium">Fichiers sélectionnés ({invoiceFiles.length}/10) :</p>
              <ul className="space-y-1">
                {invoiceFiles.map((file, index) => (
                  <li key={index} className="inset flex items-center justify-between p-2 text-sm">
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeInvoice(index)}
                      className="btn-icon danger"
                      style={{ marginLeft: 6, minHeight: 24, width: 24 }}
                      aria-label={`Retirer ${file.name}`}
                    ><Icon name="close" size={13} strokeWidth={2.2} /></button>
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

      {showRevisionModal && (
        <RevisionChecklistModal
          vehicleType={vehicleType}
          motorization={motorization}
          interventionType={formData.intervention_type}
          upcomingMaintenances={upcomingMaintenances}
          initialChecked={
            pendingSubInterventions
              ? buildCheckedFromSubInterventions(pendingSubInterventions, getRevisionItems(vehicleType))
              : null
          }
          onClose={() => setShowRevisionModal(false)}
          onConfirm={(subInterventions) => {
            setPendingSubInterventions(subInterventions);
            setShowRevisionModal(false);
          }}
        />
      )}
    </>
  );
}