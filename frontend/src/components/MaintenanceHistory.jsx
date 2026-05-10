import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { getInterventionDisplayName } from '../lib/interventionTranslations';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

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

const getCategoryDisplay = (category) => {
  const map = {
    scheduled:    { icon: '🔧', label: 'Entretien',    bg: 'var(--accent)',  bgLight: 'rgba(108,138,247,0.12)' },
    repair:       { icon: '⚠️', label: 'Réparation',   bg: 'var(--warning)', bgLight: 'rgba(243,156,18,0.12)' },
    modification: { icon: '🔨', label: 'Modification',  bg: '#8b5cf6',        bgLight: 'rgba(139,92,246,0.12)' },
  };
  return map[category] || map.scheduled;
};

export default function MaintenanceHistory({ vehicleId, vehicleType, motorization, onDataChanged }) {
  const [maintenances, setMaintenances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [newInvoiceFiles, setNewInvoiceFiles] = useState([]);
  const [subItemsChecked, setSubItemsChecked] = useState({});
  const [revisionSubItemsChecked, setRevisionSubItemsChecked] = useState({});

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

    // Initialiser les sous-items cochés à partir des sous-interventions existantes
    const subInterventions = maintenance.sub_interventions || [];
    const newSubItemsChecked = {};
    const newRevisionSubItemsChecked = {};

    // D'abord, cocher tous les sous-items trouvés dans l'historique
    subInterventions.forEach(sub => {
      const key = sub.key || sub.name;
      newSubItemsChecked[key] = true;
      newRevisionSubItemsChecked[key] = true;
    });

    // Ensuite, pour les révisions, cocher automatiquement les items parents
    // si au moins un de leurs sous-items est coché
    const revisionItems = vehicleType === 'motorcycle' ? REVISION_ITEMS_MOTO : REVISION_ITEMS_CAR;

    revisionItems.forEach(item => {
      if (item.hasSubItems && item.subItems) {
        // Vérifier si au moins un des sous-items est coché
        const hasCheckedSubItem = item.subItems.some(sub => newRevisionSubItemsChecked[sub.key]);
        if (hasCheckedSubItem) {
          newRevisionSubItemsChecked[item.key] = true;
        }
      }
    });

    setSubItemsChecked(newSubItemsChecked);
    setRevisionSubItemsChecked(newRevisionSubItemsChecked);
  };

  const handleUpdate = async (maintenanceId) => {
    try {
      const maintenance = maintenances.find(m => m.id === maintenanceId);
      if (!maintenance) return;

      const isSubItemTrigger = SUBITEM_TRIGGERS.includes(maintenance.intervention_type);
      const isRevisionTrigger = REVISION_TRIGGERS.includes(maintenance.intervention_type);

      if (newInvoiceFiles.length > 0) {
        const fd = new FormData();
        fd.append('execution_date', editForm.execution_date);
        fd.append('mileage_at_intervention', String(parseInt(editForm.mileage_at_intervention)));
        fd.append('cost_paid', editForm.cost_paid ? String(parseFloat(editForm.cost_paid)) : '');
        fd.append('notes', editForm.notes);
        newInvoiceFiles.forEach(f => fd.append('invoice_files', f));

        // Ajouter les sous-interventions
        if (isSubItemTrigger) {
          const subItems = maintenance.intervention_type === 'Remplacement freins' ? BRAKE_SUBITEMS : TIRE_SUBITEMS;
          const selectedSubItems = subItems.filter(item => subItemsChecked[item.key]);
          if (selectedSubItems.length > 0) {
            fd.append('sub_interventions', JSON.stringify(selectedSubItems));
          }
        } else if (isRevisionTrigger) {
          const revisionItems = vehicleType === 'motorcycle' ? REVISION_ITEMS_MOTO : REVISION_ITEMS_CAR;
          const selectedRevisionItems = [];

          revisionItems.forEach(item => {
            // Filtrer selon la motorisation pour les voitures
            if (vehicleType === 'car' && item.motorization) {
              if (item.motorization === 'diesel' && motorization !== 'diesel') return;
              if (item.motorization === 'essence' && !['essence', 'hybride'].includes(motorization)) return;
            }

            if (revisionSubItemsChecked[item.key]) {
              if (item.hasSubItems && item.subItems) {
                const selectedSubItems = item.subItems.filter(sub => revisionSubItemsChecked[sub.key]);
                if (selectedSubItems.length > 0) {
                  selectedRevisionItems.push(...selectedSubItems);
                }
              } else {
                selectedRevisionItems.push({ key: item.key, name: item.name });
              }
            }
          });

          if (selectedRevisionItems.length > 0) {
            fd.append('sub_interventions', JSON.stringify(selectedRevisionItems));
          }
        }

        await api.updateMaintenanceWithFiles(vehicleId, maintenanceId, fd);
      } else {
        const payload = {
          execution_date: editForm.execution_date,
          mileage_at_intervention: parseInt(editForm.mileage_at_intervention),
          cost_paid: editForm.cost_paid ? parseFloat(editForm.cost_paid) : null,
          notes: editForm.notes,
        };

        // Ajouter les sous-interventions
        if (isSubItemTrigger) {
          const subItems = maintenance.intervention_type === 'Remplacement freins' ? BRAKE_SUBITEMS : TIRE_SUBITEMS;
          const selectedSubItems = subItems.filter(item => subItemsChecked[item.key]);
          if (selectedSubItems.length > 0) {
            payload.sub_interventions = selectedSubItems;
          }
        } else if (isRevisionTrigger) {
          const revisionItems = vehicleType === 'motorcycle' ? REVISION_ITEMS_MOTO : REVISION_ITEMS_CAR;
          const selectedRevisionItems = [];

          revisionItems.forEach(item => {
            // Filtrer selon la motorisation pour les voitures
            if (vehicleType === 'car' && item.motorization) {
              if (item.motorization === 'diesel' && motorization !== 'diesel') return;
              if (item.motorization === 'essence' && !['essence', 'hybride'].includes(motorization)) return;
            }

            if (revisionSubItemsChecked[item.key]) {
              if (item.hasSubItems && item.subItems) {
                const selectedSubItems = item.subItems.filter(sub => revisionSubItemsChecked[sub.key]);
                if (selectedSubItems.length > 0) {
                  selectedRevisionItems.push(...selectedSubItems);
                }
              } else {
                selectedRevisionItems.push({ key: item.key, name: item.name });
              }
            }
          });

          if (selectedRevisionItems.length > 0) {
            payload.sub_interventions = selectedRevisionItems;
          }
        }

        await api.updateMaintenance(vehicleId, maintenanceId, payload);
      }
      setEditingId(null);
      setEditForm({});
      setNewInvoiceFiles([]);
      setSubItemsChecked({});
      setRevisionSubItemsChecked({});
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

                {/* Sous-cases à cocher pour freins/pneus */}
                {SUBITEM_TRIGGERS.includes(maintenance.intervention_type) && (
                  <div className="card p-3" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                    <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-1)' }}>
                      Détails de l'intervention :
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {(maintenance.intervention_type === 'Remplacement freins' ? BRAKE_SUBITEMS : TIRE_SUBITEMS).map((item) => (
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
                {REVISION_TRIGGERS.includes(maintenance.intervention_type) && (
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
                    onClick={() => { setEditingId(null); setEditForm({}); setNewInvoiceFiles([]); setSubItemsChecked({}); setRevisionSubItemsChecked({}); }}
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

                {/* Sous-interventions (checklist révision) */}
                {maintenance.sub_interventions && maintenance.sub_interventions.length > 0 && (
                  <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-2)' }}>
                      🔧 Interventions effectuées ({maintenance.sub_interventions.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {maintenance.sub_interventions.map((sub, idx) => (
                        <span
                          key={idx}
                          className="text-xs px-2 py-1 rounded"
                          style={{
                            background: 'var(--bg-base)',
                            color: 'var(--text-2)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {sub.name}
                        </span>
                      ))}
                    </div>
                  </div>
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