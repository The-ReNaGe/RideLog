import React, { useState, useCallback } from 'react';
import { api } from '../lib/api';
import { getInterventionDisplayName } from '../lib/interventionTranslations';
import Icon from './Icon';

const STATUS = {
  overdue: { label: 'En retard',    badge: 'badge-danger',  color: 'var(--danger)' },
  urgent:  { label: 'Urgent',       badge: 'badge-warning', color: 'var(--warning)' },
  warning: { label: 'À surveiller', badge: 'badge-warning', color: 'var(--warning)' },
  ok:      { label: 'À jour',       badge: 'badge-success', color: 'var(--success)' },
};

const statusOf = (s) => STATUS[s] || STATUS.ok;

/** Pastille d'état : la couleur porte l'information, le mot la confirme. */
function StatusBadge({ status }) {
  const st = statusOf(status);
  return (
    <span className={`badge ${st.badge}`}>
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor', display: 'inline-block' }}
      />
      {st.label}
    </span>
  );
}

const OVERDUE = Symbol('overdue');

function formatDueDate(value) {
  if (!value) return 'sans échéance';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'sans échéance';
  return date.toLocaleDateString('fr-FR');
}

function formatDistance(km) {
  if (km === 999999 || km === Infinity) return '—';
  if (km < 0) return OVERDUE;
  return `${km.toLocaleString('fr-FR')} km`;
}

function formatDays(days) {
  if (days === 999999 || days === Infinity) return '—';
  if (days < 0) return OVERDUE;
  if (days > 365) return `${Math.floor(days / 365)} an${Math.floor(days / 365) > 1 ? 's' : ''}`;
  if (days > 30) return `${Math.floor(days / 30)} mois`;
  return `${days} j`;
}

/** Une colonne de l'encart de chiffres. */
function Stat({ label, value, color }) {
  const overdue = value === OVERDUE;
  return (
    <div style={{ padding: '0 10px', textAlign: 'center', width: 104 }}>
      <div className="card-label" style={{ marginBottom: 2 }}>{label}</div>
      <div
        className="tabular"
        style={{ fontSize: 15, fontWeight: 700, color: overdue ? 'var(--danger)' : (color || 'var(--text-1)') }}
      >
        {overdue ? 'En retard' : value}
      </div>
    </div>
  );
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

  const criterion = (label, unit, value, setValue, disabled, setDisabled, inputProps) => (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <label className="field-label" style={{ marginBottom: 0 }}>{label}</label>
        <label className="flex items-center gap-1.5 cursor-pointer" style={{ fontSize: 12, color: 'var(--text-3)' }}>
          <input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} />
          Désactivé
        </label>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          {...inputProps}
          value={disabled ? '' : value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          placeholder={disabled ? 'Désactivé' : inputProps.placeholder}
          style={{ flex: 1, opacity: disabled ? 0.45 : 1 }}
        />
        <span style={{ fontSize: 13, color: 'var(--text-3)', flexShrink: 0 }}>{unit}</span>
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(12,15,22,0.55)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: 0, boxShadow: 'var(--shadow-lg)' }}>
        <div className="panel-header" style={{ alignItems: 'flex-start' }}>
          <div className="flex-1 min-w-0">
            <h4 style={{ fontSize: '0.98rem' }}>Modifier l'intervalle</h4>
            <p className="text-ellipsis" style={{ color: 'var(--text-3)', fontSize: 12.5 }}>
              {getInterventionDisplayName(item.intervention_type)}
            </p>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Fermer">
            <Icon name="close" size={16} strokeWidth={2.2} />
          </button>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {criterion('Intervalle kilométrique', 'km', kmValue, setKmValue, kmDisabled, setKmDisabled,
            { min: '100', max: '500000', step: '500', placeholder: 'ex : 5000' })}
          {criterion('Intervalle temporel', 'mois', monthsValue, setMonthsValue, monthsDisabled, setMonthsDisabled,
            { min: '1', max: '240', step: '1', placeholder: 'ex : 12' })}

          <p className="flex items-start gap-2" style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>
            <Icon name="info" size={14} style={{ marginTop: 1 }} />
            <span>Ces valeurs remplacent les intervalles par défaut pour ce véhicule uniquement. Elles sont conservées indéfiniment.</span>
          </p>

          {error && (
            <p className="flex items-center gap-2" style={{ fontSize: 13, color: 'var(--danger)' }}>
              <Icon name="alertCircle" size={14} />{error}
            </p>
          )}
        </div>

        <div className="panel-footer flex items-center justify-between gap-2">
          {/* Réinitialiser à gauche, seulement si un override existe */}
          {item.has_override ? (
            <button onClick={handleReset} disabled={saving} className="btn btn-ghost btn-sm">
              <Icon name="refresh" size={14} />
              Valeurs par défaut
            </button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving} className="btn btn-secondary btn-sm">
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (kmDisabled && monthsDisabled)}
              className="btn btn-primary btn-sm"
              title={kmDisabled && monthsDisabled ? 'Au moins un critère doit rester actif' : ''}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
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

export default React.memo(function UpcomingMaintenance({ data, vehicleId, onRefresh, canEdit = true }) {
  const { upcoming } = data;
  const [editingItem, setEditingItem] = useState(null);

  const handleSaved = useCallback(() => {
    setEditingItem(null);
    onRefresh?.();
  }, [onRefresh]);

  if (!upcoming || upcoming.length === 0) {
    return (
      <div className="card text-center" style={{ padding: '40px 16px' }}>
        <div className="icon-box lg success mx-auto" style={{ marginBottom: 12 }}>
          <Icon name="checkCircle" size={20} />
        </div>
        <p style={{ color: 'var(--text-2)' }}>Aucune intervention prévue.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {upcoming.map((item, idx) => {
          const st = statusOf(item.status);

          const hasKm = item.km_interval !== null && item.km_interval !== undefined;
          const hasMonths = item.months_interval !== null && item.months_interval !== undefined;
          const intervalLabel = [
            hasKm ? `${item.km_interval.toLocaleString('fr-FR')} km` : null,
            hasMonths ? `${item.months_interval} mois` : null,
          ].filter(Boolean).join(' ou ');

          const costMin = item.estimated_cost_min;
          const costMax = item.estimated_cost_max;
          const costLabel = costMin && costMax
            ? (costMin === costMax ? `${costMin} €` : `${costMin} – ${costMax} €`)
            : '—';

          const editable =
            canEdit && item.intervention_key &&
            !['inspection_technical_car', 'inspection_technical_moto'].includes(item.intervention_key);

          return (
            <article
              key={idx}
              className="card"
              style={{ padding: 0, overflow: 'hidden', borderLeft: `3px solid ${st.color}` }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4" style={{ padding: '14px 16px' }}>
                <div className="min-w-0" style={{ flex: '1 1 300px' }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 style={{ color: 'var(--text-1)' }}>
                      {getInterventionDisplayName(item.intervention_type)}
                    </h4>
                    <StatusBadge status={item.status} />
                    {item.has_override && (
                      <span className="badge badge-info" title="Intervalle personnalisé pour ce véhicule">
                        <Icon name="pencil" size={11} strokeWidth={2.2} />
                        Personnalisé
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 3 }}>
                    {hasKm || hasMonths
                      ? `Tous les ${intervalLabel}`
                      : (item.condition_based ? 'Selon l’usage' : 'Aucun critère d’intervalle actif')}
                  </p>

                  {item.never_recorded && (
                    <p className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 3 }}>
                      <Icon name="info" size={13} />
                      Jamais enregistré — échéance estimée depuis l'année du véhicule
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="inset flex items-center self-start" style={{ padding: '8px 0' }}>
                    {!item.condition_based && (
                      <>
                        <Stat label="Distance" value={formatDistance(item.km_remaining)} />
                        <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
                        <Stat label="Temps" value={formatDays(item.days_remaining)} />
                        <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
                      </>
                    )}
                    <Stat label="Coût est." value={costLabel} color="var(--success)" />
                  </div>

                  {/* Bouton édition intervalle — masqué pour le contrôle
                      technique, et sur un véhicule partagé qu'on ne possède pas */}
                  {editable && (
                    <button
                      onClick={() => setEditingItem(item)}
                      className="btn-icon"
                      title="Modifier l'intervalle"
                      aria-label={`Modifier l'intervalle de ${getInterventionDisplayName(item.intervention_type)}`}
                      style={{ color: item.has_override ? 'var(--accent)' : undefined }}
                    >
                      <Icon name="pencil" size={16} />
                    </button>
                  )}
                </div>
              </div>

              {!item.condition_based && (item.next_due_mileage || item.next_due_date) && (
                <div style={{ padding: '8px 16px', background: 'var(--bg-inset)', borderTop: '1px solid var(--border-light)' }}>
                  <p className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                    <Icon name="calendar" size={13} />
                    Prochaine échéance :{' '}
                    {item.next_due_mileage ? `${item.next_due_mileage.toLocaleString('fr-FR')} km` : ''}
                    {item.next_due_mileage && item.next_due_date ? ' · ' : ' '}
                    {formatDueDate(item.next_due_date)}
                  </p>
                </div>
              )}
            </article>
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
