import React, { useState, useCallback } from 'react';
import { api } from '../lib/api';

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

function getStatusLabel(status) {
  const labels = {
    overdue: '🔴 En retard',
    urgent: '🟠 Urgent',
    warning: '🟡 À surveiller',
    ok: '🟢 Bon',
  };
  return labels[status] || status;
}

function formatDueDate(value) {
  if (!value) return 'Sans échéance date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sans échéance date';
  return date.toLocaleDateString('fr-FR');
}

function getInterventionDisplayName(name) {
  return interventionTranslations[name] || name;
}

function formatDistance(km) {
  if (km === 999999 || km === Infinity) return '—';
  if (km < 0) return '⚠️ En retard';
  return `${km.toLocaleString('fr-FR')} km`;
}

function formatDays(days) {
  if (days === 999999 || days === Infinity) return 'Sans échéance date';
  if (days < 0) return '⚠️ En retard';
  if (days > 365) return `${Math.floor(days / 365)} an${Math.floor(days / 365) > 1 ? 's' : ''}`;
  if (days > 30) return `${Math.floor(days / 30)} mois`;
  return `${days} j`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modale d'édition d'intervalle (inline, portée par UpcomingMaintenance)
// ─────────────────────────────────────────────────────────────────────────────

function IntervalEditModal({ vehicleId, item, onClose, onSaved }) {
  const defaultKm = item.km_interval ?? '';
  const defaultMonths = item.months_interval ?? '';
  const defaultKmDisabled = item.km_interval === null && item.has_override;
  const defaultMonthsDisabled = item.months_interval === null && item.has_override;

  const [kmValue, setKmValue] = useState(defaultKm === '' ? '' : String(defaultKm));
  const [monthsValue, setMonthsValue] = useState(defaultMonths === '' ? '' : String(defaultMonths));
  const [kmDisabled, setKmDisabled] = useState(defaultKmDisabled);
  const [monthsDisabled, setMonthsDisabled] = useState(defaultMonthsDisabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const interventionKey = item.intervention_key;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.upsertIntervalOverride(vehicleId, interventionKey, {
        km_interval: kmDisabled ? null : (kmValue !== '' ? parseInt(kmValue, 10) : null),
        months_interval: monthsDisabled ? null : (monthsValue !== '' ? parseInt(monthsValue, 10) : null),
        is_km_disabled: kmDisabled,
        is_months_disabled: monthsDisabled,
      });
      onSaved();
    } catch (e) {
      setError('Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.deleteIntervalOverride(vehicleId, interventionKey);
      onSaved();
    } catch (e) {
      // Si pas d'override existant (404), on ferme quand même
      if (e.response?.status === 404) {
        onSaved();
      } else {
        setError('Erreur lors de la réinitialisation.');
        setSaving(false);
      }
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="card"
        style={{
          width: '100%', maxWidth: 420, padding: 0,
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.1rem 1.25rem 0.9rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem',
        }}>
          <div>
            <h4 style={{ color: 'var(--text-1)', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.15rem' }}>
              ✏️ Modifier l'intervalle
            </h4>
            <p style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>
              {item.intervention_type}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: '0.4rem', color: 'var(--text-3)',
              width: 28, height: 28, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: '0.85rem',
            }}
          >✕</button>
        </div>

        {/* Contenu */}
        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

          {/* Critère km */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-2)' }}>
                Intervalle kilométrique
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'var(--text-3)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={kmDisabled}
                  onChange={(e) => setKmDisabled(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Désactivé
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="number"
                min="100"
                max="500000"
                step="500"
                value={kmDisabled ? '' : kmValue}
                onChange={(e) => setKmValue(e.target.value)}
                disabled={kmDisabled}
                placeholder={kmDisabled ? 'Désactivé' : 'ex: 5000'}
                className="input-field"
                style={{
                  flex: 1, padding: '0.45rem 0.65rem', fontSize: '0.85rem',
                  opacity: kmDisabled ? 0.4 : 1,
                }}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-3)', flexShrink: 0 }}>km</span>
            </div>
          </div>

          {/* Critère mois */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-2)' }}>
                Intervalle temporel
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'var(--text-3)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={monthsDisabled}
                  onChange={(e) => setMonthsDisabled(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Désactivé
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="number"
                min="1"
                max="240"
                step="1"
                value={monthsDisabled ? '' : monthsValue}
                onChange={(e) => setMonthsValue(e.target.value)}
                disabled={monthsDisabled}
                placeholder={monthsDisabled ? 'Désactivé' : 'ex: 12'}
                className="input-field"
                style={{
                  flex: 1, padding: '0.45rem 0.65rem', fontSize: '0.85rem',
                  opacity: monthsDisabled ? 0.4 : 1,
                }}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-3)', flexShrink: 0 }}>mois</span>
            </div>
          </div>

          {/* Info */}
          <p style={{ fontSize: '0.73rem', color: 'var(--text-3)', lineHeight: 1.4 }}>
            ℹ️ Ces valeurs remplacent les intervalles par défaut uniquement pour ce véhicule. Elles sont conservées indéfiniment.
          </p>

          {error && (
            <p style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '0.8rem 1.25rem',
          borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
        }}>
          {/* Réinitialiser à gauche, seulement si un override existe */}
          {item.has_override ? (
            <button
              onClick={handleReset}
              disabled={saving}
              style={{
                fontSize: '0.78rem', color: 'var(--text-3)', background: 'none',
                border: 'none', cursor: 'pointer', padding: '0.35rem 0', textDecoration: 'underline',
                opacity: saving ? 0.5 : 1,
              }}
            >
              Réinitialiser par défaut
            </button>
          ) : (
            <span />
          )}

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              onClick={onClose}
              disabled={saving}
              className="btn btn-secondary"
              style={{ fontSize: '0.82rem' }}
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (kmDisabled && monthsDisabled)}
              className="btn btn-primary"
              style={{ fontSize: '0.82rem', minWidth: 100, opacity: (kmDisabled && monthsDisabled) ? 0.5 : 1 }}
              title={kmDisabled && monthsDisabled ? 'Au moins un critère doit rester actif' : ''}
            >
              {saving ? '⏳ Sauvegarde…' : '💾 Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export default React.memo(function UpcomingMaintenance({ data, vehicleId, onRefresh }) {
  const { upcoming } = data;
  const [editingItem, setEditingItem] = useState(null);

  const handleSaved = useCallback(() => {
    setEditingItem(null);
    onRefresh?.();
  }, [onRefresh]);

  if (!upcoming || upcoming.length === 0) {
    return (
      <div className="card p-12 text-center">
        <p style={{ color: 'var(--text-2)' }}>Aucune intervention prévue</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {upcoming.map((item, idx) => {
          const badgeClass =
            item.status === 'overdue' ? 'badge-danger' :
            item.status === 'urgent' ? 'badge-warning' :
            item.status === 'warning' ? 'badge-warning' :
            'badge-success';

          // Afficher le résumé de l'intervalle (avec indication override)
          const hasKm = item.km_interval !== null && item.km_interval !== undefined;
          const hasMonths = item.months_interval !== null && item.months_interval !== undefined;
          const intervalLabel = [
            hasKm ? `${item.km_interval.toLocaleString('fr-FR')} km` : null,
            hasMonths ? `${item.months_interval} mois` : null,
          ].filter(Boolean).join(' ou ');

          return (
            <div key={idx} className="card p-4">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <h4 className="font-semibold" style={{ color: 'var(--text-1)' }}>
                      {getInterventionDisplayName(item.intervention_type)}
                    </h4>
                    <span className={`badge ${badgeClass}`}>
                      {getStatusLabel(item.status)}
                    </span>
                    {item.has_override && (
                      <span
                        title="Intervalle personnalisé"
                        style={{
                          fontSize: '0.68rem', fontWeight: 600,
                          padding: '1px 6px', borderRadius: 10,
                          background: 'rgba(108,138,247,0.12)',
                          color: 'var(--accent)',
                        }}
                      >
                        ✏️ Personnalisé
                      </span>
                    )}
                  </div>

                  {(hasKm || hasMonths) && (
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      Tous les {intervalLabel}
                    </p>
                  )}
                  {!hasKm && !hasMonths && !item.condition_based && (
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      Aucun critère d'intervalle actif
                    </p>
                  )}

                  {item.never_recorded && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>
                      ℹ️ Jamais enregistré — échéance estimée depuis l'année du véhicule
                    </p>
                  )}
                </div>

                <div className="flex gap-3 items-start">
                  {/* Stats */}
                  <div className="flex gap-6 text-sm">
                    {!item.condition_based && (
                      <>
                        <div className="text-center">
                          <div className="card-label">Distance</div>
                          <div className="stat-number" style={{ color: 'var(--accent)', fontSize: '16px' }}>
                            {formatDistance(item.km_remaining)}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="card-label">Temps</div>
                          <div className="stat-number" style={{ color: 'var(--accent)', fontSize: '16px' }}>
                            {formatDays(item.days_remaining)}
                          </div>
                        </div>
                      </>
                    )}
                    <div className="text-center">
                      <div className="card-label">Coût est.</div>
                      <div className="stat-number" style={{ color: 'var(--success)', fontSize: '16px' }}>
                        {item.estimated_cost_min && item.estimated_cost_max ? `€${item.estimated_cost_min}` : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Bouton édition intervalle — masqué pour le contrôle technique */}
                  {item.intervention_key &&
                   !['inspection_technical_car', 'inspection_technical_moto'].includes(item.intervention_key) && (
                    <button
                      onClick={() => setEditingItem(item)}
                      title="Modifier l'intervalle"
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '0.4rem',
                        color: item.has_override ? 'var(--accent)' : 'var(--text-3)',
                        width: 30, height: 30, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', fontSize: '0.8rem',
                        marginTop: 2,
                      }}
                    >
                      ✏️
                    </button>
                  )}
                </div>
              </div>

              {!item.condition_based && (item.next_due_mileage || item.next_due_date) && (
                <div className="mt-2 pt-2 divider">
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                    Prochaine échéance :{' '}
                    {item.next_due_mileage ? `${item.next_due_mileage.toLocaleString('fr-FR')} km` : ''}
                    {item.next_due_mileage && item.next_due_date ? ' • ' : ' '}
                    {formatDueDate(item.next_due_date)}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modale d'édition */}
      {editingItem && vehicleId && (
        <IntervalEditModal
          vehicleId={vehicleId}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
});