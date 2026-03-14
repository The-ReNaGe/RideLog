import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';

export default function VehicleForm({ onSubmit, onCancel }) {
  const [creationMode, setCreationMode] = useState('manual');
  const [plateApiAvailable, setPlateApiAvailable] = useState(false);
  const [vehicleModels, setVehicleModels] = useState({ car: {}, motorcycle: {} });
  const [formData, setFormData] = useState({
    name: '',
    vehicle_type: 'car',
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    registration_date: '',
    motorization: 'essence',
    displacement: '',
    range_category: 'generalist',
    current_mileage: 0,
    purchase_price: '',
    notes: '',
    service_interval_km: '',
    service_interval_months: '',
  });
  const [vin, setVin] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [plateLoading, setPlateLoading] = useState(false);
  const [plateError, setPlateError] = useState(null);
  const [plateDecodedData, setPlateDecodedData] = useState(null);
  const [vinLoading, setVinLoading] = useState(false);
  const [vinError, setVinError] = useState(null);
  const [decodedData, setDecodedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [suggestedCategory, setSuggestedCategory] = useState(null);
  const [categoryReason, setCategoryReason] = useState(null);
  const [brandDefaults, setBrandDefaults] = useState(null);
  const [brandSearch, setBrandSearch] = useState('');
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Load config + vehicle models on mount
  useEffect(() => {
    (async () => {
      try {
        const [configRes, modelsRes] = await Promise.all([
          api.getConfig(),
          api.getVehicleModels(),
        ]);
        setPlateApiAvailable(configRes.data.plate_api_configured === true);
        setVehicleModels(modelsRes.data || { car: {}, motorcycle: {} });
      } catch (err) {
        console.error('Failed to load config/models', err);
      }
    })();
  }, []);

  // Brand list for current vehicle type
  const availableBrands = useMemo(() => {
    const models = vehicleModels[formData.vehicle_type] || {};
    const brands = Object.keys(models).sort();
    console.debug('[VehicleForm] availableBrands recalc', {
      vehicle_type: formData.vehicle_type,
      available_brands_count: brands.length,
      sample_brands: brands.slice(0, 3),
      all_car_brands: Object.keys(vehicleModels.car || {}).length,
      all_moto_brands: Object.keys(vehicleModels.motorcycle || {}).length,
    });
    return brands;
  }, [vehicleModels, formData.vehicle_type]);

  // Filtered brands for autocomplete
  const filteredBrands = useMemo(() => {
    if (!brandSearch) return availableBrands;
    const q = brandSearch.toLowerCase();
    return availableBrands.filter((b) => b.toLowerCase().includes(q));
  }, [availableBrands, brandSearch]);

  // Model list for selected brand
  const availableModels = useMemo(() => {
    const models = vehicleModels[formData.vehicle_type] || {};
    return models[formData.brand] || [];
  }, [vehicleModels, formData.vehicle_type, formData.brand]);

  // Filtered models for autocomplete
  const filteredModels = useMemo(() => {
    if (!modelSearch) return availableModels;
    const q = modelSearch.toLowerCase();
    return availableModels.filter((m) => m.toLowerCase().includes(q));
  }, [availableModels, modelSearch]);

  // Auto-categorize when brand, year, or price changes
  useEffect(() => {
    if (formData.brand && formData.year) {
      const fetchSuggestion = async () => {
        try {
          const response = await api.suggestCategory(
            formData.brand,
            formData.year,
            formData.vehicle_type,
            formData.purchase_price ? parseFloat(formData.purchase_price) : null
          );
          const suggested = response.data.suggested_category;
          setSuggestedCategory(suggested);
          setCategoryReason(response.data.reason);
          // Auto-apply suggestion
          if (suggested) {
            setFormData((prev) => ({ ...prev, range_category: suggested }));
          }
        } catch (err) {
          console.error('Failed to suggest category', err);
        }
      };
      fetchSuggestion();
    }
  }, [formData.brand, formData.year, formData.purchase_price, formData.vehicle_type]);

  // Fetch brand service defaults for motorcycles
  useEffect(() => {
    if (formData.vehicle_type !== 'motorcycle' || !formData.brand) {
      setBrandDefaults(null);
      return;
    }
    const fetchDefaults = async () => {
      try {
        const res = await api.getBrandServiceDefaults(formData.brand, formData.displacement || null);
        const defaults = res.data;
        setBrandDefaults(defaults);
        // Auto-fill if empty
        setFormData((prev) => ({
          ...prev,
          service_interval_km: prev.service_interval_km || defaults.km,
        }));
      } catch (err) {
        console.error('Failed to fetch brand service defaults', err);
      }
    };
    fetchDefaults();
  }, [formData.brand, formData.displacement, formData.vehicle_type]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Auto-extract year from registration_date
    if (name === 'registration_date' && value) {
      const date = new Date(value);
      const year = date.getFullYear();
      setFormData((prev) => ({
        ...prev,
        [name]: value,
        year: year,
      }));
      return;
    }
    
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'year' || name === 'current_mileage' || name === 'displacement' || name === 'service_interval_km' || name === 'service_interval_months'
        ? (value ? parseInt(value) : '')
        : name === 'purchase_price'
        ? (value ? parseFloat(value) : '')
        : value,
    }));
  };

  const selectBrand = (brand) => {
    setFormData((prev) => ({ ...prev, brand, model: '' }));
    setBrandSearch(brand);
    setModelSearch('');
    setShowBrandDropdown(false);
  };

  const selectModel = (model) => {
    setFormData((prev) => ({
      ...prev,
      model,
      name: prev.name || `${prev.brand} ${model}`,
    }));
    setModelSearch(model);
    setShowModelDropdown(false);
  };

  // === VIN decode ===
  const handleVinChange = (e) => {
    setVin(e.target.value);
    setDecodedData(null);
    setVinError(null);
  };

  const decodeVin = async () => {
    if (!vin.trim()) { setVinError('Veuillez entrer un VIN valide'); return; }
    setVinLoading(true);
    setVinError(null);
    setDecodedData(null);
    try {
      const response = await api.decodeVin(vin);
      setDecodedData(response.data);
    } catch (err) {
      setVinError(err.response?.data?.detail || 'Échec du décodage VIN.');
    } finally {
      setVinLoading(false);
    }
  };

  const applyDecodedData = () => {
    if (!decodedData) return;
    setFormData((prev) => ({
      ...prev,
      brand: decodedData.brand || prev.brand,
      model: decodedData.model || prev.model,
      year: decodedData.year || prev.year,
      motorization: decodedData.motorization || prev.motorization,
      displacement: decodedData.displacement || prev.displacement,
      vehicle_type: decodedData.vehicle_type || prev.vehicle_type,
      name: prev.name || [decodedData.brand, decodedData.model].filter(Boolean).join(' '),
    }));
    setBrandSearch(decodedData.brand || '');
    setModelSearch(decodedData.model || '');
    setVin('');
    setDecodedData(null);
  };

  // === Plate decode ===
  const handlePlateChange = (e) => {
    setLicensePlate(e.target.value.toUpperCase());
    setPlateDecodedData(null);
    setPlateError(null);
  };

  const decodePlate = async () => {
    if (!licensePlate.trim()) { setPlateError('Veuillez entrer une plaque valide (AB-123-CD)'); return; }
    setPlateLoading(true);
    setPlateError(null);
    setPlateDecodedData(null);
    try {
      const response = await api.decodeLicensePlate(licensePlate, formData.vehicle_type);
      setPlateDecodedData(response.data);
    } catch (err) {
      setPlateError(err.response?.data?.detail || 'Échec du décodage plaque.');
    } finally {
      setPlateLoading(false);
    }
  };

  const applyPlateDecodedData = () => {
    if (!plateDecodedData) return;
    setFormData((prev) => ({
      ...prev,
      brand: plateDecodedData.brand || prev.brand,
      model: plateDecodedData.model || prev.model,
      year: plateDecodedData.year || prev.year,
      motorization: plateDecodedData.motorization || prev.motorization,
      displacement: plateDecodedData.displacement || prev.displacement,
      vehicle_type: plateDecodedData.vehicle_type || prev.vehicle_type,
      registration_date: plateDecodedData.registration_date || prev.registration_date,
      name: prev.name || [plateDecodedData.brand, plateDecodedData.model].filter(Boolean).join(' '),
    }));
    setBrandSearch(plateDecodedData.brand || '');
    setModelSearch(plateDecodedData.model || '');
    setPlateDecodedData(null);
  };

  // === Category ===
  const applySuggestedCategory = () => {
    if (suggestedCategory) {
      setFormData((prev) => ({ ...prev, range_category: suggestedCategory }));
    }
  };

  // === Photo upload ===
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  // === Submit ===
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      
      // Validate registration_date is set
      if (!formData.registration_date) {
        setError('La date de mise en circulation est obligatoire');
        setLoading(false);
        return;
      }
      
      // Extract year from registration_date (already done in handleChange, but ensure it's correct)
      const regDate = new Date(formData.registration_date);
      const year = regDate.getFullYear();
      
      const payload = {
        ...formData,
        year: year, // Ensure year is extracted from registration_date
        registration_date: formData.registration_date ? new Date(formData.registration_date).toISOString() : null,
        displacement: formData.displacement ? parseInt(formData.displacement) : null,
        purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
        service_interval_km: formData.service_interval_km ? parseInt(formData.service_interval_km) : null,
        service_interval_months: formData.service_interval_months ? parseInt(formData.service_interval_months) : null,
      };
      
      // Create vehicle
      const vehicleResponse = await api.createVehicle(payload);
      const createdVehicleId = vehicleResponse.data.id;
      
      // Upload photo if provided
      if (photoFile && createdVehicleId) {
        try {
          await api.uploadVehiclePhoto(createdVehicleId, photoFile);
        } catch (photoErr) {
          console.warn('Photo upload failed but vehicle was created:', photoErr);
          // Don't force error - vehicle was created successfully
        }
      }
      
      onSubmit();
    } catch (err) {
      setError(err.response?.data?.detail || 'Impossible de créer le véhicule');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const motorizations = {
    car: ['essence', 'diesel', 'hybrid', 'electric'],
    motorcycle: ['thermal', 'hybrid', 'electric'],
  };

  useEffect(() => {
    const allowed = motorizations[formData.vehicle_type] || [];
    if (!allowed.includes(formData.motorization)) {
      setFormData((prev) => ({ ...prev, motorization: allowed[0] || '' }));
    }
  }, [formData.vehicle_type]);

  // Build tabs dynamically
  const tabs = [
    { key: 'manual', label: '✏️ Manuel' },
    { key: 'vin', label: '🔍 VIN (gratuit)' },
  ];
  if (plateApiAvailable) {
    tabs.push({ key: 'plate', label: '🇫🇷 Plaque FR' });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-lg font-bold mb-4">Ajouter un nouveau véhicule</h3>

      {error && (
        <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: '6px', color: 'var(--danger)' }} className="p-3 text-sm">
          {error}
        </div>
      )}

      {/* Mode selector */}
      <div className="flex gap-2 rounded-lg card p-1" style={{ background: 'var(--bg-base)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setCreationMode(tab.key)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              creationMode === tab.key ? 'btn btn-primary' : 'hover:opacity-70'
            }`}
            style={creationMode !== tab.key ? { color: 'var(--text-2)' } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* VIN decode section */}
      {creationMode === 'vin' && (
        <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
          <h4 className="font-semibold text-sm mb-1 text-purple-900">🔍 Décodage VIN — 100% gratuit</h4>
          <p className="text-xs mb-3" style={{ color: 'var(--text-2)' }}>
            Le VIN (17 caractères) se trouve sur la carte grise (case E) ou sur le pare-brise.
            API publique NHTSA, sans inscription.
          </p>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={vin}
              onChange={handleVinChange}
              placeholder="Exemple: VF1RFE00X56789012"
              maxLength="17"
              className="input-field flex-1 uppercase font-mono"
            />
            <button
              type="button"
              onClick={decodeVin}
              disabled={vinLoading || !vin.trim()}
              className="btn btn-primary text-sm"
            >
              {vinLoading ? '⏳...' : '🔎 Décoder'}
            </button>
          </div>
          {vinError && (
            <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: '6px', color: 'var(--danger)' }} className="p-2 text-xs">{vinError}</div>
          )}
          {decodedData && (
            <div className="p-3 bg-white border border-green-300 rounded-lg">
              <div className="text-sm font-medium mb-2" style={{ color: 'var(--success)' }}>✓ Données décodées</div>
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div><span className="font-medium">Marque:</span> {decodedData.brand}</div>
                <div><span className="font-medium">Modèle:</span> {decodedData.model || '—'}</div>
                <div><span className="font-medium">Année:</span> {decodedData.year || '—'}</div>
                <div><span className="font-medium">Motorisation:</span> {decodedData.motorization}</div>
                {decodedData.displacement && (
                  <div><span className="font-medium">Cylindrée:</span> {decodedData.displacement} cc</div>
                )}
                {decodedData.cylinders && (
                  <div><span className="font-medium">Cylindres:</span> {decodedData.cylinders}</div>
                )}
                {decodedData.power_hp && (
                  <div><span className="font-medium">Puissance:</span> {decodedData.power_hp} ch</div>
                )}
                {decodedData.vehicle_type && (
                  <div><span className="font-medium">Type:</span> {decodedData.vehicle_type === 'motorcycle' ? '🏍️ Moto' : '🚗 Voiture'}</div>
                )}
              </div>
              <button
                type="button"
                onClick={applyDecodedData}
                className="btn btn-primary w-full text-sm"
              >
                ✓ Utiliser ces données
              </button>
            </div>
          )}
        </div>
      )}

      {/* Plate decode section (only when API configured) */}
      {creationMode === 'plate' && (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-lg">
          <h4 className="font-semibold text-sm mb-3 text-blue-900">🇫🇷 Décodage plaque</h4>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={licensePlate}
              onChange={handlePlateChange}
              placeholder="Exemple: AB-123-CD"
              maxLength="10"
              className="input-field flex-1 uppercase font-mono tracking-wider"
            />
            <button
              type="button"
              onClick={decodePlate}
              disabled={plateLoading || !licensePlate.trim()}
              className="btn btn-primary text-sm"
            >
              {plateLoading ? '⏳...' : '🔎 Décoder'}
            </button>
          </div>
          {plateError && (
            <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: '6px', color: 'var(--danger)' }} className="p-2 text-xs">{plateError}</div>
          )}
          {plateDecodedData && (
            <div className="card p-3">
              <div className="text-sm font-medium" style={{ color: 'var(--success)' }}>✓ Données plaque récupérées</div>
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div><span className="font-medium">Marque:</span> {plateDecodedData.brand}</div>
                <div><span className="font-medium">Modèle:</span> {plateDecodedData.model}</div>
                {plateDecodedData.sra_commercial && plateDecodedData.sra_commercial !== plateDecodedData.model && (
                  <div><span className="font-medium">Version:</span> {plateDecodedData.sra_commercial}</div>
                )}
                <div><span className="font-medium">Type:</span> {plateDecodedData.vehicle_type === 'motorcycle' ? '🏍️ Moto' : '🚗 Voiture'}</div>
                <div><span className="font-medium">MEC:</span> {plateDecodedData.registration_date || '—'}</div>
                <div><span className="font-medium">Année:</span> {plateDecodedData.year || '—'}</div>
                <div><span className="font-medium">Motorisation:</span> {plateDecodedData.motorization || '—'}</div>
                <div><span className="font-medium">Cylindrée:</span> {plateDecodedData.displacement ? `${plateDecodedData.displacement} cc` : '—'}</div>
                {plateDecodedData.fiscal_power && (
                  <div><span className="font-medium">Puissance:</span> {plateDecodedData.fiscal_power} CV fiscaux</div>
                )}
                {plateDecodedData.cylinders && (
                  <div><span className="font-medium">Cylindres:</span> {plateDecodedData.cylinders}</div>
                )}
                {plateDecodedData.vin && (
                  <div className="col-span-2"><span className="font-medium">VIN:</span> <span className="font-mono text-[10px]">{plateDecodedData.vin}</span></div>
                )}
              </div>
              <button
                type="button"
                onClick={applyPlateDecodedData}
                className="btn btn-primary w-full text-sm"
              >
                ✓ Utiliser ces données
              </button>
            </div>
          )}
        </div>
      )}

      {/* Manual Entry Section */}
      <div className={creationMode !== 'manual' ? 'border-t pt-4' : ''}>
        {creationMode !== 'manual' && (
          <h4 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-2)' }}>Compléter / modifier manuellement</h4>
        )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Type</label>
          <select
            name="vehicle_type"
            value={formData.vehicle_type}
            onChange={(e) => {
              console.debug('[VehicleForm] vehicle_type change:', {
                old_value: formData.vehicle_type,
                new_value: e.target.value,
                event_target_value: e.target.value,
              });
              handleChange(e);
              setBrandSearch('');
              setModelSearch('');
              setFormData((prev) => ({ ...prev, vehicle_type: e.target.value, brand: '', model: '', displacement: '', service_interval_km: '' }));
            }}
            className="input-field"
          >
            <option value="car">Voiture</option>
            <option value="motorcycle">Moto</option>
          </select>
        </div>

        {/* Brand autocomplete */}
        <div className="relative">
          <label className="block text-sm font-medium mb-1">Marque</label>
          <input
            type="text"
            value={brandSearch || formData.brand}
            onChange={(e) => {
              setBrandSearch(e.target.value);
              setFormData((prev) => ({ ...prev, brand: e.target.value, model: '' }));
              setModelSearch('');
              setShowBrandDropdown(true);
            }}
            onFocus={() => setShowBrandDropdown(true)}
            onBlur={() => setTimeout(() => setShowBrandDropdown(false), 200)}
            placeholder="Tapez pour rechercher..."
            required
            className="input-field"
            autoComplete="off"
          />
          {showBrandDropdown && filteredBrands.length > 0 && (
            <div className="absolute z-20 w-full mt-1 card max-h-48 overflow-y-auto" style={{ padding: '0' }}>
              {filteredBrands.map((brand) => (
                <button
                  key={brand}
                  type="button"
                  onMouseDown={() => selectBrand(brand)}
                  className="w-full text-left px-3 py-2 text-sm transition-colors hover:opacity-70" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-1)' }}
                >
                  {brand}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Model autocomplete */}
        <div className="relative">
          <label className="block text-sm font-medium mb-1">Modèle</label>
          <input
            type="text"
            value={modelSearch || formData.model}
            onChange={(e) => {
              setModelSearch(e.target.value);
              setFormData((prev) => ({ ...prev, model: e.target.value }));
              setShowModelDropdown(true);
            }}
            onFocus={() => setShowModelDropdown(true)}
            onBlur={() => setTimeout(() => setShowModelDropdown(false), 200)}
            placeholder={availableModels.length > 0 ? 'Tapez pour rechercher...' : 'ex: 308'}
            required
            className="input-field"
            autoComplete="off"
          />
          {showModelDropdown && filteredModels.length > 0 && (
            <div className="absolute z-20 w-full mt-1 card max-h-48 overflow-y-auto" style={{ padding: '0' }}>
              {filteredModels.map((model) => (
                <button
                  key={model}
                  type="button"
                  onMouseDown={() => selectModel(model)}
                  className="w-full text-left px-3 py-2 text-sm transition-colors hover:opacity-70" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-1)' }}
                >
                  {model}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Nom</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="ex: Ma voiture du quotidien"
            required
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Mise en circulation (MEC) *</label>
          <input
            type="date"
            name="registration_date"
            value={formData.registration_date}
            onChange={handleChange}
            required
            className="input-field"
          />
          {formData.year && (
            <div className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>
              Année extraite: <strong>{formData.year}</strong>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Motorisation</label>
          <select
            name="motorization"
            value={formData.motorization}
            onChange={handleChange}
            className="input-field"
          >
            {motorizations[formData.vehicle_type].map((m) => {
              const motorLabels = {
                'essence': 'Essence',
                'diesel': 'Diesel',
                'hybrid': 'Hybride',
                'electric': 'Électrique',
                'thermal': 'Thermique',
              };
              return (
                <option key={m} value={m}>
                  {motorLabels[m] || m.charAt(0).toUpperCase() + m.slice(1)}
                </option>
              );
            })}
          </select>
        </div>

        {formData.vehicle_type === 'motorcycle' && (
          <div>
            <label className="block text-sm font-medium mb-1">Cylindrée (cc)*</label>
            <input
              type="number"
              name="displacement"
              value={formData.displacement}
              onChange={handleChange}
              placeholder="ex: 125"
              required
              className="input-field"
            />
          </div>
        )}

        {formData.vehicle_type === 'motorcycle' && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Intervalle révision (km)</label>
              <input
                type="number"
                name="service_interval_km"
                value={formData.service_interval_km}
                onChange={handleChange}
                placeholder={brandDefaults ? `Défaut: ${brandDefaults.km} km` : 'ex: 10000'}
                min="1000"
                max="100000"
                step="500"
                className="input-field"
              />
              {brandDefaults && formData.service_interval_km && formData.service_interval_km !== brandDefaults.km && (
                <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: '4px', color: 'var(--warning)' }} className="p-2 mt-1 text-xs flex items-center gap-1">
                  ⚠️ Défaut {formData.brand}: {brandDefaults.km} km
                  <button type="button" className="ml-auto underline text-xs" onClick={() => setFormData((prev) => ({ ...prev, service_interval_km: brandDefaults.km }))}>
                    Restaurer
                  </button>
                </div>
              )}
            </div>

            <div className="col-span-full">
              <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: '6px' }} className="p-3 text-xs" title="Intervalles d'entretien prévisionnel">
                <div className="font-medium mb-1" style={{ color: 'var(--accent)' }}>ℹ️ Entretiens prévisionnels</div>
                <ul className="space-y-0.5" style={{ color: 'var(--text-2)' }}>
                  <li>🔧 <strong>Révision (km)</strong> : tous les {formData.service_interval_km || brandDefaults?.km || '?'} km — vidange, filtres, contrôles</li>
                  <li>📅 <strong>Entretien annuel</strong> : tous les 12 mois — contrôle simplifié si le kilométrage n'est pas atteint</li>
                  <li>🔩 <strong>Soupapes</strong> : tous les {((formData.service_interval_km || brandDefaults?.km || 0) * 2) || '?'} km — vérification jeu aux soupapes (toutes les 2 révisions)</li>
                  <li>🛢️ <strong>Purge frein</strong> : tous les 2 ans · <strong>Liquide refroidissement</strong> : tous les 3 ans · <strong>Fourche</strong> : tous les 3 ans</li>
                </ul>
              </div>
            </div>
          </>
        )}

        {formData.vehicle_type === 'car' && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Cylindrée (cc)</label>
              <input
                type="number"
                name="displacement"
                value={formData.displacement}
                onChange={handleChange}
                placeholder="ex: 1600 (optionnel)"
                className="input-field"
              />
            </div>
            <div className="col-span-full">
              <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: '6px' }} className="p-3 text-xs" title="Intervalles d'entretien prévisionnel">
                <div className="font-medium mb-1" style={{ color: 'var(--accent)' }}>ℹ️ Entretiens prévisionnels auto</div>
                <ul className="space-y-0.5" style={{ color: 'var(--text-2)' }}>
                  <li>🛢️ <strong>Vidange + filtre</strong> : ~10 000 km / 1 an</li>
                  <li>💨 <strong>Filtre à air</strong> : ~20 000 km / 1 an</li>
                  <li>🍃 <strong>Filtre habitacle</strong> : ~15 000 km / 1 an</li>
                  <li>⛽ <strong>Filtre gasoil</strong> : ~20 000 km / 2 ans (diesel) · <strong>Filtre essence</strong> : ~50 000 km / 4 ans</li>
                  <li>🔌 <strong>Bougies</strong> : ~30 000 km (essence/hybride)</li>
                  <li>🛞 <strong>Purge frein</strong> : tous les 2 ans</li>
                  <li>⏱️ <strong>Courroie distribution</strong> : ~80 000 km / 6 ans</li>
                  <li>❄️ <strong>Liquide refroidissement</strong> : ~60 000 km / 4 ans</li>
                  <li>⚙️ <strong>Liquide transmission</strong> : ~80 000 km / 4 ans</li>
                </ul>
              </div>
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Catégorie</label>
          <div className="space-y-2">
            {suggestedCategory && suggestedCategory !== formData.range_category && (
              <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: '6px' }} className="p-2 flex items-center justify-between gap-2">
                <div className="text-xs" style={{ color: 'var(--accent)' }}>💡 {categoryReason}</div>
                <button
                  type="button"
                  onClick={applySuggestedCategory}
                  className="btn btn-primary text-xs whitespace-nowrap"
                >
                  Appliquer
                </button>
              </div>
            )}
            <select
              name="range_category"
              value={formData.range_category}
              onChange={handleChange}
              className="input-field"
            >
              {formData.vehicle_type === 'motorcycle' ? (
                <>
                  <option value="accessible">♻️ Accessible (Honda, Yamaha, Kawasaki)</option>
                  <option value="generalist">🔧 Généraliste (Ducati, KTM, Triumph)</option>
                  <option value="premium">👑 Premium (BMW, Harley-Davidson, MV Agusta)</option>
                </>
              ) : (
                <>
                  <option value="accessible">♻️ Accessible (Dacia, Peugeot, Toyota)</option>
                  <option value="generalist">🔧 Généraliste (VW, Ford, Renault)</option>
                  <option value="premium">👑 Premium (BMW, Mercedes, Audi)</option>
                </>
              )}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Kilométrage actuel (km)</label>
          <input
            type="number"
            name="current_mileage"
            value={formData.current_mileage}
            onChange={handleChange}
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Prix d'achat (€)</label>
          <input
            type="number"
            name="purchase_price"
            value={formData.purchase_price}
            onChange={handleChange}
            placeholder="Optionnel"
            className="input-field"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium mb-1">Remarques</label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          placeholder="Notes additionnelles..."
          rows="3"
          className="input-field"
        />
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium mb-2">📸 Photo du véhicule (optionnel)</label>
        {photoPreview ? (
          <div className="relative">
            <img src={photoPreview} alt="Aperçu" className="w-full h-48 object-cover rounded-lg" style={{ border: '1px solid var(--border)' }} />
            <button
              type="button"
              onClick={removePhoto}
              className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
              title="Supprimer la photo"
            >
              ✕
            </button>
          </div>
        ) : (
          <label className="block w-full p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors text-center" style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="hidden"
            />
            <div className="text-sm" style={{ color: 'var(--text-2)' }}>
              📁 Cliquez ou déposez une image
            </div>
          </label>
        )}
      </div>

      </div>

      {/* Info banner when plate not available */}
      {!plateApiAvailable && creationMode === 'manual' && (
        <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: '6px', color: 'var(--warning)' }} className="p-3 text-xs">
          <strong>💡 Astuce :</strong> Utilisez le mode <strong>VIN (gratuit)</strong> pour auto-remplir les données du véhicule.
          Le VIN se trouve sur la carte grise (case E) ou sur le pare-brise côté conducteur.
          {' '}Pour activer le décodage par plaque (10 req/mois gratuit), créez un compte sur{' '}
          <a href="https://rapidapi.com/api-plaque-immatriculation-siv-api-plaque-immatriculation-siv-default/api/api-plaque-immatriculation-siv/" target="_blank" rel="noopener noreferrer" className="underline font-medium">RapidAPI</a>
          {' '}et ajoutez <code style={{ background: 'rgba(247, 184, 75, 0.2)', padding: '0.2rem 0.4rem', borderRadius: '3px' }}>RAPIDAPI_KEY</code> dans vos variables d'environnement.
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary flex-1"
        >
          {loading ? 'Création...' : 'Créer le véhicule'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary flex-1"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
