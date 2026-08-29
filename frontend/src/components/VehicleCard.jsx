import React from 'react';
import VehiclePhoto from './VehiclePhoto';
import Icon from './Icon';
import { useFormat, useT } from '../lib/preferencesContext';

// Libellés traduits au rendu via t() — déclarés pour l'audit.
// i18n: 'Essence', 'Diesel', 'Hybride', 'Électrique', 'Thermique', 'Accessible', 'Généraliste', 'Premium'
const motorLabels = {
  essence: 'Essence',
  diesel: 'Diesel',
  hybride: 'Hybride',
  hybrid: 'Hybride',
  electrique: 'Électrique',
  electric: 'Électrique',
  thermal: 'Thermique',
  thermique: 'Thermique',
};

const categoryLabels = {
  accessible: 'Accessible',
  generalist: 'Généraliste',
  premium: 'Premium',
};

/**
 * Niveaux d'alerte, du plus grave au plus discret.
 *
 * La rampe est volontairement à trois crans et non à trois couleurs : le
 * retard remplit son bandeau et teinte la bordure de la carte, l'urgence
 * remplit son bandeau seul, la surveillance ne colore que le texte. Trois
 * teintes à égalité auraient donné la rangée d'arc-en-ciel qu'on a déjà
 * écartée ailleurs (§23.2) — ici c'est l'intensité qui hiérarchise.
 */
const ALERT_LEVELS = {
  overdue: {
    color: 'var(--danger)',
    fill: 'var(--danger-light)',
    outline: true,
    icon: 'alert',
    label: (n, t) => t('{count} entretien(s) en retard', { count: n }),
  },
  urgent: {
    color: 'var(--warning)',
    fill: 'var(--warning-light)',
    outline: false,
    icon: 'alertCircle',
    label: (n, t) => t('{count} entretien(s) urgent(s)', { count: n }),
  },
  warning: {
    color: 'var(--warning)',
    fill: 'transparent',
    outline: false,
    icon: 'clock',
    label: (n, t) => t('{count} entretien(s) à surveiller', { count: n }),
  },
  ok: {
    color: 'var(--text-3)',
    fill: 'transparent',
    outline: false,
    icon: 'check',
    label: (_n, t) => t('À jour'),
  },
};

export default React.memo(function VehicleCard({ vehicle, onSelect, currentUser }) {
  const fmt = useFormat();
  const t = useT();
  const age = new Date().getFullYear() - vehicle.year;
  const typeIcon = vehicle.vehicle_type === 'car' ? 'car' : 'motorcycle';

  // Véhicule d'un autre membre du groupe famille : consultable, pas modifiable.
  // Repli sur « à moi » si l'information manque — c'est le backend qui décide,
  // cet indice ne sert qu'à ne pas afficher un bouton voué à échouer.
  const isMine =
    !vehicle.owner_id || !currentUser?.id || vehicle.owner_id === currentUser.id;

  // « Mercedes Classe C » affiché deux fois de suite ne dit rien la seconde.
  const fullName = `${vehicle.brand} ${vehicle.model}`.trim();
  const showSurname = vehicle.name && vehicle.name.trim() !== fullName;

  // Un véhicule dont l'API n'a pas renvoyé d'état ne doit rien affirmer :
  // un bandeau « À jour » posé par défaut serait un mensonge.
  const level = ALERT_LEVELS[vehicle.alert_level] || null;
  const alertCount =
    vehicle.alert_level === 'overdue' ? vehicle.overdue_count
    : vehicle.alert_level === 'urgent' ? vehicle.urgent_count
    : vehicle.alert_level === 'warning' ? vehicle.warning_count
    : 0;

  const meta = [
    vehicle.year ? `${vehicle.year}${age > 0 ? ` · ${age} an${age > 1 ? 's' : ''}` : ''}` : null,
    t(motorLabels[vehicle.motorization] || vehicle.motorization),
    t(categoryLabels[vehicle.range_category] || vehicle.range_category),
  ].filter(Boolean);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <article
      className="card card-interactive"
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      style={{
        padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        ...(level?.outline ? { borderColor: level.color } : null),
      }}
    >
      {/* Bandeau visuel — toujours présent, y compris sans photo, pour que
          toutes les cartes d'une grille aient la même hauteur. */}
      <div className="photo-container photo-band" style={{ position: 'relative' }}>
        {/* La silhouette reste en fond : VehiclePhoto ne rend rien tant que le
            binaire n'est pas chargé, et rien non plus s'il échoue. Sans elle,
            le bandeau serait vide dans les deux cas. */}
        <Icon
          name={typeIcon}
          size={68}
          strokeWidth={1.1}
          style={{ color: 'var(--border-strong)', position: 'absolute' }}
        />
        {vehicle.photo_url && (
          <VehiclePhoto
            vehicleId={vehicle.id}
            version={vehicle.updated_at}
            alt={`${vehicle.brand} ${vehicle.model}`}
            backdrop
          />
        )}

        {isMine && vehicle.is_private && (
          <span
            className="badge"
            title={t('Exclu du partage avec votre groupe famille')}
            style={{
              position: 'absolute', top: 10, right: 10,
              background: 'var(--bg-surface)', color: 'var(--text-2)',
              borderColor: 'var(--border)', boxShadow: 'var(--shadow-xs)',
            }}
          >
            <Icon name="lock" size={12} strokeWidth={2} />
            Privé
          </span>
        )}
      </div>

      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div className="flex items-start gap-3">
          <div className="icon-box sm" aria-hidden="true">
            <Icon name={typeIcon} size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-ellipsis" style={{ fontSize: '1rem', color: 'var(--text-1)' }}>
              {fullName}
            </h3>
            {showSurname && (
              <p className="text-ellipsis" style={{ fontSize: 13, color: 'var(--text-3)' }}>
                {vehicle.name}
              </p>
            )}
          </div>
          {/* Pas de suppression ici : sur une carte entièrement cliquable,
              une corbeille au coin se déclenche par erreur. L'action vit dans
              la fiche du véhicule, derrière « Modifier ». */}
          <Icon name="chevronRight" size={16} style={{ color: 'var(--text-3)', marginTop: 6 }} />
        </div>

        <div style={{ marginTop: 'auto' }}>
          <div className="tabular" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>
            {fmt.dist(vehicle.current_mileage, { withUnit: false })}
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)', marginLeft: 4 }}>{fmt.distUnit}</span>
          </div>
          <div className="flex items-center flex-wrap" style={{ gap: 6, marginTop: 4 }}>
            {meta.map((m, i) => (
              <React.Fragment key={m}>
                {i > 0 && <span className="chip-sep" aria-hidden="true">·</span>}
                <span className="chip">{m}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {level && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 16px',
            borderTop: '1px solid var(--border)',
            background: level.fill,
            color: level.color,
            fontSize: 13, fontWeight: 600,
          }}
        >
          <Icon name={level.icon} size={14} strokeWidth={2} />
          {level.label(alertCount, t)}
        </div>
      )}
    </article>
  );
});
