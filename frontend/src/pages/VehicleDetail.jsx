import React, { useCallback, useEffect, useState, useRef } from 'react';
import { api } from '../lib/api';
import UpcomingMaintenance from '../components/UpcomingMaintenance';
import MaintenanceForm from '../components/MaintenanceForm';
import MaintenanceHistory from '../components/MaintenanceHistory';
import FuelTracking from '../components/FuelTracking';
import VehiclePhoto from '../components/VehiclePhoto';
import Icon from '../components/Icon';
import CategoryTag, { getCategory } from '../components/CategoryTag';
import { usePreferences } from '../lib/preferencesContext';
import { distanceToDisplay, distanceUnit } from '../lib/units';

const motorLabels = {
  essence: 'Essence', diesel: 'Diesel', hybride: 'Hybride', hybrid: 'Hybride',
  electrique: 'Électrique', electric: 'Électrique',
  thermal: 'Thermique', thermique: 'Thermique',
};
const categoryLabels = {
  accessible: 'Accessible', generalist: 'Généraliste', premium: 'Premium',
};
const tabs = [
  { key: 'upcoming', icon: 'clipboard', label: 'À venir' },
  { key: 'history',  icon: 'note',      label: 'Historique' },
  { key: 'fuel',     icon: 'fuel',      label: 'Carburant' },
  { key: 'recap',    icon: 'chart',     label: 'Récapitulatif' },
];



export default function VehicleDetail({ vehicleId, onBack, currentUser }) {
  const { units, lang } = usePreferences();
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
  const [deleting, setDeleting] = useState(false);
  const photoInputRef = useRef(null);

  useEffect(() => { fetchData(); }, [vehicleId]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [vehicleRes, upcomingRes, recommendationsRes, forecastRes, estimateRes, recapRes] = await Promise.all([
        api.getVehicle(vehicleId),
        api.getUpcoming(vehicleId),
        api.getRecommendations(vehicleId),
        api.getCostForecast(vehicleId),
        api.getVehicleEstimate(vehicleId),
        api.getMaintenanceRecap(vehicleId),
      ]);
      setVehicle(vehicleRes.data);
      setUpcoming(upcomingRes.data);
      setRecommendations(recommendationsRes.data);
      setCostForecast(forecastRes.data);
      setEstimate(estimateRes.data);
      setRecap(recapRes.data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Erreur inconnue');
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
      alert(err.response?.data?.detail || 'Erreur lors de l\'upload de la photo');
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handlePhotoDelete = async () => {
    if (!confirm('Supprimer la photo du véhicule ?')) return;
    try { const res = await api.deleteVehiclePhoto(vehicleId); setVehicle(res.data); } catch {}
  };

  const loadRecap = async () => {
    try {
      setRecapLoading(true);
      const res = await api.getMaintenanceRecap(vehicleId);
      setRecap(res.data);
    } catch {}
    finally { setRecapLoading(false); }
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
      alert(err.response?.data?.detail || 'Erreur lors de la mise à jour du kilométrage');
    } finally { setMileageSaving(false); }
  }, [newMileage, vehicleId, fetchData]);

  // La suppression vit ici, derrière « Modifier », et pas sur la carte de la
  // liste : là-bas, la carte entière est cliquable et une corbeille au coin se
  // déclenche par erreur.
  const handleDeleteVehicle = useCallback(async () => {
    if (!window.confirm(
      `Supprimer ${vehicle?.brand} ${vehicle?.model} ?\n\n` +
      'Tout son historique d\'entretien, ses pleins et ses factures seront supprimés. ' +
      'Cette action est définitive.'
    )) return;
    try {
      setDeleting(true);
      await api.deleteVehicle(vehicleId);
      onBack();
    } catch (err) {
      alert(err.response?.data?.detail || 'Impossible de supprimer ce véhicule');
      setDeleting(false);
    }
  }, [vehicle, vehicleId, onBack]);

  const handleEditStart = () => {
    setEditedVehicle({
      name: vehicle.name,
      year: vehicle.year,
      registration_date: vehicle.registration_date ? vehicle.registration_date.split('T')[0] : '',
      current_mileage: vehicle.current_mileage,
      purchase_price: vehicle.purchase_price || '',
      notes: vehicle.notes || '',
      is_private: !!vehicle.is_private,
    });
    setIsEditing(true);
  };

  const handleEditSave = useCallback(async () => {
    try {
      setEditSaving(true);
      await api.updateVehicle(vehicleId, {
        name: editedVehicle.name,
        year: editedVehicle.year ? parseInt(editedVehicle.year, 10) : null,
        registration_date: editedVehicle.registration_date || null,
        current_mileage: editedVehicle.current_mileage ? parseInt(editedVehicle.current_mileage, 10) : 0,
        purchase_price: editedVehicle.purchase_price ? parseFloat(editedVehicle.purchase_price) : null,
        notes: editedVehicle.notes || null,
        is_private: !!editedVehicle.is_private,
      });
      setIsEditing(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors de la mise à jour du véhicule');
    } finally { setEditSaving(false); }
  }, [editedVehicle, vehicleId, fetchData]);

  // Kilométrage moyen annuel — calculé depuis l'historique recap
  // Prend le premier et le dernier point km enregistrés, calcule le delta / durée
  // Nécessite au moins 6 mois de données pour être fiable
  const avgKmPerYear = React.useMemo(() => {
    if (!recap?.maintenances?.length) return null;

    // Récupérer tous les points (date, km) avec km connu > 0
    const points = recap.maintenances
      .filter(m => m.mileage_at_intervention > 0)
      .map(m => ({ date: new Date(m.execution_date), km: m.mileage_at_intervention }))
      .sort((a, b) => a.date - b.date);

    if (points.length < 2) return null;

    const first = points[0];
    const last = points[points.length - 1];

    // Utiliser le km max parmi les derniers enregistrements comme point final
    const maxKm = Math.max(...points.map(p => p.km));
    const minKm = points[0].km;

    const yearsElapsed = (last.date - first.date) / (1000 * 60 * 60 * 24 * 365.25);

    // Moins d'un mois → vraiment pas assez
    if (yearsElapsed < 0.08) return { value: null, estimated: false };

    const avg = Math.round((maxKm - minKm) / yearsElapsed);
    // Moins de 6 mois → estimation extrapolée, on le signale
    const estimated = yearsElapsed < 0.5;
    return { value: avg, estimated };
  }, [recap]);

  if (error) {
    return (
      <div className="text-center py-16">
        <div className="icon-box lg danger mx-auto" style={{ marginBottom: 12 }}>
          <Icon name="alert" size={20} />
        </div>
        <p className="mb-1" style={{ color: 'var(--text-1)', fontWeight: 700 }}>Erreur lors du chargement</p>
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>{error}</p>
        <button onClick={() => { setError(null); fetchData(); }} className="btn btn-primary mt-4">
          <Icon name="refresh" size={16} />
          Réessayer
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

  const vehicleAge = new Date().getFullYear() - vehicle.year;

  // Un véhicule consulté via le groupe famille est en lecture seule : le
  // backend refuse toute écriture (404). On masque donc les commandes plutôt
  // que de laisser l'utilisateur les découvrir en échouant.
  // Repli sur « modifiable » si l'information manque — une réponse d'API
  // ancienne ne doit pas figer l'interface de son propre véhicule ; c'est le
  // backend qui fait autorité, pas cet indice d'affichage.
  const canEdit =
    !vehicle.owner_id || !currentUser?.id || vehicle.owner_id === currentUser.id;

  return (
    <div style={{ maxWidth: '100%', overflowX: 'hidden' }}>

      {/* Modal d'édition */}
      {isEditing && editedVehicle && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(12,15,22,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="card w-full max-w-md" style={{ maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <h3 className="mb-4">Modifier les informations</h3>
            <div className="space-y-3 text-sm">
              {[
                { label: 'Nom du véhicule', key: 'name', type: 'text' },
                { label: 'Année', key: 'year', type: 'number', min: '1900', max: '2100' },
                { label: 'Date de mise en circulation', key: 'registration_date', type: 'date' },
                { label: 'Kilométrage actuel', key: 'current_mileage', type: 'number', min: '0' },
                { label: "Prix d'achat", key: 'purchase_price', type: 'number', min: '0', step: '100' },
              ].map(field => (
                <div key={field.key}>
                  <label className="field-label">{field.label}</label>
                  <input
                    type={field.type}
                    min={field.min} max={field.max} step={field.step}
                    value={editedVehicle[field.key]}
                    onChange={e => setEditedVehicle({ ...editedVehicle, [field.key]: e.target.value })}
                  />
                </div>
              ))}
              <div>
                <label className="field-label">Notes</label>
                <textarea
                  value={editedVehicle.notes}
                  onChange={e => setEditedVehicle({ ...editedVehicle, notes: e.target.value })}
                  rows="3"
                />
              </div>
              <div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!editedVehicle.is_private}
                    onChange={e => setEditedVehicle({ ...editedVehicle, is_private: e.target.checked })}
                    className="mt-1"
                  />
                  <span>
                    <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-1)', fontWeight: 600 }}>
                      <Icon name="lock" size={14} />
                      Véhicule privé
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--text-3)' }}>
                      Exclu du partage avec votre groupe famille. Vous continuez à le voir.
                    </span>
                  </span>
                </label>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setIsEditing(false)} disabled={editSaving} className="btn btn-secondary flex-1">
                Annuler
              </button>
              <button onClick={handleEditSave} disabled={editSaving} className="btn btn-primary flex-1">
                {editSaving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>

          </div>
        </div>
      )}

      <button onClick={onBack} className="btn btn-ghost btn-sm mb-4" style={{ marginLeft: -10 }}>
        <Icon name="chevronLeft" size={16} strokeWidth={2} />
        Retour aux véhicules
      </button>

      {/* Véhicule consulté via le groupe famille : le backend refuserait toute
          écriture en 404. Mieux vaut retirer les commandes que laisser
          l'utilisateur buter dessus. */}
      {!canEdit && (
        <div
          className="flex items-center gap-2 mb-4"
          style={{
            background: 'var(--accent-light)', color: 'var(--text-1)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            padding: '10px 14px', fontSize: 14,
          }}
        >
          <Icon name="eye" size={16} style={{ color: 'var(--accent)' }} />
          <span>
            Véhicule de <strong>{vehicle.owner_display_name || 'un autre membre'}</strong>,
            partagé avec votre groupe famille. Consultation seule.
          </span>
        </div>
      )}

      {/* En-tête du véhicule */}
      <section className="card mb-5" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="flex flex-col sm:flex-row">
          {/* Visuel — silhouette en fond, photo par-dessus si elle existe.
              Une hauteur fixe évite que la fiche saute selon la présence
              d'une photo et selon son format. */}
          <div
            className="photo-container hero-media relative"
          >
            <Icon
              name={vehicle.vehicle_type === 'car' ? 'car' : 'motorcycle'}
              size={56} strokeWidth={1.3}
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
            {vehicle.photo_url && canEdit && (
              <button
                onClick={handlePhotoDelete}
                className="btn-icon"
                title="Supprimer la photo"
                aria-label="Supprimer la photo"
                style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                <Icon name="close" size={15} strokeWidth={2.2} />
              </button>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-3" style={{ padding: '16px 18px' }}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{vehicle.brand} {vehicle.model}</h1>
                  {vehicle.is_private && canEdit && (
                    <span className="badge badge-neutral" title="Exclu du partage avec votre groupe famille">
                      <Icon name="lock" size={12} strokeWidth={2} />
                      Privé
                    </span>
                  )}
                </div>
                {vehicle.name && vehicle.name.trim() !== `${vehicle.brand} ${vehicle.model}`.trim() && (
                  <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{vehicle.name}</p>
                )}
              </div>

              {canEdit && (
                <div className="flex items-center gap-2 flex-wrap">
                  <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} className="hidden" />
                  <button onClick={() => photoInputRef.current?.click()} disabled={photoUploading} className="btn btn-secondary btn-sm">
                    <Icon name="camera" size={15} />
                    {photoUploading ? 'Envoi…' : vehicle.photo_url ? 'Changer la photo' : 'Ajouter une photo'}
                  </button>
                  <button onClick={handleEditStart} className="btn btn-secondary btn-sm">
                    <Icon name="pencil" size={15} />
                    Modifier
                  </button>
                  <button
                    onClick={handleDeleteVehicle}
                    disabled={deleting}
                    className="btn-icon danger"
                    title="Supprimer ce véhicule"
                    aria-label="Supprimer ce véhicule"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
              {[
                vehicle.year ? `${vehicle.year}${vehicleAge > 0 ? ` · ${vehicleAge} an${vehicleAge > 1 ? 's' : ''}` : ''}` : null,
                motorLabels[vehicle.motorization] || vehicle.motorization,
                vehicle.displacement > 0 ? `${vehicle.displacement} cm³` : null,
                categoryLabels[vehicle.range_category] || vehicle.range_category,
              ].filter(Boolean).map((m, i) => (
                <React.Fragment key={m}>
                  {i > 0 && <span className="chip-sep" aria-hidden="true">·</span>}
                  <span className="chip">{m}</span>
                </React.Fragment>
              ))}
            </div>

            {/* Kilométrage — la donnée la plus consultée et la plus souvent
                corrigée : elle se modifie sur place, sans ouvrir la modale. */}
            <div className="inset inline-flex items-center self-start" style={{ gap: 10, padding: '8px 12px' }}>
              <Icon name="gauge" size={17} style={{ color: 'var(--text-3)' }} />
              {editingMileage ? (
                <span className="flex items-center gap-1">
                  <input
                    type="number" value={newMileage} onChange={e => setNewMileage(e.target.value)}
                    style={{ width: 110 }} autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleMileageSave(); if (e.key === 'Escape') setEditingMileage(false); }}
                  />
                  <button onClick={handleMileageSave} disabled={mileageSaving} className="btn-icon" title="Valider" style={{ color: 'var(--success)' }}>
                    <Icon name="check" size={16} strokeWidth={2.4} />
                  </button>
                  <button onClick={() => setEditingMileage(false)} className="btn-icon" title="Annuler">
                    <Icon name="close" size={16} strokeWidth={2.2} />
                  </button>
                </span>
              ) : (
                <>
                  <span className="tabular" style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>
                    {distanceToDisplay(vehicle.current_mileage, units).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR')}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)', marginLeft: 4 }}>{distanceUnit(units)}</span>
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => { setNewMileage(String(vehicle.current_mileage)); setEditingMileage(true); }}
                      className="btn-icon" title="Corriger le kilométrage" aria-label="Corriger le kilométrage"
                    >
                      <Icon name="pencil" size={15} />
                    </button>
                  )}
                </>
              )}
            </div>

            {vehicle.notes && (
              <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{vehicle.notes}</p>
            )}
          </div>
        </div>
      </section>

      {/* KPI Cards */}
      {(() => {
        const overdue = upcoming?.upcoming?.filter(u => u.status === 'overdue').length || 0;
        const urgent  = upcoming?.upcoming?.filter(u => u.status === 'urgent').length || 0;
        const warning = upcoming?.upcoming?.filter(u => u.status === 'warning').length || 0;
        // 999999 est la sentinelle « pas de composante temps » : un entretien
        // suivi au seul kilométrage l'affichait tel quel, « 999999 j ».
        const next    = upcoming?.upcoming?.find(u => u.days_remaining != null && u.days_remaining !== 999999);
        const nextDays = next ? Math.round(next.days_remaining) : null;

        const stateConfig = overdue > 0
          ? { icon: 'alertCircle', tone: 'danger',  label: 'En retard',    color: 'var(--danger)' }
          : urgent > 0
          ? { icon: 'alert',       tone: 'warning', label: 'Urgent',       color: 'var(--warning)' }
          : warning > 0
          ? { icon: 'clock',       tone: 'warning', label: 'À surveiller', color: 'var(--warning)' }
          : { icon: 'checkCircle', tone: 'success', label: 'À jour',       color: 'var(--success)' };

        const nextLabel = nextDays == null ? '—'
          : nextDays <= 0 ? 'En retard'
          : nextDays === 1 ? 'Demain'
          : `${nextDays} j`;
        const nextColor = nextDays == null ? 'var(--text-3)'
          : nextDays <= 0 ? 'var(--danger)'
          : nextDays <= 7 ? 'var(--warning)'
          : 'var(--text-1)';
        const nextName = next?.intervention_type || null;

        const fmtEuro = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

        // Style commun à toutes les cards — libellé, valeur, précision.
        // Toutes partagent la même taille de valeur et la même hauteur : une
        // rangée dont les chiffres n'ont pas le même corps se lit comme une
        // hiérarchie qui n'existe pas.
        const KpiCard = ({ label, value, valueColor = 'var(--text-1)', sub = null }) => (
          <div className="card" style={{ padding: 14, minHeight: 92, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div className="card-label" style={{ marginBottom: 0 }}>{label}</div>
            <div>
              <div className="tabular" style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.02em', color: valueColor }}>
                {value}
              </div>
              {sub && <div className="text-ellipsis" style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
            </div>
          </div>
        );

        return (
          <div className="mb-6">
            {canEdit && (
              <div className="flex justify-end mb-3">
                <button onClick={() => setShowMaintenanceForm(!showMaintenanceForm)} className={`btn ${showMaintenanceForm ? 'btn-secondary' : 'btn-primary'}`}>
                  <Icon name={showMaintenanceForm ? 'close' : 'plus'} size={16} strokeWidth={2} />
                  {showMaintenanceForm ? 'Annuler' : 'Enregistrer une intervention'}
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KpiCard
                label="État"
                value={
                  <span className="inline-flex items-center" style={{ gap: 8 }}>
                    <span className={`icon-box sm ${stateConfig.tone}`}>
                      <Icon name={stateConfig.icon} size={16} />
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: stateConfig.color }}>{stateConfig.label}</span>
                  </span>
                }
              />
              <KpiCard
                label="En retard"
                value={overdue}
                valueColor={overdue > 0 ? 'var(--danger)' : 'var(--success)'}
                sub={overdue === 0 ? 'aucun' : overdue === 1 ? 'intervention' : 'interventions'}
              />
              <KpiCard
                label="Prochaine"
                value={nextLabel}
                valueColor={nextColor}
                sub={nextName}
              />
              <KpiCard
                label="Total dépensé"
                value={recap?.total_cost != null ? fmtEuro(recap.total_cost) : '—'}
                valueColor={recap?.total_cost != null ? 'var(--accent)' : 'var(--text-3)'}
              />
              <KpiCard
                label="Moy. km/an"
                value={avgKmPerYear?.value ? `${avgKmPerYear.value.toLocaleString('fr-FR')} km` : '—'}
                valueColor={avgKmPerYear?.value ? 'var(--text-1)' : 'var(--text-3)'}
                sub={avgKmPerYear?.estimated ? 'estimation' : null}
              />
            </div>
          </div>
        );
      })()}

      {estimate && estimate.estimated_value != null && (
        <div className="card mb-5 inline-flex items-center gap-3" style={{ padding: '12px 16px' }}>
          <div className="icon-box success"><Icon name="euro" size={18} /></div>
          <div>
          <div className="card-label" style={{ marginBottom: 2 }}>Prix d'achat</div>
          <div className="stat-number" style={{ color: 'var(--success)', fontSize: 22 }}>
            {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(estimate.estimated_value)}
          </div>
          </div>
        </div>
      )}

      {showMaintenanceForm && (
        <div className="card p-4 sm:p-6 mb-6">
          <MaintenanceForm
            vehicleId={vehicleId}
            vehicleType={vehicle.vehicle_type}
            displacement={vehicle.displacement}
            rangeCategory={vehicle.range_category}
            motorization={vehicle.motorization}
            upcomingMaintenances={upcoming?.upcoming || []}
            onSubmit={handleMaintenanceCreated}
            onCancel={() => setShowMaintenanceForm(false)}
          />
        </div>
      )}

      {/* Recommendations */}
      {recommendations?.recommendations?.length > 0 && (
        <div className="mb-6">
          <h3 className="section-title mb-3">Recommandations</h3>
          <div className="space-y-2">
            {recommendations.recommendations.map((rec, idx) => {
              const tone = {
                error:   { color: 'var(--danger)',  bg: 'var(--danger-light)',  icon: 'alertCircle', label: 'Critique' },
                warning: { color: 'var(--warning)', bg: 'var(--warning-light)', icon: 'alert',       label: 'Attention' },
                info:    { color: 'var(--accent)',  bg: 'var(--accent-light)',  icon: 'info',        label: 'Information' },
              }[rec.type] || { color: 'var(--accent)', bg: 'var(--accent-light)', icon: 'info', label: 'Information' };
              return (
                <div
                  key={idx}
                  className="flex items-start gap-3"
                  style={{
                    background: tone.bg, border: '1px solid var(--border)',
                    borderLeft: `3px solid ${tone.color}`,
                    borderRadius: 'var(--radius)', padding: '12px 14px',
                  }}
                >
                  <Icon name={tone.icon} size={17} style={{ color: tone.color, marginTop: 2 }} />
                  <div className="min-w-0">
                    <p style={{ color: tone.color, fontWeight: 700, fontSize: 13 }}>{tone.label}</p>
                    <p style={{ color: 'var(--text-1)', fontSize: 14 }}>{rec.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs mb-5">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); if (tab.key === 'recap' && !recap) loadRecap(); }}
            className={`tab ${activeTab === tab.key ? 'active' : ''}`}
            aria-current={activeTab === tab.key ? 'true' : undefined}
          >
            <Icon name={tab.icon} size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'upcoming' && upcoming && (
        <UpcomingMaintenance data={{ ...upcoming, vehicle_type: vehicle.vehicle_type }} vehicleId={vehicleId} onRefresh={fetchData} canEdit={canEdit} />
      )}
      {activeTab === 'history' && <MaintenanceHistory vehicleId={vehicleId} vehicleType={vehicle.vehicle_type} motorization={vehicle.motorization} onDataChanged={fetchData} canEdit={canEdit} />}
      {activeTab === 'fuel' && <FuelTracking vehicleId={vehicleId} onFuelAdded={fetchData} canEdit={canEdit} />}

      {activeTab === 'recap' && (
        <div>
          {recapLoading ? (
            <div className="text-center py-12"><div className="spinner mx-auto mb-3"></div><p style={{ color: 'var(--text-3)' }} className="text-sm">Chargement…</p></div>
          ) : recap ? (
            <div className="space-y-6">
              {/* Header récap */}
              <div className="card">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="icon-box"><Icon name={recap.vehicle_type === 'car' ? 'car' : 'motorcycle'} size={18} /></div>
                    <div>
                    <h3 className="section-title">{recap.vehicle_name}</h3>
                    <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                      {recap.vehicle_year && `Année ${recap.vehicle_year} · `}{recap.current_mileage?.toLocaleString('fr-FR')} km
                    </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => { const n = (recap.vehicle_name || 'vehicule').replace(/\s+/g, '_'); api.downloadFile(`/vehicles/${vehicleId}/recap/download`, `suivi_${n}.zip`); }}
                      className="btn btn-primary btn-sm"
                    >
                      <Icon name="download" size={15} />
                      Télécharger l'archive
                    </button>
                    <button onClick={loadRecap} className="btn btn-secondary btn-sm" title="Recharger">
                      <Icon name="refresh" size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Total */}
              <div className="card text-center">
                <div className="card-label">Coût total toutes catégories</div>
                <div className="tabular" style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--accent)' }}>
                  {recap.total_cost.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                </div>
                <div className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
                  {recap.total_interventions} intervention{recap.total_interventions > 1 ? 's' : ''} · {recap.documents_count} document{recap.documents_count > 1 ? 's' : ''}
                </div>
              </div>

              {/* Par catégorie */}
              {recap.cost_by_category && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { key: 'scheduled',    icon: 'wrench',  label: 'Entretien',    color: 'var(--accent)' },
                    { key: 'repair',       icon: 'alert',   label: 'Réparation',   color: 'var(--warning)' },
                    { key: 'modification', icon: 'sliders', label: 'Modification', color: 'var(--purple)' },
                  ].map(cat => {
                    const cost = recap.cost_by_category[cat.key] || 0;
                    const count = recap.count_by_category?.[cat.key] || 0;
                    const pct = recap.total_cost > 0 ? Math.round((cost / recap.total_cost) * 100) : 0;
                    return (
                      <div key={cat.key} className="card">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                            <Icon name={cat.icon} size={15} style={{ color: cat.color }} />
                            {cat.label}
                          </span>
                          <span className="badge badge-neutral">{count}</span>
                        </div>
                        <div className="tabular" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: cat.color }}>
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

              {/* Détail des interventions */}
              {recap.maintenances.length === 0 ? (
                <div className="card p-12 text-center"><p style={{ color: 'var(--text-3)' }}>Aucun entretien enregistré.</p></div>
              ) : (
                <div className="space-y-3">
                  <h3 className="section-title">Détail des interventions</h3>

                  {/* Desktop : tableau */}
                  <div className="hidden sm:block overflow-x-auto">
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
                        {recap.maintenances.map(m => {
                          const cat = getCategory(m.maintenance_category);
                          const dt = (m.intervention_type === 'Autre' && m.other_description) ? m.other_description : m.intervention_type;
                          return (
                            <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td className="py-2.5 pr-4 whitespace-nowrap" style={{ color: 'var(--text-1)' }}>{new Date(m.execution_date).toLocaleDateString('fr-FR')}</td>
                              <td className="py-2.5 pr-4"><CategoryTag category={cat} /></td>
                              <td className="py-2.5 pr-4 font-medium" style={{ color: 'var(--text-1)' }}>
                                {dt}
                                {m.sub_interventions && m.sub_interventions.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {m.sub_interventions.map((sub, idx) => (
                                      <span
                                        key={idx}
                                        className="text-xs px-1.5 py-0.5 rounded"
                                        style={{
                                          background: 'var(--bg-base)',
                                          color: 'var(--text-3)',
                                          border: '1px solid var(--border)',
                                        }}
                                      >
                                        {sub.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 pr-4 text-right" style={{ color: 'var(--text-2)' }}>{m.mileage_at_intervention.toLocaleString('fr-FR')} km</td>
                              <td className="py-2.5 pr-4 text-right font-medium" style={{ color: 'var(--text-1)' }}>{m.cost_paid != null ? `${m.cost_paid.toFixed(2)} €` : '—'}</td>
                              <td className="py-2.5 pr-4 max-w-[200px] truncate" style={{ color: 'var(--text-3)' }}>{m.notes || '—'}</td>
                              <td className="py-2.5">
                                {m.has_invoice ? (
                                  <button onClick={e => { e.preventDefault(); api.downloadFile(m.invoice_download_url, m.invoice_filename || 'facture'); }}
                                    style={{ color: 'var(--accent)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                    className="whitespace-nowrap inline-flex items-center gap-1.5">
                                    <Icon name="paperclip" size={14} />
                                    {m.invoice_filename || 'Facture'}
                                  </button>
                                ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
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

                  {/* Mobile : cartes empilées */}
                  <div className="sm:hidden space-y-2">
                    {recap.maintenances.map(m => {
                      const cat = getCategory(m.maintenance_category);
                      const dt = (m.intervention_type === 'Autre' && m.other_description) ? m.other_description : m.intervention_type;
                      return (
                        <div key={m.id} className="card p-3" style={{ borderLeft: `3px solid ${cat.color}` }}>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{dt}</span>
                            <CategoryTag category={cat} />
                          </div>
                          {m.sub_interventions && m.sub_interventions.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1 mb-1">
                              {m.sub_interventions.map((sub, idx) => (
                                <span
                                  key={idx}
                                  className="text-xs px-1.5 py-0.5 rounded"
                                  style={{
                                    background: 'var(--bg-base)',
                                    color: 'var(--text-3)',
                                    border: '1px solid var(--border)',
                                  }}
                                >
                                  {sub.name}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
                            <span className="inline-flex items-center gap-1"><Icon name="calendar" size={12} />{new Date(m.execution_date).toLocaleDateString('fr-FR')}</span>
                            <span className="inline-flex items-center gap-1"><Icon name="gauge" size={12} />{m.mileage_at_intervention.toLocaleString('fr-FR')} km</span>
                            {m.cost_paid != null && <span className="inline-flex items-center gap-1" style={{ color: 'var(--success)', fontWeight: 600 }}><Icon name="euro" size={12} />{m.cost_paid.toFixed(2)} €</span>}
                          </div>
                          {m.notes && <p className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>{m.notes}</p>}
                          {m.has_invoice && (
                            <button onClick={e => { e.preventDefault(); api.downloadFile(m.invoice_download_url, m.invoice_filename || 'facture'); }}
                              className="text-xs mt-1 inline-flex items-center gap-1.5 hover:opacity-70"
                              style={{ color: 'var(--accent)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                              <Icon name="paperclip" size={13} />
                              {m.invoice_filename || 'Facture'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {recap.total_cost > 0 && (
                      <div className="card p-3 text-right font-bold" style={{ color: 'var(--accent)' }}>
                        Total : {recap.total_cost.toFixed(2)} €
                      </div>
                    )}
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