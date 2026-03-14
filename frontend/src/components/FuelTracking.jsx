import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

const MONTH_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const MONTH_FULL = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function formatMonth(ym) {
	const [y, m] = ym.split('-');
	return `${MONTH_SHORT[parseInt(m, 10) - 1]} ${y}`;
}

function BarChart({ data, valueKey, color, unit, formatValue, avgValue, prevComparison }) {
	if (!data || data.length === 0) return <p className="text-sm" style={{ color: 'var(--text-3)' }}>Pas encore de données</p>;
	const maxVal = Math.max(...data.map(d => d[valueKey] || 0), 1);
	const fmt = formatValue || (v => `${v}`);

	return (
		<div>
			{/* Average + comparison header */}
			{(avgValue || prevComparison) && (
				<div style={{ display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap' }}>
					{avgValue && (
						<span style={{ fontSize: 12, color: 'var(--text-2)' }}>
							Moyenne : <strong style={{ color: 'var(--text-1)' }}>{fmt(avgValue)}{unit}</strong>
						</span>
					)}
					{prevComparison && (
						<span style={{ fontSize: 12, color: prevComparison.pct >= 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
							{prevComparison.pct >= 0 ? '↑' : '↓'} {Math.abs(prevComparison.pct)}% vs {prevComparison.label}
						</span>
					)}
				</div>
			)}
			<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
				{data.map((d, i) => {
					const val = d[valueKey] || 0;
					const pct = Math.max((val / maxVal) * 100, 2);
					return (
						<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
							<div style={{ width: 55, fontSize: 11, color: 'var(--text-3)', textAlign: 'right', flexShrink: 0 }}>
								{formatMonth(d.month)}
							</div>
							<div style={{ flex: 1, background: 'var(--border)', borderRadius: 4, height: 22, position: 'relative', overflow: 'hidden' }}>
								<div style={{
									width: `${pct}%`, height: '100%', background: color, borderRadius: 4,
									transition: 'width 0.4s ease', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6,
								}}>
									{pct > 25 && <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>{fmt(val)}{unit}</span>}
								</div>
								{pct <= 25 && <span style={{ position: 'absolute', left: `calc(${pct}% + 6px)`, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>{fmt(val)}{unit}</span>}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function MiniLineChart({ points, valueKey, color, unit, formatValue, avgValue }) {
	const [hover, setHover] = useState(null);

	if (!points || points.length < 2) return <p className="text-sm" style={{ color: 'var(--text-3)' }}>Minimum 2 pleins nécessaires</p>;

	const width = 300;
	const height = 120;
	const pad = { top: 20, right: 30, bottom: 20, left: 30 };
	const w = width - pad.left - pad.right;
	const h = height - pad.top - pad.bottom;
	const vals = points.map(p => p[valueKey]);
	const minV = Math.min(...vals) * 0.9;
	const maxV = Math.max(...vals) * 1.1;
	const rangeV = maxV - minV || 1;
	const fmt = formatValue || (v => `${v}`);

	const pts = vals.map((v, i) => {
		const x = pad.left + (i / (vals.length - 1)) * w;
		const y = pad.top + h - ((v - minV) / rangeV) * h;
		return { x, y, v, date: points[i].date, mileage: points[i].mileage, distance: points[i].distance };
	});
	const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

	// Average line
	const avgY = avgValue != null ? pad.top + h - ((avgValue - minV) / rangeV) * h : null;

	return (
		<div style={{ position: 'relative' }}>
			<svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', maxWidth: width, height: 'auto' }}
				onMouseLeave={() => setHover(null)}>
				{/* Average line */}
				{avgY != null && (
					<>
						<line x1={pad.left} y1={avgY} x2={pad.left + w} y2={avgY}
							stroke={color} strokeWidth={1} strokeDasharray="6 3" opacity={0.4} />
						<text x={pad.left + w + 2} y={avgY + 3} fontSize={8} fill={color} opacity={0.6}>moy</text>
					</>
				)}
				{/* Data line */}
				<path d={pathD} fill="none" stroke={color} strokeWidth={2} />
				{pts.map((p, i) => (
					<g key={i}>
						<circle cx={p.x} cy={p.y} r={hover === i ? 5 : 3} fill={color}
							style={{ cursor: 'pointer', transition: 'r 0.15s' }} />
						{/* Invisible larger hit area */}
						<circle cx={p.x} cy={p.y} r={12} fill="transparent"
							onMouseEnter={() => setHover(i)} />
						{i === 0 && hover !== 0 && (
							<text x={p.x} y={p.y - 8} textAnchor="start" fontSize={10} fill="var(--text-2)">{fmt(p.v)}{unit}</text>
						)}
						{i === pts.length - 1 && hover !== pts.length - 1 && (
							<text x={p.x} y={p.y - 8} textAnchor="end" fontSize={10} fill="var(--text-2)">{fmt(p.v)}{unit}</text>
						)}
					</g>
				))}
				{pts.length > 0 && (
					<>
						<text x={pts[0].x} y={height - 2} textAnchor="start" fontSize={9} fill="var(--text-3)">{pts[0].date}</text>
						<text x={pts[pts.length - 1].x} y={height - 2} textAnchor="end" fontSize={9} fill="var(--text-3)">{pts[pts.length - 1].date}</text>
					</>
				)}
				{/* Hover tooltip in SVG */}
				{hover != null && pts[hover] && (
					<g>
						<rect
							x={Math.max(2, Math.min(pts[hover].x - 45, width - 92))}
							y={Math.max(2, pts[hover].y - 38)}
							width={90} height={28} rx={4}
							fill="var(--bg-2, #1a1a2e)" stroke="var(--border)" strokeWidth={0.5} opacity={0.95}
						/>
						<text
							x={Math.max(2, Math.min(pts[hover].x - 45, width - 92)) + 45}
							y={Math.max(2, pts[hover].y - 38) + 12}
							textAnchor="middle" fontSize={9} fontWeight={700} fill={color}>
							{fmt(pts[hover].v)}{unit}
						</text>
						<text
							x={Math.max(2, Math.min(pts[hover].x - 45, width - 92)) + 45}
							y={Math.max(2, pts[hover].y - 38) + 23}
							textAnchor="middle" fontSize={8} fill="var(--text-3)">
							{pts[hover].date}{pts[hover].distance ? ` · ${pts[hover].distance} km` : ''}
						</text>
					</g>
				)}
			</svg>
		</div>
	);
}

export default function FuelTracking({ vehicleId, onFuelAdded }) {
	const [logs, setLogs] = useState([]);
	const [stats, setStats] = useState(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(null);
	const [success, setSuccess] = useState(null);
	const [deletingId, setDeletingId] = useState(null);
	const [showForm, setShowForm] = useState(false);
	const [showHistory, setShowHistory] = useState(false);
	const [editingLog, setEditingLog] = useState(null);

	const [formData, setFormData] = useState({
		fill_date: new Date().toISOString().split('T')[0],
		mileage_at_fill: '',
		total_cost: '',
		price_per_liter: '',
		station: '',
		notes: '',
	});

	useEffect(() => {
		loadData();
	}, [vehicleId]);

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			const [logsRes, statsRes] = await Promise.all([
				api.getFuelLogs(vehicleId),
				api.getFuelStats(vehicleId),
			]);
			setLogs(logsRes.data || []);
			setStats(statsRes.data?.stats || null);
			setError(null);
		} catch (err) {
			setError('Impossible de charger les données carburant');
		} finally {
			setLoading(false);
		}
	}, [vehicleId]);

	const handleChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const resetForm = () => {
		setFormData({
			fill_date: new Date().toISOString().split('T')[0],
			mileage_at_fill: '',
			total_cost: '',
			price_per_liter: '',
			station: '',
			notes: '',
		});
		setEditingLog(null);
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		try {
			setSaving(true);
			setError(null);

			const payload = {
				fill_date: new Date(formData.fill_date).toISOString(),
				mileage_at_fill: parseInt(formData.mileage_at_fill, 10),
				total_cost: parseFloat(formData.total_cost),
				price_per_liter: parseFloat(formData.price_per_liter),
				station: formData.station || null,
				notes: formData.notes || null,
			};
			await api.createFuelLog(vehicleId, payload);
			setSuccess('Plein enregistré !');

			resetForm();
			setShowForm(false);
			setTimeout(() => setSuccess(null), 3000);
			await loadData();
			if (onFuelAdded) onFuelAdded();
		} catch (err) {
			setError(err?.response?.data?.detail || "Impossible d'enregistrer le plein");
		} finally {
			setSaving(false);
		}
	};

	const handleEditLog = (log) => {
		setFormData({
			fill_date: log.fill_date ? log.fill_date.split('T')[0] : '',
			mileage_at_fill: String(log.mileage_at_fill || ''),
			total_cost: String(log.total_cost || ''),
			price_per_liter: String(log.price_per_liter || ''),
			station: log.station || '',
			notes: log.notes || '',
		});
		setEditingLog(log);
		setShowForm(false);
	};

	const handleInlineUpdate = async (logId) => {
		try {
			setSaving(true);
			setError(null);
			const payload = {
				fill_date: new Date(formData.fill_date).toISOString(),
				mileage_at_fill: parseInt(formData.mileage_at_fill, 10),
				total_cost: parseFloat(formData.total_cost),
				price_per_liter: parseFloat(formData.price_per_liter),
				station: formData.station || null,
				notes: formData.notes || null,
			};
			await api.updateFuelLog(vehicleId, logId, payload);
			setEditingLog(null);
			resetForm();
			setSuccess('Plein modifié !');
			setTimeout(() => setSuccess(null), 3000);
			await loadData();
			if (onFuelAdded) onFuelAdded();
		} catch (err) {
			setError(err?.response?.data?.detail || "Impossible de modifier le plein");
		} finally {
			setSaving(false);
		}
	};

	const handleDeleteLog = useCallback(async (logId) => {
		if (!window.confirm('Supprimer ce plein ?')) return;
		try {
			setDeletingId(logId);
			await api.deleteFuelLog(vehicleId, logId);
			await loadData();
		} catch (err) {
			setError('Impossible de supprimer ce plein');
		} finally {
			setDeletingId(null);
		}
	}, [vehicleId, loadData]);

	const monthlyData = useMemo(() => {
		const rows = stats?.monthly_breakdown || [];
		return rows.slice(0, 12).reverse();
	}, [stats]);

	const chartPoints = useMemo(() => stats?.chart_points || [], [stats]);
	const consumptionPoints = useMemo(() => chartPoints.filter(p => p.consumption_l_100 != null), [chartPoints]);

	// Monthly comparison: last month vs the one before
	const monthlyComparison = useMemo(() => {
		if (monthlyData.length < 2) return null;
		const last = monthlyData[monthlyData.length - 1];
		const prev = monthlyData[monthlyData.length - 2];
		const lastVal = last?.total_cost || 0;
		const prevVal = prev?.total_cost || 0;
		if (prevVal === 0) return null;
		const pct = Math.round(((lastVal - prevVal) / prevVal) * 100);
		const [, m] = prev.month.split('-');
		return { pct, label: MONTH_FULL[parseInt(m, 10) - 1] };
	}, [monthlyData]);

	if (loading) {
		return <div className="text-center py-10" style={{ color: 'var(--text-2)' }}>Chargement carburant...</div>;
	}

	return (
		<div className="space-y-5">
			{error && (
				<div className="p-3 rounded text-sm" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--danger)' }}>{error}</div>
			)}
			{success && (
				<div className="p-3 rounded text-sm" style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', color: 'var(--success)' }}>{success}</div>
			)}

			{/* Add / Edit fuel form */}
			{!showForm ? (
				<button onClick={() => { resetForm(); setShowForm(true); }} className="btn btn-primary">
					⛽ Ajouter un plein
				</button>
			) : (
				<div className="card p-5">
					<div className="flex items-center justify-between mb-4">
						<h3 className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>⛽ Nouveau plein</h3>
						<button onClick={() => { setShowForm(false); resetForm(); }} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-3)' }}>✕</button>
					</div>
					<form onSubmit={handleSubmit}>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
							<div>
								<label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>Date *</label>
								<input type="date" name="fill_date" value={formData.fill_date} onChange={handleChange} required className="input-field" />
							</div>
							<div>
								<label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>Kilométrage *</label>
								<input type="number" name="mileage_at_fill" value={formData.mileage_at_fill} onChange={handleChange} required placeholder="Ex: 32600" className="input-field" />
							</div>
							<div>
								<label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>Montant payé (€) *</label>
								<input type="number" step="0.01" name="total_cost" value={formData.total_cost} onChange={handleChange} required placeholder="Ex: 45.50" className="input-field" />
							</div>
							<div>
								<label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>Prix au litre (€) *</label>
								<input type="number" step="0.001" name="price_per_liter" value={formData.price_per_liter} onChange={handleChange} required placeholder="Ex: 1.85" className="input-field" />
								<p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Les litres seront calculés automatiquement</p>
							</div>
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
							<div>
								<label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>Station</label>
								<input type="text" name="station" value={formData.station} onChange={handleChange} placeholder="Ex: TotalEnergies Montpellier" className="input-field" />
							</div>
							<div>
								<label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>Notes</label>
								<input type="text" name="notes" value={formData.notes} onChange={handleChange} placeholder="Optionnel" className="input-field" />
							</div>
						</div>

						{/* Auto-calculated liters preview */}
						{formData.total_cost && formData.price_per_liter && parseFloat(formData.price_per_liter) > 0 && (
							<div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12, padding: '6px 10px', background: 'var(--border)', borderRadius: 6 }}>
								⛽ Litres estimés : <strong>{(parseFloat(formData.total_cost) / parseFloat(formData.price_per_liter)).toFixed(1)} L</strong>
							</div>
						)}

						<div className="flex justify-end">
							<button type="submit" disabled={saving} className="btn btn-primary">
								{saving ? 'Enregistrement...' : '✓ Enregistrer'}
							</button>
						</div>
					</form>
				</div>
			)}

			{/* Stats cards */}
			{stats && stats.entries > 0 && (
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
					<div className="card p-4 text-center">
						<div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>Dépensé</div>
						<div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{(stats.total_fuel_cost || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €</div>
					</div>
					<div className="card p-4 text-center">
						<div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>Pleins</div>
						<div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>{stats.entries}</div>
					</div>
					<div className="card p-4 text-center">
						<div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>Conso moy.</div>
						<div style={{ fontSize: 22, fontWeight: 700, color: stats.avg_consumption_l_100 ? 'var(--success)' : 'var(--text-3)' }}>
							{stats.avg_consumption_l_100 ? `${stats.avg_consumption_l_100}` : '—'}
							{stats.avg_consumption_l_100 && <span style={{ fontSize: 12, fontWeight: 400 }}> L/100</span>}
						</div>
					</div>
					<div className="card p-4 text-center">
						<div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>Coût /100km</div>
						<div style={{ fontSize: 22, fontWeight: 700, color: stats.avg_cost_100km ? 'var(--warning)' : 'var(--text-3)' }}>
							{stats.avg_cost_100km ? `${stats.avg_cost_100km}` : '—'}
							{stats.avg_cost_100km && <span style={{ fontSize: 12, fontWeight: 400 }}> €</span>}
						</div>
					</div>
					{stats.avg_distance_per_tank && (
					<div className="card p-4 text-center">
						<div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>Autonomie moy.</div>
						<div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>
							{stats.avg_distance_per_tank.toLocaleString('fr-FR')}
							<span style={{ fontSize: 12, fontWeight: 400 }}> km</span>
						</div>
					</div>
					)}
					{stats.monthly_avg_cost && (
					<div className="card p-4 text-center">
						<div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>Moy. /mois</div>
						<div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
							{stats.monthly_avg_cost.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
							<span style={{ fontSize: 12, fontWeight: 400 }}> €</span>
						</div>
					</div>
					)}
				</div>
			)}

			{/* Monthly spending banner */}
			{stats && (stats.current_month_cost || stats.monthly_avg_cost) && (
				<div className="card p-4" style={{ borderLeft: '3px solid var(--accent)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
					<span style={{ fontSize: 18 }}>📊</span>
					<div>
						{stats.current_month_cost ? (
							<div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>
								Dépensé ce mois : {stats.current_month_cost.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
							</div>
						) : null}
						{stats.monthly_avg_cost && (
							<div style={{ fontSize: 12, color: 'var(--text-3)' }}>
								Moyenne mensuelle : {stats.monthly_avg_cost.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €/mois
							</div>
						)}
					</div>
				</div>
			)}

			{/* Charts */}
			{stats && stats.entries > 0 && (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{/* Monthly cost chart */}
					<div className="card p-5">
						<h4 className="text-sm font-bold mb-3" style={{ color: 'var(--text-1)' }}>💰 Dépenses par mois</h4>
						<BarChart data={monthlyData} valueKey="total_cost" color="var(--accent)" unit=" €"
							formatValue={v => v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
							avgValue={stats.monthly_avg_cost}
							prevComparison={monthlyComparison} />
					</div>

					{/* Monthly liters chart */}
					<div className="card p-5">
						<h4 className="text-sm font-bold mb-3" style={{ color: 'var(--text-1)' }}>⛽ Litres par mois</h4>
						<BarChart data={monthlyData.filter(d => d.total_liters > 0)} valueKey="total_liters" color="var(--success)" unit=" L"
							formatValue={v => v.toFixed(1)} />
					</div>

					{/* Consumption trend */}
					<div className="card p-5">
						<h4 className="text-sm font-bold mb-3" style={{ color: 'var(--text-1)' }}>📉 Évolution consommation (L/100km)</h4>
						{consumptionPoints.length >= 2 ? (
							<MiniLineChart points={consumptionPoints} valueKey="consumption_l_100" color="var(--success)" unit=""
								formatValue={v => v.toFixed(1)} avgValue={stats.avg_consumption_l_100} />
						) : (
							<p className="text-sm" style={{ color: 'var(--text-3)' }}>Renseignez le prix au litre pour suivre la consommation</p>
						)}
					</div>

					{/* Cost per 100km trend */}
					<div className="card p-5">
						<h4 className="text-sm font-bold mb-3" style={{ color: 'var(--text-1)' }}>📈 Évolution coût /100km (€)</h4>
						<MiniLineChart points={chartPoints} valueKey="cost_100km" color="var(--warning)" unit="€"
							formatValue={v => v.toFixed(1)} avgValue={stats.avg_cost_100km} />
					</div>
				</div>
			)}

			{/* Station stats */}
			{stats?.station_stats?.length > 0 && (
				<div className="card p-5">
					<h4 className="text-sm font-bold mb-3" style={{ color: 'var(--text-1)' }}>📍 Prix moyen par station</h4>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
						{stats.station_stats.map((s, i) => (
							<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: i === 0 ? 'rgba(34, 197, 94, 0.06)' : 'transparent', borderRadius: 6, border: '1px solid var(--border)' }}>
								<div style={{ flex: 1 }}>
									<div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{s.station}</div>
									<div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.visits} visite{s.visits > 1 ? 's' : ''} · {s.total_liters.toFixed(1)} L · {s.total_cost.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</div>
								</div>
								{s.avg_price_per_liter && (
									<div style={{ textAlign: 'right' }}>
										<div style={{ fontSize: 16, fontWeight: 700, color: i === 0 ? 'var(--success)' : 'var(--text-1)' }}>{s.avg_price_per_liter.toFixed(3)} €/L</div>
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			)}

			{/* History */}
			{logs.length > 0 && (
				<div className="card p-5">
					<button onClick={() => setShowHistory(!showHistory)}
						className="flex items-center justify-between w-full"
						style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
						<h4 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>📜 Historique des pleins ({logs.length})</h4>
						<span style={{ color: 'var(--text-3)', fontSize: 14 }}>{showHistory ? '▾' : '▸'}</span>
					</button>

					{showHistory && (
						<div className="mt-4 space-y-3">
							{logs.map((log) => (
								<div key={log.id} className="card p-4">
									{editingLog?.id === log.id ? (
										/* Inline edit mode */
										<div className="space-y-3">
											<h4 className="font-semibold mb-3" style={{ color: 'var(--text-1)' }}>Modifier le plein</h4>
											<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
												<div>
													<label className="block text-xs font-medium mb-1">Date *</label>
													<input type="date" value={formData.fill_date}
														onChange={(e) => setFormData({ ...formData, fill_date: e.target.value })}
														className="w-full px-2 py-1 text-sm border border-gray-300 rounded" />
												</div>
												<div>
													<label className="block text-xs font-medium mb-1">Kilométrage *</label>
													<input type="number" value={formData.mileage_at_fill}
														onChange={(e) => setFormData({ ...formData, mileage_at_fill: e.target.value })}
														className="w-full px-2 py-1 text-sm border border-gray-300 rounded" />
												</div>
												<div>
													<label className="block text-xs font-medium mb-1">Montant (€) *</label>
													<input type="number" step="0.01" value={formData.total_cost}
														onChange={(e) => setFormData({ ...formData, total_cost: e.target.value })}
														className="w-full px-2 py-1 text-sm border border-gray-300 rounded" />
												</div>
												<div>
													<label className="block text-xs font-medium mb-1">Prix/L (€) *</label>
													<input type="number" step="0.001" value={formData.price_per_liter}
														onChange={(e) => setFormData({ ...formData, price_per_liter: e.target.value })}
														className="w-full px-2 py-1 text-sm border border-gray-300 rounded" />
												</div>
												<div>
													<label className="block text-xs font-medium mb-1">Station</label>
													<input type="text" value={formData.station}
														onChange={(e) => setFormData({ ...formData, station: e.target.value })}
														className="w-full px-2 py-1 text-sm border border-gray-300 rounded" />
												</div>
												<div>
													<label className="block text-xs font-medium mb-1">Notes</label>
													<input type="text" value={formData.notes}
														onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
														className="w-full px-2 py-1 text-sm border border-gray-300 rounded" />
												</div>
											</div>
											<div className="flex gap-2 justify-end">
												<button onClick={() => { setEditingLog(null); resetForm(); }}
													className="px-3 py-1 text-sm rounded"
													style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}
													style={{ color: 'var(--text-2)' }}>
													Annuler
												</button>
												<button onClick={() => handleInlineUpdate(log.id)}
													disabled={saving}
													className="btn btn-primary px-3 py-1 text-sm">
													{saving ? 'Enregistrement...' : 'Enregistrer'}
												</button>
											</div>
										</div>
									) : (
										/* View mode */
										<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
											<div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 13 }}>
												<span style={{ color: 'var(--text-2)', minWidth: 75 }}>{new Date(log.fill_date).toLocaleDateString('fr-FR')}</span>
												<span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{log.total_cost.toFixed(2)} €</span>
												<span style={{ color: 'var(--text-3)' }}>{log.mileage_at_fill.toLocaleString('fr-FR')} km</span>
												{log.liters > 0 && <span style={{ color: 'var(--text-3)' }}>{log.liters.toFixed(1)} L</span>}
												{log.price_per_liter > 0 && <span style={{ color: 'var(--text-3)' }}>{log.price_per_liter.toFixed(3)} €/L</span>}
												{log.station && <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>{log.station}</span>}
											</div>
											<div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
												<button
													onClick={() => handleEditLog(log)}
													style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--accent)', padding: 4 }}
													title="Modifier">
													✏️
												</button>
												<button
													onClick={() => handleDeleteLog(log.id)}
													disabled={deletingId === log.id}
													style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: deletingId === log.id ? 'var(--text-3)' : 'var(--danger)', padding: 4 }}
													title="Supprimer">
													{deletingId === log.id ? '⏳' : '🗑️'}
												</button>
											</div>
										</div>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{stats && stats.entries === 0 && !showForm && (
				<div className="card p-12 text-center">
					<p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 8 }}>⛽ Aucun plein enregistré</p>
					<p style={{ color: 'var(--text-3)', fontSize: 13 }}>Ajoutez votre premier plein pour commencer à suivre vos dépenses de carburant.</p>
				</div>
			)}
		</div>
	);
}
