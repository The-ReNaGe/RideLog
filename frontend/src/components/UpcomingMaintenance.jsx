import React from 'react';

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

function getStatusBadge(status) {
  const badges = {
    overdue: 'badge-danger',
    urgent: 'badge-warning',
    warning: 'badge-warning',
    ok: 'badge-success',
  };
  return badges[status] || 'badge-info';
}

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

function getInterventionDisplayName(englishName) {
  return interventionTranslations[englishName] || englishName;
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

export default React.memo(function UpcomingMaintenance({ data }) {
  const { upcoming } = data;

  if (!upcoming || upcoming.length === 0) {
    return (
      <div className="card p-12 text-center">
        <p style={{ color: 'var(--text-2)' }}>Aucune intervention prévue</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {upcoming.map((item, idx) => {
        const badgeClass =
          item.status === 'overdue' ? 'badge-danger' :
          item.status === 'urgent' ? 'badge-warning' :
          item.status === 'warning' ? 'badge-warning' :
          'badge-success';

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
                </div>
                {(item.km_interval || item.months_interval) && (
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                    {item.km_interval && `Tous les ${item.km_interval.toLocaleString()} km`}
                    {item.km_interval && item.months_interval && ' ou '}
                    {item.months_interval && `tous les ${item.months_interval} mois`}
                  </p>
                )}
                {item.never_recorded && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>
                    ℹ️ Jamais enregistré — échéance estimée depuis l'année du véhicule
                  </p>
                )}
              </div>

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
            </div>

            {!item.condition_based && (item.next_due_mileage || item.next_due_date) && (
              <div className="mt-2 pt-2 divider">
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  Prochaine échéance : {item.next_due_mileage ? `${item.next_due_mileage.toLocaleString()} km` : ''}{item.next_due_mileage && item.next_due_date ? ' • ' : ' '}{formatDueDate(item.next_due_date)}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
