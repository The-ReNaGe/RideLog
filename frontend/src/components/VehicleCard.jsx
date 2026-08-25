import React from 'react';
import VehiclePhoto from './VehiclePhoto';

const motorLabels = {
  essence: 'Essence',
  diesel: 'Diesel',
  hybrid: 'Hybride',
  electric: 'Électrique',
  thermal: 'Thermique',
};

const categoryLabels = {
  accessible: '♻️ Accessible',
  generalist: '🔧 Généraliste',
  premium: '👑 Premium',
};

export default React.memo(function VehicleCard({ vehicle, onSelect, onDelete, currentUser }) {
  const age = new Date().getFullYear() - vehicle.year;
  const icon = vehicle.vehicle_type === 'car' ? '🚗' : '🏍️';

  // Véhicule d'un autre membre du groupe famille : consultable, pas modifiable.
  // Repli sur « à moi » si l'information manque — c'est le backend qui décide,
  // cet indice ne sert qu'à ne pas afficher un bouton voué à échouer.
  const isMine =
    !vehicle.owner_id || !currentUser?.id || vehicle.owner_id === currentUser.id;

  return (
    <div className="card cursor-pointer transition-all" onClick={onSelect}>
      {vehicle.photo_url && (
        <div className="photo-container mb-4">
          <VehiclePhoto
            vehicleId={vehicle.id}
            version={vehicle.updated_at}
            alt={`${vehicle.brand} ${vehicle.model}`}
          />
        </div>
      )}
      
      <div className="flex items-start gap-3 mb-4">
        <div className="icon-box">{icon}</div>
        <div className="flex-1">
          <h3 className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>
            {vehicle.brand} {vehicle.model}
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>{vehicle.name}</p>
          {/* Le propriétaire n'est pas répété ici : les véhicules d'autrui sont
              déjà regroupés sous un titre « Garage de … » dans VehicleList. */}
          {isMine && vehicle.is_private && (
            <span
              className="inline-block px-2 py-0.5 rounded text-xs font-semibold mt-1"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-3)' }}
              title="Exclu du partage avec votre groupe famille"
            >
              🔒 Privé
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm mb-4">
        <div>
          <div className="card-label">Année</div>
          <p className="font-semibold" style={{ color: 'var(--text-1)' }}>
            {vehicle.year} {age > 0 && <span className="text-xs" style={{ color: 'var(--text-3)' }}>({age}a)</span>}
          </p>
        </div>
        <div>
          <div className="card-label">Moteur</div>
          <p className="font-semibold" style={{ color: 'var(--text-1)' }}>{motorLabels[vehicle.motorization] || vehicle.motorization}</p>
        </div>
        <div>
          <div className="card-label">Kilométrage</div>
          <p className="stat-number" style={{ color: 'var(--accent)', fontSize: '18px' }}>{vehicle.current_mileage.toLocaleString()}</p>
        </div>
        <div>
          <div className="card-label">Catégorie</div>
          <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{categoryLabels[vehicle.range_category] || vehicle.range_category}</p>
        </div>
      </div>

      <div className="flex gap-2 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <button className="btn btn-primary flex-1" style={{ fontSize: '13px' }}>
          Détails
        </button>
        {isMine && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="btn btn-danger px-3"
            style={{ fontSize: '13px' }}
          >
            🗑
          </button>
        )}
      </div>
    </div>
  );
});
