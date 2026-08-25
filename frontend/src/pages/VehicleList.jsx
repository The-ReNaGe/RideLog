import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import VehicleForm from '../components/VehicleForm';
import VehicleCard from '../components/VehicleCard';

export default function VehicleList({ onSelectVehicle, currentUser }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      const response = await api.getVehicles();
      setVehicles(response.data);
      setError(null);
    } catch (err) {
      setError('Impossible de charger les véhicules');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVehicleCreated = () => {
    setShowForm(false);
    fetchVehicles();
  };

  const handleDeleteVehicle = async (vehicleId) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce véhicule?')) {
      try {
        await api.deleteVehicle(vehicleId);
        fetchVehicles();
      } catch (err) {
        alert('Impossible de supprimer le véhicule');
        console.error(err);
      }
    }
  };

  // Titre personnalisé avec le nom de l'utilisateur
  const garageTitle = currentUser
    ? `Garage de ${currentUser.display_name}`
    : 'Mes véhicules';

  // Séparation par propriétaire : ses véhicules d'abord, puis un garage par
  // membre du groupe famille. Mélangés dans une seule grille, on ne sait plus
  // à qui appartient quoi — et c'est justement la question que pose une vue
  // partagée.
  const { myVehicles, sharedGarages } = React.useMemo(() => {
    const mine = [];
    const byOwner = new Map();

    for (const v of vehicles) {
      const isMine = !v.owner_id || !currentUser?.id || v.owner_id === currentUser.id;
      if (isMine) {
        mine.push(v);
        continue;
      }
      if (!byOwner.has(v.owner_id)) {
        byOwner.set(v.owner_id, { ownerId: v.owner_id, name: v.owner_display_name, vehicles: [] });
      }
      byOwner.get(v.owner_id).vehicles.push(v);
    }

    return {
      myVehicles: mine,
      sharedGarages: [...byOwner.values()].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', 'fr')
      ),
    };
  }, [vehicles, currentUser]);

  if (loading && vehicles.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="spinner mx-auto mb-3"></div>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>Chargement du garage…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold" style={{ color: 'var(--text-1)' }}>
          {garageTitle}
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn btn-primary"
        >
          {showForm ? 'Annuler' : '+ Ajouter'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded gap-section" style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {showForm && (
        <div className="mb-6 card gap-section">
          <VehicleForm
            onSubmit={handleVehicleCreated}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {vehicles.length === 0 ? (
        <div className="card text-center py-12">
          <p style={{ color: 'var(--text-2)' }} className="mb-6">Aucun véhicule pour le moment</p>
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary"
          >
            + Ajouter votre premier véhicule
          </button>
        </div>
      ) : (
        <>
          {/* Ses propres véhicules */}
          {myVehicles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myVehicles.map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  onSelect={() => onSelectVehicle(vehicle.id)}
                  onDelete={() => handleDeleteVehicle(vehicle.id)}
                  currentUser={currentUser}
                />
              ))}
            </div>
          ) : (
            // Le cas existe dès qu'on rejoint un groupe avant d'avoir créé son
            // premier véhicule : sans ce message, la page s'ouvre directement
            // sur le garage de quelqu'un d'autre.
            <div className="card text-center py-8">
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                Vous n'avez pas encore de véhicule.
              </p>
            </div>
          )}

          {/* Un garage par membre du groupe famille */}
          {sharedGarages.map((garage) => (
            <div key={garage.ownerId} className="mt-10">
              <div className="mb-4 pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>
                    Garage de {garage.name || 'un membre du groupe'}
                  </h3>
                  <span
                    className="text-xs px-2 py-1 rounded font-semibold"
                    style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                  >
                    Lecture seule
                  </span>
                </div>
                <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
                  Partagé avec vous — vous pouvez tout consulter, mais seul{' '}
                  {garage.name || 'son propriétaire'} peut y enregistrer un entretien ou un plein.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {garage.vehicles.map((vehicle) => (
                  <VehicleCard
                    key={vehicle.id}
                    vehicle={vehicle}
                    onSelect={() => onSelectVehicle(vehicle.id)}
                    onDelete={() => handleDeleteVehicle(vehicle.id)}
                    currentUser={currentUser}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
