import React, { useCallback, useEffect, useState, useRef } from 'react';
import { api } from '../lib/api';
import UpcomingMaintenance from '../components/UpcomingMaintenance';
import MaintenanceForm from '../components/MaintenanceForm';
import MaintenanceHistory from '../components/MaintenanceHistory';
import FuelTracking from '../components/FuelTracking';

const motorLabels = {
  essence: 'Essence', diesel: 'Diesel', hybrid: 'Hybride',
  electric: 'Électrique', thermal: 'Thermique',
};
const categoryLabels = {
  accessible: '♻️ Accessible', generalist: '🔧 Généraliste', premium: '👑 Premium',
};
const tabs = [
  { key: 'upcoming', label: '📋 À venir' },
  { key: 'history', label: '📜 Historique' },
  { key: 'fuel', label: '⛽ Carburant' },
  { key: 'recap', label: '📊 Récapitulatif' },
];

export default function VehicleDetail({ vehicleId, onBack }) {
  const [vehicle, setVehicle] = useState(null);
  const [upcoming, setUpcoming] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [costForecast, setCostForecast] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [recap, setRecap] = useState(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [editingMileage, setEditingMileage] = useState(false);
  const [newMileage, setNewMileage] = useState('');
  const [mileageSaving, setMileageSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedVehicle, setEditedVehicle] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const photoInputRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, [vehicleId]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [vehicleRes, upcomingRes, recommendationsRes, forecastRes, estimateRes] = await Promise.all([
        api.getVehicle(vehicleId),
        api.getUpcoming(vehicleId),
        api.getRecommendations(vehicleId),
        api.getCostForecast(vehicleId),
        api.getVehicleEstimate(vehicleId),
      ]);

      setVehicle(vehicleRes.data);
      setUpcoming(upcomingRes.data);
      setRecommendations(recommendationsRes.data);
      setCostForecast(forecastRes.data);
      setEstimate(estimateRes.data);
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message || 'Erreur inconnue';
      console.error('Failed to load vehicle details:', errorMsg, err);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  const handleMaintenanceCreated = useCallback(() => {
    setShowMaintenanceForm(false);
    fetchData();
  }, [fetchData]);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhotoUploading(true);
      const res = await api.uploadVehiclePhoto(vehicleId, file);
      setVehicle(res.data);
    } catch (err) {
      console.error('Failed to upload photo', err);
      alert(err.response?.data?.detail || 'Erreur lors de l\'upload de la photo');
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handlePhotoDelete = async () => {
    if (!confirm('Supprimer la photo du véhicule ?')) return;
    try {
      const res = await api.deleteVehiclePhoto(vehicleId);
      setVehicle(res.data);
    } catch (err) {
      console.error('Failed to delete photo', err);
    }
  };

  const loadRecap = async () => {
    try {
      setRecapLoading(true);
      const res = await api.getMaintenanceRecap(vehicleId);
      setRecap(res.data);
    } catch (err) {
      console.error('Failed to load recap', err);
    } finally {
      setRecapLoading(false);
    }
  };

  const handleMileageSave = useCallback(async () => {
    const val = parseInt(newMileage, 10);
    if (!val || val < 0) return;
    try {
      setMileageSaving(true);
      await api.updateVehicle(vehicleId, { current_mileage: val });
      setEditingMileage(false);
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Erreur lors de la mise à jour du kilométrage';
      alert(msg);
    } finally {
      setMileageSaving(false);
    }
  }, [newMileage, vehicleId, fetchData]);

  const handleEditStart = () => {
    setEditedVehicle({
      name: vehicle.name,
      year: vehicle.year,
      registration_date: vehicle.registration_date ? vehicle.registration_date.split('T')[0] : '',
      current_mileage: vehicle.current_mileage,
      purchase_price: vehicle.purchase_price || '',
      notes: vehicle.notes || '',
    });
    setIsEditing(true);
  };

  const handleEditSave = useCallback(async () => {
    try {
      setEditSaving(true);
      const updateData = {
        name: editedVehicle.name,
        year: editedVehicle.year ? parseInt(editedVehicle.year, 10) : null,
        registration_date: editedVehicle.registration_date || null,
        current_mileage: editedVehicle.current_mileage ? parseInt(editedVehicle.current_mileage, 10) : 0,
        purchase_price: editedVehicle.purchase_price ? parseFloat(editedVehicle.purchase_price) : null,
        notes: editedVehicle.notes || null,
      };
      await api.updateVehicle(vehicleId, updateData);
      setIsEditing(false);
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Erreur lors de la mise à jour du véhicule';
      alert(msg);
    } finally {
      setEditSaving(false);
    }
  }, [editedVehicle, vehicleId, fetchData]);

  if (error) {
    return (
      <div className="text-center py-16">
        <p style={{ color: '#CC0000' }} className="mb-4">⚠️ Erreur lors du chargement</p>
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>{error}</p>
        <button
          onClick={() => {
            setError(null);
            fetchData();
          }}
          className="mt-4 px-4 py-2 rounded"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          🔄 Réessayer
        </button>
      </div>
    );
  }

  if (loading || !vehicle) {
    return (
      <div className="text-center py-16">
        <div className="spinner mx-auto mb-3"></div>
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>Chargement des détails du véhicule…</p>
      </div>
    );
  }

  const year = new Date().getFullYear() - vehicle.year;

  return (
    <div>
      {/* Modal d'édition */}
      {isEditing && editedVehicle && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card p-6 w-full max-w-md mx-4" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 className="text-xl font-bold mb-4">Modifier les informations</h3>
            
            <div className="space-y-3 text-sm">
              {/* Nom */}
              <div>
                <label style={{ color: 'var(--text-2)' }}>Nom du véhicule</label>
                <input
                  type="text"
                  value={editedVehicle.name}
                  onChange={(e) => setEditedVehicle({...editedVehicle, name: e.target.value})}
                  className="w-full px-3 py-2 mt-1 rounded input-field"
                />
              </div>

              {/* Année */}
              <div>
                <label style={{ color: 'var(--text-2)' }}>Année</label>
                <input
                  type="number"
                  min="1900" max="2100"
                  value={editedVehicle.year}
                  onChange={(e) => setEditedVehicle({...editedVehicle, year: e.target.value})}
                  className="w-full px-3 py-2 mt-1 rounded input-field"
                />
              </div>

              {/* Date de mise en circulation */}
              <div>
                <label style={{ color: 'var(--text-2)' }}>Date de mise en circulation</label>
                <input
                  type="date"
                  value={editedVehicle.registration_date}
                  onChange={(e) => setEditedVehicle({...editedVehicle, registration_date: e.target.value})}
                  className="w-full px-3 py-2 mt-1 rounded input-field"
                />
              </div>

              {/* Kilométrage */}
              <div>
                <label style={{ color: 'var(--text-2)' }}>Kilométrage actuel</label>
                <input
                  type="number"
                  min="0"
                  value={editedVehicle.current_mileage}
                  onChange={(e) => setEditedVehicle({...editedVehicle, current_mileage: e.target.value})}
                  className="w-full px-3 py-2 mt-1 rounded input-field"
                />
              </div>

              {/* Prix d'achat */}
              <div>
                <label style={{ color: 'var(--text-2)' }}>Prix d'achat</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={editedVehicle.purchase_price}
                  onChange={(e) => setEditedVehicle({...editedVehicle, purchase_price: e.target.value})}
                  className="w-full px-3 py-2 mt-1 rounded input-field"
                />
              </div>

              {/* Notes */}
              <div>
                <label style={{ color: 'var(--text-2)' }}>Notes</label>
                <textarea
                  value={editedVehicle.notes}
                  onChange={(e) => setEditedVehicle({...editedVehicle, notes: e.target.value})}
                  className="w-full px-3 py-2 mt-1 rounded input-field"
                  rows="3"
                />
              </div>
            </div>

            {/* Boutons */}
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setIsEditing(false)}
                disabled={editSaving}
                className="flex-1 px-4 py-2 rounded disabled:opacity-50"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
              >
                Annuler
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSaving}
                className="flex-1 px-4 py-2 rounded disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                {editSaving ? '⏳ Sauvegarde…' : '💾 Sauvegarder'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <button
        onClick={onBack}
        className="mb-4 sm:mb-6 px-3 py-1.5 font-medium text-sm hover:opacity-80 transition-opacity"
        style={{ color: 'var(--accent)' }}
      >
        ← Retour aux véhicules
      </button>

      {/* Vehicle Header */}
      <div className="card overflow-hidden mb-6">
            {vehicle.photo_url && (
          <div className="photo-container mb-4">
            <img
              src={vehicle.photo_url}
              alt={`${vehicle.brand} ${vehicle.model}`}
            />
            <button
              onClick={handlePhotoDelete}
              className="absolute top-2 right-2 rounded-full w-8 h-8 flex items-center justify-center text-sm hover:opacity-80 transition-opacity font-bold"
              title="Supprimer la photo"
              style={{ background: 'var(--danger)', color: 'white' }}
            >✕</button>
          </div>
        )}
        <div className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--text-1)' }}>
                {vehicle.vehicle_type === 'car' ? '🚗' : '🏍️'} {vehicle.brand} {vehicle.model}
              </h2>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-sm" style={{ color: 'var(--text-2)' }}>
                <span>{vehicle.year}</span>
                <span>{motorLabels[vehicle.motorization] || vehicle.motorization}</span>
                {vehicle.displacement > 0 && <span>{vehicle.displacement} cc</span>}
                {editingMileage ? (
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      value={newMileage}
                      onChange={(e) => setNewMileage(e.target.value)}
                      className="w-28 px-2 py-0.5 text-sm rounded input-field"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') handleMileageSave(); if (e.key === 'Escape') setEditingMileage(false); }}
                    />
                    <button onClick={handleMileageSave} disabled={mileageSaving} className="font-bold text-xs hover:opacity-80" style={{ color: 'var(--success)' }}>✓</button>
                    <button onClick={() => setEditingMileage(false)} className="text-xs hover:opacity-80" style={{ color: 'var(--text-3)' }}>✕</button>
                  </span>
                ) : (
                  <button
                    onClick={() => { setNewMileage(String(vehicle.current_mileage)); setEditingMileage(true); }}
                    className="font-bold hover:opacity-80 transition-opacity cursor-pointer"
                    title="Cliquez pour modifier le kilométrage"
                    style={{ color: 'var(--accent)' }}
                  >
                    {vehicle.current_mileage.toLocaleString()} km ✏️
                  </button>
                )}
                {year > 0 && <span>{year} an{year > 1 ? 's' : ''}</span>}
              </div>
              {vehicle.notes && (
                <p className="text-sm mt-2" style={{ color: 'var(--text-2)' }}>{vehicle.notes}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{categoryLabels[vehicle.range_category] || vehicle.range_category}</span>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoUpload}
                className="hidden"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoUploading}
                  className="text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                >
                  {photoUploading ? '⏳ Upload…' : vehicle.photo_url ? '📷 Changer la photo' : '📷 Ajouter une photo'}
                </button>
                <button
                  onClick={handleEditStart}
                  className="text-xs px-3 py-1.5 rounded-lg transition-all"
                  style={{ background: 'var(--accent)', color: 'white' }}
                  title="Modifier les informations du véhicule"
                >
                  ✏️ Modifier
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cost Forecast + Quick Actions */}
      {costForecast && (
        <div className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="card p-4 text-center">
              <div className="card-label">Coût annuel estimé</div>
              <div className="stat-number" style={{ color: 'var(--accent)' }}>
                €{costForecast.total_cost_min || 0}–{costForecast.total_cost_max || 0}
              </div>
            </div>
            <div className="card p-4 text-center">
              <div className="card-label">Interventions prévues</div>
              <div className="stat-number" style={{ color: 'var(--text-1)' }}>{costForecast.upcoming_count}</div>
            </div>
            <div className="card p-4 text-center">
              <div className="card-label">Urgentes</div>
              <div className="stat-number" style={{ color: costForecast.urgent_count > 0 ? 'var(--danger)' : 'var(--success)' }}>
                {costForecast.urgent_count}
              </div>
            </div>
            <div className="card p-4 flex items-center justify-center">
              <button
                onClick={() => setShowMaintenanceForm(!showMaintenanceForm)}
                className="btn btn-primary w-full text-sm"
              >
                {showMaintenanceForm ? 'Annuler' : '+ Intervention'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Purchase Price */}
      {estimate && estimate.estimated_value != null && (
        <div className="card p-5 mb-6" style={{ borderLeft: '4px solid var(--success)' }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="card-label">💰 Prix d'achat</div>
              <div className="stat-number" style={{ color: 'var(--success)' }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(estimate.estimated_value)}
              </div>
            </div>
          </div>
        </div>
      )}

      {showMaintenanceForm && (
        <div className="card p-6 mb-6">
          <MaintenanceForm
            vehicleId={vehicleId}
            vehicleType={vehicle.vehicle_type}
            displacement={vehicle.displacement}
            rangeCategory={vehicle.range_category}
            onSubmit={handleMaintenanceCreated}
            onCancel={() => setShowMaintenanceForm(false)}
          />
        </div>
      )}

      {/* Recommendations */}
      {recommendations && recommendations.recommendations.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--text-1)' }}>Recommandations</h3>
          <div className="space-y-3">
            {recommendations.recommendations.map((rec, idx) => {
              const typeLabels = { error: '🔴 Critique', warning: '🟡 Attention', info: '🔵 Info' };
              const bgColor = rec.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : rec.type === 'warning' ? 'rgba(234, 179, 8, 0.1)' : 'rgba(59, 130, 246, 0.1)';
              const borderColor = rec.type === 'error' ? 'var(--danger)' : rec.type === 'warning' ? 'var(--warning)' : '#3b82f6';
              return (
                <div
                  key={idx}
                  className="card p-4"
                  style={{ background: bgColor, borderLeft: `4px solid ${borderColor}` }}
                >
                  <p className="font-medium" style={{ color: rec.type === 'error' ? 'var(--danger)' : rec.type === 'warning' ? 'var(--warning)' : '#3b82f6' }}>{typeLabels[rec.type] || rec.type}</p>
                  <p className="mt-1" style={{ color: 'var(--text-1)' }}>{rec.message}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex gap-1 sm:gap-4 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                if (tab.key === 'recap' && !recap) loadRecap();
              }}
              className="px-3 sm:px-4 py-2 font-medium text-sm transition-all whitespace-nowrap"
              style={{
                borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'upcoming' && upcoming && (
        <UpcomingMaintenance data={{ ...upcoming, vehicle_type: vehicle.vehicle_type }} />
      )}
      {activeTab === 'history' && (
        <MaintenanceHistory vehicleId={vehicleId} onDataChanged={fetchData} />
      )}
      {activeTab === 'fuel' && (
        <FuelTracking vehicleId={vehicleId} onFuelAdded={fetchData} />
      )}
      {activeTab === 'recap' && (
        <div>
          {recapLoading ? (
            <div className="text-center py-12">
              <div className="spinner mx-auto mb-3"></div>
              <p style={{ color: 'var(--text-3)' }} className="text-sm">Chargement du récapitulatif…</p>
            </div>
          ) : recap ? (
            <div className="space-y-6">
              {/* Vehicle header */}
              <div className="card p-5" style={{ borderLeft: '4px solid var(--accent)' }}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>
                      {recap.vehicle_type === 'car' ? '🚗' : '🏍️'} {recap.vehicle_name}
                    </h3>
                    <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                      {recap.vehicle_year && `Année ${recap.vehicle_year} · `}{recap.current_mileage?.toLocaleString('fr-FR')} km
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const name = (recap.vehicle_name || 'vehicule').replace(/\s+/g, '_');
                        api.downloadFile(`/vehicles/${vehicleId}/recap/download`, `suivi_${name}.zip`);
                      }}
                      className="btn btn-primary inline-flex items-center gap-2"
                    >
                      📥 Télécharger l'historique
                    </button>
                    <button onClick={loadRecap} className="btn btn-secondary">🔄</button>
                  </div>
                </div>
              </div>

              {/* Total cost card */}
              <div className="card p-5 text-center" style={{ background: 'var(--bg-surface)' }}>
                <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-3)' }}>Coût total toutes catégories</div>
                <div className="text-4xl font-bold" style={{ color: 'var(--accent)' }}>
                  {recap.total_cost.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                </div>
                <div className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
                  {recap.total_interventions} intervention{recap.total_interventions > 1 ? 's' : ''} · {recap.documents_count} document{recap.documents_count > 1 ? 's' : ''}
                </div>
              </div>

              {/* Cost by category */}
              {recap.cost_by_category && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { key: 'scheduled', icon: '🔧', label: 'Entretien', color: 'var(--accent)', borderColor: 'var(--accent)' },
                    { key: 'repair', icon: '⚠️', label: 'Réparation', color: 'var(--warning)', borderColor: 'var(--warning)' },
                    { key: 'modification', icon: '🔨', label: 'Modification', color: '#8b5cf6', borderColor: '#8b5cf6' },
                  ].map(cat => {
                    const cost = recap.cost_by_category[cat.key] || 0;
                    const count = recap.count_by_category?.[cat.key] || 0;
                    const pct = recap.total_cost > 0 ? Math.round((cost / recap.total_cost) * 100) : 0;
                    return (
                      <div key={cat.key} className="card p-4" style={{ borderLeft: `4px solid ${cat.borderColor}` }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                            {cat.icon} {cat.label}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--bg-surface)', color: 'var(--text-3)' }}>
                            {count} interv.
                          </span>
                        </div>
                        <div className="text-2xl font-bold" style={{ color: cat.color }}>
                          {cost.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </div>
                        {recap.total_cost > 0 && (
                          <div className="mt-2">
                            <div style={{ height: 4, borderRadius: 2, background: 'var(--border)' }}>
                              <div style={{ height: 4, borderRadius: 2, width: `${pct}%`, background: cat.color, transition: 'width 0.5s' }} />
                            </div>
                            <div className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{pct}% du total</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Detailed table */}
              {recap.maintenances.length === 0 ? (
                <div className="card p-12 text-center">
                  <p style={{ color: 'var(--text-3)' }}>Aucun entretien enregistré.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>Détail des interventions</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-3)' }} className="text-left">
                          <th className="pb-2 pr-4">Date</th>
                          <th className="pb-2 pr-4">Catégorie</th>
                          <th className="pb-2 pr-4">Intervention</th>
                          <th className="pb-2 pr-4 text-right">Kilométrage</th>
                          <th className="pb-2 pr-4 text-right">Coût</th>
                          <th className="pb-2 pr-4">Notes</th>
                          <th className="pb-2">Document</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recap.maintenances.map((m) => {
                          const categoryMap = {
                            'scheduled': { icon: '🔧', label: 'Entretien', bg: 'var(--accent)', bgLight: 'rgba(108,138,247,0.12)' },
                            'repair': { icon: '⚠️', label: 'Réparation', bg: 'var(--warning)', bgLight: 'rgba(243,156,18,0.12)' },
                            'modification': { icon: '🔨', label: 'Modification', bg: '#8b5cf6', bgLight: 'rgba(139,92,246,0.12)' },
                          };
                          const catDisplay = categoryMap[m.maintenance_category] || categoryMap['scheduled'];
                          const displayType = (m.intervention_type === 'Autre' && m.other_description) ? m.other_description : m.intervention_type;
                          
                          return (
                            <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td className="py-2.5 pr-4 whitespace-nowrap" style={{ color: 'var(--text-1)' }}>
                                {new Date(m.execution_date).toLocaleDateString('fr-FR')}
                              </td>
                              <td className="py-2.5 pr-4">
                                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: catDisplay.bgLight, color: catDisplay.bg }}>
                                  {catDisplay.icon} {catDisplay.label}
                                </span>
                              </td>
                              <td className="py-2.5 pr-4 font-medium" style={{ color: 'var(--text-1)' }}>
                                {displayType}
                              </td>
                              <td className="py-2.5 pr-4 text-right" style={{ color: 'var(--text-2)' }}>{m.mileage_at_intervention.toLocaleString('fr-FR')} km</td>
                              <td className="py-2.5 pr-4 text-right font-medium" style={{ color: 'var(--text-1)' }}>
                                {m.cost_paid != null ? `${m.cost_paid.toFixed(2)} €` : '—'}
                              </td>
                              <td className="py-2.5 pr-4 max-w-[200px] truncate" style={{ color: 'var(--text-3)' }}>{m.notes || '—'}</td>
                              <td className="py-2.5">
                                {m.has_invoice ? (
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      api.downloadFile(m.invoice_download_url, m.invoice_filename || 'facture');
                                    }}
                                    style={{ color: 'var(--accent)', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                    className="whitespace-nowrap"
                                  >
                                    📎 {m.invoice_filename || 'Facture'}
                                  </button>
                                ) : (
                                  <span style={{ color: 'var(--text-3)' }}>—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {recap.total_cost > 0 && (
                        <tfoot>
                          <tr style={{ borderTop: '2px solid var(--text-3)' }} className="font-bold">
                            <td colSpan="3" className="pt-3" style={{ color: 'var(--text-1)' }}>Total</td>
                            <td></td>
                            <td className="pt-3 text-right" style={{ color: 'var(--accent)' }}>{recap.total_cost.toFixed(2)} €</td>
                            <td></td>
                            <td className="pt-3 text-sm" style={{ color: 'var(--text-3)' }}>{recap.documents_count} doc(s)</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card p-12 text-center">
              <p style={{ color: 'var(--text-3)' }}>Impossible de charger le récapitulatif.</p>
              <button onClick={loadRecap} className="btn btn-primary mt-4">Réessayer</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
