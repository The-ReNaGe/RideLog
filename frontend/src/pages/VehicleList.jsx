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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vehicles.map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              onSelect={() => onSelectVehicle(vehicle.id)}
              onDelete={() => handleDeleteVehicle(vehicle.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
