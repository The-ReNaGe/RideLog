import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

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

function getInterventionDisplayName(name) {
  return interventionTranslations[name] || name;
}

const getCategoryDisplay = (category) => {
  const map = {
    scheduled:    { icon: '🔧', label: 'Entretien',    bg: 'var(--accent)',  bgLight: 'rgba(108,138,247,0.12)' },
    repair:       { icon: '⚠️', label: 'Réparation',   bg: 'var(--warning)', bgLight: 'rgba(243,156,18,0.12)' },
    modification: { icon: '🔨', label: 'Modification',  bg: '#8b5cf6',        bgLight: 'rgba(139,92,246,0.12)' },
  };
  return map[category] || map.scheduled;
};

export default function MaintenanceHistory({ vehicleId, onDataChanged }) {
  const [maintenances, setMaintenances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [newInvoiceFiles, setNewInvoiceFiles] = useState([]);

  useEffect(() => { fetchMaintenances(); }, [vehicleId]);

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
      onDataChanged?.();
    } catch {
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
      if (newInvoiceFiles.length > 0) {
        const fd = new FormData();
        fd.append('execution_date', editForm.execution_date);
        fd.append('mileage_at_intervention', String(parseInt(editForm.mileage_at_intervention)));
        fd.append('cost_paid', editForm.cost_paid ? String(parseFloat(editForm.cost_paid)) : '');
        fd.append('notes', editForm.notes);
        newInvoiceFiles.forEach(f => fd.append('invoice_files', f));
        await api.updateMaintenanceWithFiles(vehicleId, maintenanceId, fd);
      } else {
        await api.updateMaintenance(vehicleId, maintenanceId, {
          execution_date: editForm.execution_date,
          mileage_at_intervention: parseInt(editForm.mileage_at_intervention),
          cost_paid: editForm.cost_paid ? parseFloat(editForm.cost_paid) : null,
          notes: editForm.notes,
        });
      }
      setEditingId(null);
      setNewInvoiceFiles([]);
      fetchMaintenances();
      onDataChanged?.();
    } catch {
      alert('Impossible de modifier cette intervention');
    }
  };

  if (loading) return <div className="text-center py-12" style={{ color: 'var(--text-2)' }}>Chargement...</div>;

  if (maintenances.length === 0) {
    return <div className="card p-12 text-center"><p style={{ color: 'var(--text-2)' }}>Aucun enregistrement</p></div>;
  }

  return (
    <div className="space-y-3">
      {maintenances.map((maintenance) => {
        const catDisplay = getCategoryDisplay(maintenance.maintenance_category);
        const displayType = (maintenance.intervention_type === 'Autre' && maintenance.other_description)
          ? maintenance.other_description
          : maintenance.intervention_type;

        return (
          <div key={maintenance.id} className="card p-4">
            {editingId === maintenance.id ? (
              /* ── Mode édition ── */
              <div className="space-y-3">
                <h4 className="font-semibold mb-2" style={{ color: 'var(--text-1)' }}>Modifier l'intervention</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Date*</label>
                    <input
                      type="date"
                      value={editForm.execution_date}
                      onChange={e => setEditForm({ ...editForm, execution_date: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm rounded input-field"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Kilométrage*</label>
                    <input
                      type="number"
                      value={editForm.mileage_at_intervention}
                      onChange={e => setEditForm({ ...editForm, mileage_at_intervention: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm rounded input-field"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Coût (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.cost_paid}
                      onChange={e => setEditForm({ ...editForm, cost_paid: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm rounded input-field"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Notes</label>
                    <input
                      type="text"
                      value={editForm.notes}
                      onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm rounded input-field"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                  <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-2)' }}>Ajouter des factures</label>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => setNewInvoiceFiles(prev => [...prev, ...Array.from(e.target.files || [])])}
                    style={{ width: '100%', fontSize: '0.75rem', boxSizing: 'border-box' }}
                  />
                  {newInvoiceFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {newInvoiceFiles.map((file, i) => (
                        <div key={i} className="flex justify-between items-center text-xs p-1.5 rounded" style={{ background: 'var(--bg-base)' }}>
                          <span className="truncate">{file.name}</span>
                          <button onClick={() => setNewInvoiceFiles(p => p.filter((_, j) => j !== i))} style={{ color: 'var(--danger)', marginLeft: '8px', flexShrink: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 justify-end pt-1">
                  <button
                    onClick={() => { setEditingId(null); setEditForm({}); setNewInvoiceFiles([]); }}
                    className="px-3 py-1.5 text-sm rounded"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => handleUpdate(maintenance.id)}
                    className="px-3 py-1.5 text-sm rounded"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            ) : (
              /* ── Mode lecture ── */
              <>
                {/* Ligne principale */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                        {getInterventionDisplayName(displayType)}
                      </h4>
                      <span style={{
                        display: 'inline-block', padding: '1px 7px', borderRadius: 4,
                        fontSize: 11, fontWeight: 600, flexShrink: 0,
                        background: catDisplay.bgLight, color: catDisplay.bg,
                      }}>
                        {catDisplay.icon} {catDisplay.label}
                      </span>
                    </div>
                    {/* Date + il y a — sur la même ligne, bien alignés */}
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
                      <span>
                        {new Date(maintenance.execution_date).toLocaleDateString('fr-FR', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </span>
                      <span>·</span>
                      <span>
                        {formatDistanceToNow(new Date(maintenance.execution_date), { addSuffix: true, locale: fr })}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <button onClick={() => handleEdit(maintenance)} className="text-xs font-semibold hover:opacity-70" style={{ color: 'var(--accent)' }}>
                      ✏️ Modifier
                    </button>
                    <button onClick={() => handleDelete(maintenance.id)} className="text-xs font-semibold hover:opacity-70" style={{ color: 'var(--danger)' }}>
                      🗑 Supprimer
                    </button>
                  </div>
                </div>

                {/* Stats kilométrage + coût */}
                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>Kilométrage </span>
                    <span className="font-semibold" style={{ color: 'var(--text-1)' }}>
                      {maintenance.mileage_at_intervention.toLocaleString('fr-FR')} km
                    </span>
                  </div>
                  <div>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>Coût </span>
                    <span className="font-semibold" style={{ color: 'var(--success)' }}>
                      {maintenance.cost_paid ? `${maintenance.cost_paid.toFixed(2)} €` : '—'}
                    </span>
                  </div>
                </div>

                {/* Notes */}
                {maintenance.notes && (
                  <p className="text-xs mt-2 pt-2" style={{ color: 'var(--text-2)', borderTop: '1px solid var(--border)' }}>
                    {maintenance.notes}
                  </p>
                )}

                {/* Factures */}
                {maintenance.invoices?.length > 0 && (
                  <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-2)' }}>
                      📎 Factures ({maintenance.invoices.length})
                    </div>
                    <div className="space-y-1">
                      {maintenance.invoices.map(invoice => (
                        <button
                          key={invoice.id}
                          onClick={e => { e.preventDefault(); api.downloadFile(invoice.download_url, invoice.filename); }}
                          className="text-xs hover:opacity-70 block"
                          style={{ color: 'var(--accent)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        >
                          📥 {invoice.filename}
                          <span className="ml-1" style={{ color: 'var(--text-3)' }}>({(invoice.file_size / 1024).toFixed(1)} KB)</span>
                        </button>
                      ))}
                    </div>
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