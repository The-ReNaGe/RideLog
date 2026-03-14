import React from 'react';

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

export default React.memo(function VehicleCard({ vehicle, onSelect, onDelete }) {
  const age = new Date().getFullYear() - vehicle.year;
  const icon = vehicle.vehicle_type === 'car' ? '🚗' : '🏍️';

  return (
    <div className="card cursor-pointer transition-all" onClick={onSelect}>
      {vehicle.photo_url && (
        <div className="photo-container mb-4">
          <img
            src={vehicle.photo_url}
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
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="btn btn-danger px-3"
          style={{ fontSize: '13px' }}
        >
          🗑
        </button>
      </div>
    </div>
  );
});
