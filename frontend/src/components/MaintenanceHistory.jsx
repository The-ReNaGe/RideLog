import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

// Map English intervention names (from backend) to French display names
const interventionTranslations = {
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

function getInterventionDisplayName(englishName) {
  return interventionTranslations[englishName] || englishName;
}

export default function MaintenanceHistory({ vehicleId, onDataChanged }) {
  const [maintenances, setMaintenances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [newInvoiceFiles, setNewInvoiceFiles] = useState([]);

  useEffect(() => {
    fetchMaintenances();
  }, [vehicleId]);

  const fetchMaintenances = async () => {
    try {
      setLoading(true);
      const response = await api.getMaintenances(vehicleId);
      setMaintenances(response.data);
    } catch (err) {
      console.error('Failed to load maintenance history', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (maintenanceId) => {
    if (!window.confirm('Supprimer cette intervention ?')) return;
    try {
      await api.deleteMaintenance(vehicleId, maintenanceId);
      fetchMaintenances();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      console.error('Failed to delete maintenance', err);
      alert('Impossible de supprimer cette intervention');
    }
  };

  const handleEdit = (maintenance) => {
    setEditingId(maintenance.id);
    setEditForm({
      execution_date: maintenance.execution_date.split('T')[0],
      mileage_at_intervention: maintenance.mileage_at_intervention,
      cost_paid: maintenance.cost_paid || '',
      notes: maintenance.notes || '',
    });
    setNewInvoiceFiles([]);
  };

  const handleUpdate = async (maintenanceId) => {
    try {
      let updatePayload;
      
      if (newInvoiceFiles.length > 0) {
        // Use FormData if there are new files
        updatePayload = new FormData();
        updatePayload.append('execution_date', editForm.execution_date);
        updatePayload.append('mileage_at_intervention', String(parseInt(editForm.mileage_at_intervention)));
        updatePayload.append('cost_paid', editForm.cost_paid ? String(parseFloat(editForm.cost_paid)) : '');
        updatePayload.append('notes', editForm.notes);
        newInvoiceFiles.forEach((file, index) => {
          updatePayload.append('invoice_files', file);
        });
        await api.updateMaintenanceWithFiles(vehicleId, maintenanceId, updatePayload);
      } else {
        // Use regular JSON if no files
        updatePayload = {
          execution_date: editForm.execution_date,
          mileage_at_intervention: parseInt(editForm.mileage_at_intervention),
          cost_paid: editForm.cost_paid ? parseFloat(editForm.cost_paid) : null,
          notes: editForm.notes,
        };
        await api.updateMaintenance(vehicleId, maintenanceId, updatePayload);
      }
      
      setEditingId(null);
      setNewInvoiceFiles([]);
      fetchMaintenances();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      console.error('Failed to update maintenance', err);
      alert('Impossible de modifier cette intervention');
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditForm({});
    setNewInvoiceFiles([]);
  };

  const handleInvoiceFileSelection = (e) => {
    const files = Array.from(e.target.files || []);
    setNewInvoiceFiles((prev) => [...prev, ...files]);
  };

  const removeNewInvoice = (index) => {
    setNewInvoiceFiles((prev) => prev.filter((_, i) => i !== index));
  };

  if (loading) {
    return <div className="text-center py-12" style={{ color: 'var(--text-2)' }}>Chargement...</div>;
  }

  if (maintenances.length === 0) {
    return (
      <div className="card p-12 text-center">
        <p style={{ color: 'var(--text-2)' }}>Aucun enregistrement</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {maintenances.map((maintenance) => {
        const getCategoryDisplay = (category) => {
          const categoryMap = {
            'scheduled': { icon: '🔧', label: 'Entretien', bg: 'var(--accent)', bgLight: 'rgba(108,138,247,0.12)' },
            'repair': { icon: '⚠️', label: 'Réparation', bg: 'var(--warning)', bgLight: 'rgba(243,156,18,0.12)' },
            'modification': { icon: '🔨', label: 'Modification', bg: '#8b5cf6', bgLight: 'rgba(139,92,246,0.12)' },
          };
          return categoryMap[category] || categoryMap['scheduled'];
        };
        const catDisplay = getCategoryDisplay(maintenance.maintenance_category);
        const displayType = (maintenance.intervention_type === 'Autre' && maintenance.other_description) ? maintenance.other_description : maintenance.intervention_type;
        
        return (
        <div key={maintenance.id} className="card p-4">
          {editingId === maintenance.id ? (
            // Edit mode
            <div className="space-y-3">
              <h4 className="font-semibold mb-3">Modifier l'intervention</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Date*</label>
                  <input
                    type="date"
                    value={editForm.execution_date}
                    onChange={(e) => setEditForm({...editForm, execution_date: e.target.value})}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Kilométrage*</label>
                  <input
                    type="number"
                    value={editForm.mileage_at_intervention}
                    onChange={(e) => setEditForm({...editForm, mileage_at_intervention: e.target.value})}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Coût (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.cost_paid}
                    onChange={(e) => setEditForm({...editForm, cost_paid: e.target.value})}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Notes</label>
                  <input
                    type="text"
                    value={editForm.notes}
                    onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
              </div>

              <div className="border-t pt-3">
                <label className="block text-xs font-medium mb-2">Ajouter des factures</label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={handleInvoiceFileSelection}
                  className="w-full text-xs"
                />
                {newInvoiceFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {newInvoiceFiles.map((file, index) => (
                      <div key={index} className="flex justify-between items-center text-xs p-1.5 rounded" style={{ background: 'var(--bg-base)' }}>
                        <span>{file.name}</span>
                        <button
                          onClick={() => removeNewInvoice(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleEditCancel}
                  className="px-3 py-1 text-sm rounded"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleUpdate(maintenance.id)}
                  className="px-3 py-1 text-sm rounded"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  Enregistrer
                </button>
              </div>
            </div>
          ) : (
            // View mode
            <>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                <div className="md:col-span-2">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold" style={{ color: 'var(--text-1)' }}>{getInterventionDisplayName(displayType)}</h4>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: catDisplay.bgLight, color: catDisplay.bg }}>
                      {catDisplay.icon} {catDisplay.label}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                    {new Date(maintenance.execution_date).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>

                <div className="text-center">
                  <div className="card-label">Kilométrage</div>
                  <div className="stat-number" style={{ color: 'var(--text-1)', fontSize: '16px' }}>
                    {maintenance.mileage_at_intervention.toLocaleString()}
                  </div>
                </div>

                <div className="text-center">
                  <div className="card-label">Coût</div>
                  <div className="stat-number" style={{ color: 'var(--success)', fontSize: '16px' }}>
                    {maintenance.cost_paid ? `€${maintenance.cost_paid.toFixed(2)}` : '—'}
                  </div>
                </div>

                <div className="text-right flex flex-col items-end gap-1">
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                    {formatDistanceToNow(new Date(maintenance.execution_date), { addSuffix: true, locale: fr })}
                  </p>
                  <button
                    onClick={() => handleEdit(maintenance)}
                    className="text-xs font-semibold hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--accent)' }}
                  >
                    ✏️ Modifier
                  </button>
                  <button
                    onClick={() => handleDelete(maintenance.id)}
                    className="text-xs font-semibold hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--danger)' }}
                  >
                    🗑 Supprimer
                  </button>
                </div>
              </div>

              {maintenance.notes && (
                <div className="mt-3 pt-3 divider">
                  <p className="text-sm" style={{ color: 'var(--text-2)' }}>{maintenance.notes}</p>
                </div>
              )}

              {maintenance.invoices && maintenance.invoices.length > 0 && (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                    📎 Factures ({maintenance.invoices.length})
                  </div>
                  <ul className="space-y-1">
                    {maintenance.invoices.map((invoice) => (
                      <li key={invoice.id}>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            api.downloadFile(invoice.download_url, invoice.filename);
                          }}
                          className="text-xs inline-block hover:opacity-70 transition-opacity cursor-pointer bg-transparent border-none p-0"
                          style={{ color: 'var(--accent)' }}
                        >
                          📥 {invoice.filename}
                        </button>
                        <span className="text-xs ml-2" style={{ color: 'var(--text-3)' }}>
                          ({(invoice.file_size / 1024).toFixed(1)} KB)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      );
      })}
    </div>
  );
}
