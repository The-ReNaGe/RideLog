import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { getInterventionDisplayName } from '../lib/interventionTranslations';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import RevisionChecklistModal from './RevisionChecklistModal';
import Icon from './Icon';
import { useFormat, useT } from '../lib/preferencesContext';
import CategoryTag from './CategoryTag';
import {
  REVISION_TRIGGERS,
  SUBITEM_TRIGGERS,
  getRevisionItems,
  buildCheckedFromSubInterventions,
} from '../lib/revisionChecklist';

export default function MaintenanceHistory({ vehicleId, vehicleType, motorization, onDataChanged, canEdit = true }) {
  const fmt = useFormat();
  const t = useT();
  const [maintenances, setMaintenances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [newInvoiceFiles, setNewInvoiceFiles] = useState([]);
  const [editSubInterventions, setEditSubInterventions] = useState([]);
  const [showRevisionModal, setShowRevisionModal] = useState(false);

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
    if (!window.confirm(t('Supprimer cette intervention ?'))) return;
    try {
      await api.deleteMaintenance(vehicleId, maintenanceId);
      fetchMaintenances();
      onDataChanged?.();
    } catch {
      alert(t('Impossible de supprimer cette intervention'));
    }
  };

  const handleEdit = (maintenance) => {
    setEditingId(maintenance.id);
    setEditForm({
      execution_date: maintenance.execution_date.split('T')[0],
      // Affiché dans l'unité choisie, reconverti en km à l'enregistrement.
      mileage_at_intervention: fmt.distValue(maintenance.mileage_at_intervention),
      cost_paid: maintenance.cost_paid || '',
      notes: maintenance.notes || '',
    });
    setNewInvoiceFiles([]);
    setEditSubInterventions(maintenance.sub_interventions || []);
  };

  const handleUpdate = async (maintenanceId) => {
    try {
      const maintenance = maintenances.find(m => m.id === maintenanceId);
      if (!maintenance) return;

      const hasSubInterventions = editSubInterventions.length > 0;

      if (newInvoiceFiles.length > 0) {
        const fd = new FormData();
        fd.append('execution_date', editForm.execution_date);
        fd.append('mileage_at_intervention', String(fmt.toStorage(parseInt(editForm.mileage_at_intervention))));
        fd.append('cost_paid', editForm.cost_paid ? String(parseFloat(editForm.cost_paid)) : '');
        fd.append('notes', editForm.notes);
        newInvoiceFiles.forEach(f => fd.append('invoice_files', f));
        if (hasSubInterventions) {
          fd.append('sub_interventions', JSON.stringify(editSubInterventions));
        }
        await api.updateMaintenanceWithFiles(vehicleId, maintenanceId, fd);
      } else {
        const payload = {
          execution_date: editForm.execution_date,
          mileage_at_intervention: fmt.toStorage(parseInt(editForm.mileage_at_intervention)),
          cost_paid: editForm.cost_paid ? parseFloat(editForm.cost_paid) : null,
          notes: editForm.notes,
        };
        if (hasSubInterventions) {
          payload.sub_interventions = editSubInterventions;
        }
        await api.updateMaintenance(vehicleId, maintenanceId, payload);
      }
      setEditingId(null);
      setEditForm({});
      setNewInvoiceFiles([]);
      setEditSubInterventions([]);
      fetchMaintenances();
      onDataChanged?.();
    } catch {
      alert(t('Impossible de modifier cette intervention'));
    }
  };

  const editingMaintenance = maintenances.find(m => m.id === editingId);
  const editingNeedsRevisionModal = editingMaintenance && (
    REVISION_TRIGGERS.includes(editingMaintenance.intervention_type)
    || SUBITEM_TRIGGERS.includes(editingMaintenance.intervention_type)
  );

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="spinner mx-auto mb-3"></div>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>{t("Chargement de l'historique…")}</p>
      </div>
    );
  }

  if (maintenances.length === 0) {
    return (
      <div className="card text-center" style={{ padding: '40px 16px' }}>
        <div className="icon-box lg neutral mx-auto" style={{ marginBottom: 12 }}>
          <Icon name="note" size={20} />
        </div>
        <p style={{ color: 'var(--text-2)' }}>{t('Aucune intervention enregistrée pour le moment.')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {maintenances.map((maintenance) => {
        const displayType = (maintenance.intervention_type === 'Autre' && maintenance.other_description)
          ? maintenance.other_description
          : maintenance.intervention_type;

        return (
          <div key={maintenance.id} className="card p-4">
            {editingId === maintenance.id ? (
              /* ── Mode édition ── */
              <div className="space-y-3">
                <h4 className="mb-1">Modifier l'intervention</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Date*</label>
                    <input
                      type="date"
                      value={editForm.execution_date}
                      onChange={e => setEditForm({ ...editForm, execution_date: e.target.value })}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label className="field-label">{t('Distance')} ({fmt.distUnit})*</label>
                    <input
                      type="number"
                      value={editForm.mileage_at_intervention}
                      onChange={e => setEditForm({ ...editForm, mileage_at_intervention: e.target.value })}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label className="field-label">{t('Coût')} ({fmt.currencySymbol})</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.cost_paid}
                      onChange={e => setEditForm({ ...editForm, cost_paid: e.target.value })}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label className="field-label">Notes</label>
                    <input
                      type="text"
                      value={editForm.notes}
                      onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* Détail révision / freins / pneus via popup */}
                {editingNeedsRevisionModal && (
                  <div className="inset" style={{ padding: 12 }}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                          Détail de l'intervention
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                          {editSubInterventions.length > 0
                            ? `${editSubInterventions.length} élément(s) sélectionné(s)`
                            : t('Aucun élément sélectionné')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowRevisionModal(true)}
                        className="btn btn-secondary btn-sm"
                      >
                        <Icon name="clipboard" size={14} />
                        Modifier le détail
                      </button>
                    </div>
                    {editSubInterventions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {editSubInterventions.map((sub, idx) => (
                          <span
                            key={idx}
                            className="badge badge-neutral" style={{ fontWeight: 600 }}
                          >
                            {sub.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                  <label className="field-label">{t('Ajouter des factures')}</label>
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
                          <button
                            onClick={() => setNewInvoiceFiles(p => p.filter((_, j) => j !== i))}
                            className="btn-icon danger" style={{ marginLeft: 8, minHeight: 24, width: 24 }}
                            aria-label={`Retirer ${file.name}`}
                          >
                            <Icon name="close" size={13} strokeWidth={2.2} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 justify-end pt-1">
                  <button
                    onClick={() => { setEditingId(null); setEditForm({}); setNewInvoiceFiles([]); setEditSubInterventions([]); }}
                    className="btn btn-secondary btn-sm"
                  >
                    Annuler
                  </button>
                  <button onClick={() => handleUpdate(maintenance.id)} className="btn btn-primary btn-sm">
                    Enregistrer
                  </button>
                </div>
              </div>
            ) : (
              /* ── Mode lecture ── */
              <>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                        {getInterventionDisplayName(displayType)}
                      </h4>
                      <CategoryTag category={maintenance.maintenance_category} />
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
                      <span>
                        {fmt.date(maintenance.execution_date, {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </span>
                      <span>·</span>
                      <span>
                        {formatDistanceToNow(new Date(maintenance.execution_date), { addSuffix: true, locale: fr })}
                      </span>
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handleEdit(maintenance)} className="btn-icon" title={t('Modifier cette intervention')} aria-label={t('Modifier cette intervention')}>
                        <Icon name="pencil" size={15} />
                      </button>
                      <button onClick={() => handleDelete(maintenance.id)} className="btn-icon danger" title={t('Supprimer cette intervention')} aria-label={t('Supprimer cette intervention')}>
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>{t('Distance')} </span>
                    <span className="font-semibold" style={{ color: 'var(--text-1)' }}>
                      {fmt.dist(maintenance.mileage_at_intervention)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>{t('Coût')} </span>
                    <span className="font-semibold" style={{ color: 'var(--success)' }}>
                      {fmt.money(maintenance.cost_paid, maintenance.currency, 2)}
                    </span>
                  </div>
                </div>

                {maintenance.notes && (
                  <p className="text-xs mt-2 pt-2" style={{ color: 'var(--text-2)', borderTop: '1px solid var(--border)' }}>
                    {maintenance.notes}
                  </p>
                )}

                {maintenance.sub_interventions && maintenance.sub_interventions.length > 0 && (
                  <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="card-label flex items-center gap-1.5">
                      <Icon name="wrench" size={12} />
                      Interventions effectuées ({maintenance.sub_interventions.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {maintenance.sub_interventions.map((sub, idx) => (
                        <span
                          key={idx}
                          className="badge badge-neutral" style={{ fontWeight: 600 }}
                        >
                          {sub.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {maintenance.invoices?.length > 0 && (
                  <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="card-label flex items-center gap-1.5">
                      <Icon name="paperclip" size={12} />
                      Factures ({maintenance.invoices.length})
                    </div>
                    <div className="space-y-1">
                      {maintenance.invoices.map(invoice => (
                        <button
                          key={invoice.id}
                          onClick={e => { e.preventDefault(); api.downloadFile(invoice.download_url, invoice.filename); }}
                          className="text-xs hover:opacity-70 flex items-center gap-1.5"
                          style={{ color: 'var(--accent)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        >
                          <Icon name="download" size={13} />
                          {invoice.filename}
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

      {showRevisionModal && editingMaintenance && (
        <RevisionChecklistModal
          vehicleType={vehicleType}
          motorization={motorization}
          interventionType={editingMaintenance.intervention_type}
          initialChecked={buildCheckedFromSubInterventions(
            editSubInterventions,
            getRevisionItems(vehicleType)
          )}
          onClose={() => setShowRevisionModal(false)}
          onConfirm={(subInterventions) => {
            setEditSubInterventions(subInterventions);
            setShowRevisionModal(false);
          }}
        />
      )}
    </div>
  );
}