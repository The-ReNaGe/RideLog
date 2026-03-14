import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

const STATIC_MAINTENANCE_TYPES = {
  car: [
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
    'Remplacement plaquettes de frein',
    'Remplacement batterie',
    'Contrôle technique',
    'Remplacement pneus',
    'Autre',
  ],
  motorcycle: [
    'Révision périodique (km)',
    'Entretien annuel',
    'Vidange d\'huile',
    'Remplacement filtre à huile',
    'Remplacement filtre à air',
    'Remplacement bougie d\'allumage',
    'Purge de frein',
    'Renouvellement liquide de refroidissement',
    'Renouvellement huile transmission',
    'Révision fourche (vidange + joints)',
    'Remplacement kit chaîne (chaîne + pignon + couronne)',
    'Tension et lubrification chaîne',
    'Remplacement pneu avant',
    'Remplacement pneu arrière',
    'Remplacement plaquettes de frein',
    'Remplacement disques de frein',
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

  // Load available interventions on component mount
  useEffect(() => {
    const getInterventions = async () => {
      try {
        // First try to load from API
        const response = await api.getAvailableInterventions(vehicleId, vehicleType, displacement);
        let interventions = response.data.interventions || [];
        
        // Ensure "Autre" is always in the list
        const hasAutre = interventions.some(i => 
          (typeof i === 'string' && i === 'Autre') || 
          (i.name && i.name === 'Autre')
        );
        if (!hasAutre) {
          interventions = [...interventions, { name: 'Autre' }];
        }
        setAvailableInterventions(interventions);
      } catch (err) {
        console.warn('Failed to load interventions from API, using static list', err);
        // Fallback to static list
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
      // Find the intervention details to show estimated cost
      const selected = availableInterventions.find(i => 
        i.name === value || i.id === value
      );
      setSelectedInterventionDetails(selected);
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
    // Limit to 10 files total
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
    if (!selectedInterventionDetails || !selectedInterventionDetails.prices) {
      return null;
    }
    
    const priceData = selectedInterventionDetails.prices[rangeCategory || 'generalist'];
    if (!priceData) return null;
    
    return {
      min: priceData.min,
      max: priceData.max,
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      const payload = new FormData();
      payload.append('intervention_type', formData.intervention_type);
      payload.append('execution_date', new Date(formData.execution_date).toISOString());
      payload.append('mileage_at_intervention', String(parseInt(formData.mileage_at_intervention)));
      payload.append('maintenance_category', formData.maintenance_category);
      if (formData.other_title && formData.intervention_type === 'Autre') {
        payload.append('other_description', formData.other_title);
      }
      if (formData.cost_paid) payload.append('cost_paid', String(parseFloat(formData.cost_paid)));
      if (formData.notes) payload.append('notes', formData.notes);
      
      // Add all invoice files
      invoiceFiles.forEach((file, index) => {
        payload.append('invoice_files', file);
      });

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
                <option key={displayName} value={displayName}>
                  {displayName}
                </option>
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
              <strong>Prix estimé:</strong> €{estimatedPrice.min} - €{estimatedPrice.max} 
              <span className="text-xs ml-1" style={{ color: 'var(--text-3)' }}>
                (pour catégorie {rangeCategory || 'generalist'})
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
          <label className="block text-sm font-medium mb-1">Kilométrage (km)*</label>
          <input
            type="number"
            name="mileage_at_intervention"
            value={formData.mileage_at_intervention}
            onChange={handleChange}
            required
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
            <p className="text-sm font-medium">Fichiers sélectionnés ({invoiceFiles.length}/10):</p>
            <ul className="space-y-1">
              {invoiceFiles.map((file, index) => (
                <li key={index} className="flex items-center justify-between p-2 rounded text-sm" style={{ background: 'var(--bg-base)' }}>
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeInvoice(index)}
                    className="ml-2 text-red-600 hover:text-red-800 font-medium"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary flex-1"
        >
          {loading ? 'Enregistrement...' : 'Enregistrer l\'intervention'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary flex-1"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
