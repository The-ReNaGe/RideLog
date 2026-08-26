import React from 'react';
import VehiclePhoto from './VehiclePhoto';
import Icon from './Icon';

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

export default React.memo(function VehicleCard({ vehicle, onSelect, currentUser }) {
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

  const meta = [
    vehicle.year ? `${vehicle.year}${age > 0 ? ` · ${age} an${age > 1 ? 's' : ''}` : ''}` : null,
    motorLabels[vehicle.motorization] || vehicle.motorization,
    categoryLabels[vehicle.range_category] || vehicle.range_category,
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
      style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
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
            title="Exclu du partage avec votre groupe famille"
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
            {vehicle.current_mileage.toLocaleString('fr-FR')}
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)', marginLeft: 4 }}>km</span>
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
    </article>
  );
});
