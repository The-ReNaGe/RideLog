import React, { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../lib/api';

export default function FuelStations() {
	const [city, setCity] = useState('');
	const [fuelType, setFuelType] = useState('');
	const [maxDistance, setMaxDistance] = useState(20);
	const [stations, setStations] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const [searched, setSearched] = useState(false);
	const [fuelTypes, setFuelTypes] = useState([]);
	const [searchInfo, setSearchInfo] = useState(null);
	const [citySuggestions, setCitySuggestions] = useState([]);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [suggestionsLoading, setSuggestionsLoading] = useState(false);
	const justSelectedRef = useRef(false);  // Flag to prevent reopening dropdown after selection

	// Load available fuel types on mount
	useEffect(() => {
		const loadFuelTypes = async () => {
			try {
				const res = await api.request('GET', '/fuel-stations/fuel-types');
				setFuelTypes(res.data?.fuel_types || []);
			} catch (err) {
				console.error('Failed to load fuel types', err);
			}
		};
		loadFuelTypes();
	}, []);

	// Debounced city suggestions (300ms delay to reduce API calls)
	useEffect(() => {
		const timer = setTimeout(async () => {
			// Don't reopen suggestions if we just selected a city
			if (justSelectedRef.current) {
				justSelectedRef.current = false;
				return;
			}

			if (city.length >= 2) {
				setSuggestionsLoading(true);
				try {
					const res = await api.request('GET', `/fuel-stations/city-suggestions?q=${encodeURIComponent(city)}`);
					setCitySuggestions(res.data?.suggestions?.slice(0, 3) || []);
					setShowSuggestions(true);
				} catch (err) {
					console.error('Failed to load city suggestions', err);
					setCitySuggestions([]);
				} finally {
					setSuggestionsLoading(false);
				}
			} else {
				setCitySuggestions([]);
				setShowSuggestions(false);
			}
		}, 300); // 300ms debounce

		return () => clearTimeout(timer);
	}, [city]);

	const handleCityChange = (value) => {
		setCity(value);
	};

	const selectCity = (suggestion) => {
		justSelectedRef.current = true;  // Prevent dropdown from reopening
		setCity(suggestion.name);
		setShowSuggestions(false);
		setCitySuggestions([]);
	};

	const handleSearch = async (e) => {
		e.preventDefault();
		
		if (!city.trim()) {
			setError('Veuillez entrer une ville');
			return;
		}

		try {
			setLoading(true);
			setError(null);
			setShowSuggestions(false);
			
			const params = new URLSearchParams({
				city: city.trim(),
				max_distance: maxDistance,
				limit: 50,
			});
			
			if (fuelType) {
				params.append('fuel_type', fuelType);
			}

			const res = await api.request('GET', `/fuel-stations/search?${params}`);
			setStations(res.data?.stations || []);
			setSearchInfo({
				city: res.data?.city,
				fuel_type: res.data?.fuel_type,
				total_found: res.data?.total_found,
				message: res.data?.message,
				source: res.data?.source,
			});
			setSearched(true);
		} catch (err) {
			setError(err?.response?.data?.detail || 'Erreur lors de la recherche');
			setStations([]);
		} finally {
			setLoading(false);
		}
	};

	const fuelTypeLabel = fuelType 
		? fuelTypes.find(f => f.code === fuelType)?.label || fuelType
		: '';

	// Get minimum price from a station
	const getMinPrice = (station) => {
		let minPrice = null;
		for (const fuel_info of Object.values(station.fuels)) {
			if (fuel_info.price !== null && fuel_info.price !== undefined) {
				if (minPrice === null || fuel_info.price < minPrice) {
					minPrice = fuel_info.price;
				}
			}
		}
		return minPrice;
	};

	return (
		<div>
			{/* Header */}
			<div style={{ marginBottom: '2rem' }}>
				<h1 className="text-3xl font-bold mb-1" style={{ color: 'var(--text-1)' }}>⛽ Stations Essence</h1>
				<p className="text-sm" style={{ color: 'var(--text-2)' }}>Trouvez les stations les plus proches et moins chères en France</p>
			</div>

			{/* Search Form */}
			<div className="card p-6">
				<h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-1)' }}>Rechercher des stations</h3>
				<form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-5 gap-4">
					<div className="relative">
						<label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-1)' }}>Ville/Commune</label>
						<input
							type="text"
							value={city}
							onChange={(e) => handleCityChange(e.target.value)}
							placeholder="Ex: Paris, Lyon..."
							className="input-field"
							autoComplete="off"
						/>
						{/* City suggestions dropdown */}
						{showSuggestions && citySuggestions.length > 0 && (
							<div 
								className="absolute top-full left-0 right-0 mt-1 z-50 rounded border shadow-lg"
								style={{ 
									background: 'var(--bg-primary)',
									borderColor: 'var(--border)',
									maxHeight: '140px',
									overflowY: 'auto',
									opacity: 1,
								}}
							>
								{citySuggestions.map((suggestion, idx) => (
									<button
										key={idx}
										type="button"
										onClick={() => selectCity(suggestion)}
										className="w-full text-left px-4 py-2.5 transition-colors"
										style={{ 
											background: 'var(--bg-primary)',
											color: 'var(--text-1)',
											borderBottom: idx < citySuggestions.length - 1 ? '1px solid var(--border-light)' : 'none',
										}}
										onMouseEnter={(e) => e.target.style.background = 'rgba(108, 138, 247, 0.25)'}
										onMouseLeave={(e) => e.target.style.background = 'var(--bg-primary)'}
									>
										<div className="text-sm font-bold">{suggestion.name}</div>
										<div className="text-xs" style={{ color: 'var(--text-2)' }}>{suggestion.display}</div>
									</button>
								))}
							</div>
						)}
					</div>

					<div>
						<label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-1)' }}>Type de carburant</label>
						<select
							value={fuelType}
							onChange={(e) => setFuelType(e.target.value)}
							className="input-field"
						>
							<option value="">Tous</option>
							{fuelTypes.map((type) => (
								<option key={type.code} value={type.code}>
									{type.label}
								</option>
							))}
						</select>
					</div>

					<div>
						<label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-1)' }}>Distance (km)</label>
						<input
							type="number"
							min="5"
							max="100"
							value={maxDistance}
							onChange={(e) => setMaxDistance(parseInt(e.target.value))}
							className="input-field"
						/>
					</div>

					<div className="md:col-span-2 flex items-end gap-2">
						<button
							type="submit"
							disabled={loading}
							className="btn btn-primary w-full"
						>
							{loading ? 'Recherche en cours...' : 'Rechercher'}
						</button>
					</div>
				</form>
			</div>

			{/* Results */}
			{error && (
				<div className="mt-4 p-3 rounded text-sm" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--danger)' }}>
					{error}
				</div>
			)}

			{searched && !error && (
				<div className="mt-6">
					{/* Info message */}
					<div className="mb-4 p-4 rounded text-sm" style={{ background: 'rgba(108, 138, 247, 0.15)', border: '1px solid rgba(108, 138, 247, 0.3)', color: 'var(--text-1)' }}>
						ℹ️ {searchInfo?.message || 'Les stations affichées proviennent de OpenStreetMap et prix-carburants.gouv.fr'}
					</div>

					<div className="mb-4 p-4 card">
						<div className="grid grid-cols-3 gap-4">
							<div>
								<div className="text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Ville recherchée</div>
								<div className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>{searchInfo?.city}</div>
							</div>
							<div>
								<div className="text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Type de carburant</div>
								<div className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>
									{fuelTypeLabel || 'Tout'}
								</div>
							</div>
							<div>
								<div className="text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Stations trouvées</div>
								<div className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>{searchInfo?.total_found}</div>
							</div>
						</div>
					</div>

					{stations.length > 0 ? (
						<div className="space-y-3">
							{stations.map((station, idx) => (
								<div key={idx} className="card p-4">
									{/* Header */}
									<div className="flex justify-between items-start mb-3">
										<div className="flex-1">
											<div className="flex items-center gap-2 mb-1">
												<h4 className="font-bold" style={{ color: 'var(--text-1)' }}>{station.name}</h4>
												{station.brand && station.brand !== station.name && (
													<span className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(108, 138, 247, 0.15)', color: 'var(--text-2)' }}>
														{station.brand}
													</span>
												)}
											</div>
											<p className="text-sm" style={{ color: 'var(--text-2)' }}>
												{station.address}
											</p>
											{station.city && (
												<p className="text-xs" style={{ color: 'var(--text-2)' }}>
													{station.city}
												</p>
											)}
										</div>
										<div className="text-right ml-4">
											{getMinPrice(station) !== null ? (
												<>
													<div className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Prix min</div>
													<div className="text-2xl font-bold" style={{ color: 'var(--success)' }}>
														{getMinPrice(station).toFixed(3)}€
													</div>
													<div className="text-xs" style={{ color: 'var(--text-2)' }}>
														{station.distance_km} km
													</div>
												</>
											) : (
												<>
													<div className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>Distance</div>
													<div className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>
														{station.distance_km} km
													</div>
												</>
											)}
										</div>
									</div>

									{/* Fuels */}
									{Object.keys(station.fuels).length > 0 ? (
										<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-light)' }}>
											{Object.entries(station.fuels).map(([type, fuel_info]) => {
												const label = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
												const price = fuel_info.price;
												const available = fuel_info.available;
												const updated = fuel_info.updated ? new Date(fuel_info.updated).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
												
												return (
													<div 
														key={type} 
														className="p-3 rounded text-center"
														style={{ 
															background: available ? 'rgba(34, 197, 94, 0.08)' : 'rgba(107, 114, 128, 0.08)',
															border: available ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid rgba(107, 114, 128, 0.2)'
														}}
													>
														<div className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
															{label}
														</div>
														{price !== null && price !== undefined ? (
															<div className="text-lg font-bold mt-1" style={{ color: available ? 'var(--success)' : 'var(--text-2)' }}>
																{price.toFixed(3)}€
															</div>
														) : (
															<div className="text-sm mt-2" style={{ color: 'var(--text-2)' }}>
																-
															</div>
														)}
														<div className="text-xs mt-1" style={{ color: available ? 'var(--success)' : 'var(--danger)' }}>
															{available ? '✓ Disponible' : '✗ Indisponible'}
														</div>
														{updated && (
															<div className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>
																{updated}
															</div>
														)}
													</div>
												);
											})}
										</div>
									) : (
										<div className="text-sm text-center mt-3 pt-3 border-t" style={{ color: 'var(--text-2)', borderColor: 'var(--border-light)' }}>
											Type de carburant inconnu
										</div>
									)}
								</div>
							))}
						</div>
					) : (
						<div className="card p-6 text-center">
							<p className="text-sm" style={{ color: 'var(--text-2)' }}>
								Aucune station trouvée dans cette zone
							</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
