import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function Dashboard({ onSelectVehicle, currentUser }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await api.getDashboard();
      setData(res.data);
      setError(null);
    } catch (err) {
      setError('Impossible de charger le dashboard');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="spinner mx-auto mb-3"></div>
        <p style={{ color: 'var(--text-2)' }} className="text-sm">Chargement du dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-8 text-center">
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        <button onClick={fetchDashboard} className="btn btn-primary mt-4">Réessayer</button>
      </div>
    );
  }

  if (!data) return null;

  const fmt = (n) => new Intl.NumberFormat('fr-FR').format(n);
  const fmtEuro = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-1)' }}>
        📊 Dashboard — {currentUser?.display_name || 'Mon garage'}
      </h2>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4 text-center">
          <div className="card-label">Véhicules</div>
          <div className="stat-number">{data.total_vehicles}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="card-label">Coût total</div>
          <div className="stat-number" style={{ fontSize: '22px' }}>{fmtEuro(data.total_cost)}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            Entretien {fmtEuro(data.total_maintenance_cost)} • Carburant {fmtEuro(data.total_fuel_cost)}
          </div>
        </div>
        <div className="card p-4 text-center">
          <div className="card-label">Km totaux</div>
          <div className="stat-number" style={{ fontSize: '22px' }}>{fmt(data.total_mileage)}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="card-label">Valeur d'achat</div>
          <div className="stat-number" style={{ fontSize: '20px' }}>
            {data.fleet_purchase_price ? fmtEuro(data.fleet_purchase_price) : '—'}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>Prix d'achat total</div>
        </div>
      </div>

      {/* Alerts Row — per vehicle */}
      {data.alert_details && data.alert_details.length > 0 && (
        <div className="card p-4 mb-6">
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-1)' }}>⚠️ Alertes</h3>
          <div className="space-y-2">
            {data.alert_details.map((alert, i) => {
              const cfg = alert.type === 'overdue'
                ? { icon: '⛔', label: 'En retard', color: 'var(--danger)', bg: 'var(--danger-light)' }
                : alert.type === 'urgent'
                ? { icon: '🔴', label: 'Urgent', color: 'var(--warning)', bg: 'var(--warning-light)' }
                : { icon: '🟡', label: 'À prévoir', color: 'var(--accent)', bg: 'var(--accent-light, var(--bg-base))' };
              return (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded cursor-pointer"
                  style={{ background: 'var(--bg-base)', borderLeft: `4px solid ${cfg.color}` }}
                  onClick={() => onSelectVehicle(alert.vehicle_id)}
                >
                  <div className="flex items-center gap-2">
                    <span>{cfg.icon}</span>
                    <span className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>{alert.vehicle_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: cfg.color }}>{alert.count} {cfg.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vehicles Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {data.vehicles.map((v) => {
          const borderColor = v.overdue_count > 0 ? 'var(--danger)' : v.urgent_count > 0 ? 'var(--warning)' : v.warning_count > 0 ? '#f59e0b' : 'var(--success)';
          return (
            <div
              key={v.id}
              className="card p-5 cursor-pointer transition-transform hover:scale-[1.01]"
              style={{ border: `2px solid ${borderColor}` }}
              onClick={() => onSelectVehicle(v.id)}
            >
              <div className="flex items-start gap-4 mb-4">
                {v.photo_url ? (
                  <img
                    src={v.photo_url}
                    alt={v.name}
                    className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                    style={{ background: 'var(--bg-base)' }}
                  />
                ) : (
                  <div
                    className="w-20 h-20 rounded-lg flex items-center justify-center flex-shrink-0 text-3xl"
                    style={{ background: 'var(--bg-base)' }}
                  >
                    {v.vehicle_type === 'motorcycle' ? '🏍️' : '🚗'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base" style={{ color: 'var(--text-1)' }}>{v.name}</div>
                  <div className="text-sm" style={{ color: 'var(--text-3)' }}>
                    {v.brand} {v.model} • {v.year}
                  </div>
                  <div className="text-sm" style={{ color: 'var(--text-2)' }}>
                    {fmt(v.current_mileage)} km
                  </div>
                </div>
                {/* Status icon */}
                <div className="flex-shrink-0 text-lg">
                  {v.overdue_count > 0 ? '⛔' : v.urgent_count > 0 ? '🔴' : v.warning_count > 0 ? '🟡' : '✅'}
                </div>
              </div>

              {/* Vehicle stats row */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded" style={{ background: 'var(--bg-base)' }}>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{fmtEuro(v.total_cost)}</div>
                  <div className="text-xs" style={{ color: 'var(--text-3)' }}>Dépenses</div>
                </div>
                <div className="p-3 rounded" style={{ background: 'var(--bg-base)' }}>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                    {v.purchase_price ? fmtEuro(v.purchase_price) : '—'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-3)' }}>Prix d'achat</div>
                </div>
                <div className="p-3 rounded" style={{ background: 'var(--bg-base)' }}>
                  {v.overdue_count > 0 ? (
                    <div className="text-sm font-bold" style={{ color: 'var(--danger)' }}>{v.overdue_count} retard{v.overdue_count > 1 ? 's' : ''}</div>
                  ) : v.urgent_count > 0 ? (
                    <div className="text-sm font-bold" style={{ color: 'var(--warning)' }}>{v.urgent_count} urgent{v.urgent_count > 1 ? 's' : ''}</div>
                  ) : v.warning_count > 0 ? (
                    <div className="text-sm font-bold" style={{ color: '#f59e0b' }}>{v.warning_count} à prévoir</div>
                  ) : (
                    <div className="text-sm font-bold" style={{ color: 'var(--success)' }}>À jour</div>
                  )}
                  <div className="text-xs" style={{ color: 'var(--text-3)' }}>État</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom row: Recent Activity + Monthly Costs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="card p-4">
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-1)' }}>🕐 Activité récente</h3>
          {data.recent_activity.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Aucune activité</p>
          ) : (
            <div className="space-y-2">
              {data.recent_activity.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-2 rounded cursor-pointer"
                  style={{ background: 'var(--bg-base)' }}
                  onClick={() => onSelectVehicle(a.vehicle_id)}
                >
                  <div>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                      {a.intervention_type}
                    </span>
                    <span className="text-xs ml-2" style={{ color: 'var(--text-3)' }}>
                      — {a.vehicle_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {a.cost_paid != null && (
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                        {fmtEuro(a.cost_paid)}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {new Date(a.execution_date).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Monthly Costs Chart */}
        <div className="card p-4">
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-1)' }}>📈 Dépenses mensuelles</h3>
          {data.monthly_costs.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Aucune donnée</p>
          ) : (
            <MonthlyChart data={data.monthly_costs} />
          )}
        </div>
      </div>
    </div>
  );
}

function MonthlyChart({ data }) {
  const [hovered, setHovered] = useState(null);
  const maxCost = Math.max(...data.map(d => d.cost), 1);
  const fmtEuro = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

  const formatMonth = (m) => {
    const [year, month] = m.split('-');
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    return `${months[parseInt(month) - 1] || month} ${year}`;
  };

  const formatMonthShort = (m) => {
    const [, month] = m.split('-');
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    return months[parseInt(month) - 1] || month;
  };

  return (
    <div className="relative">
      {/* Tooltip */}
      {hovered !== null && (
        <div
          className="absolute z-20 px-3 py-2 rounded shadow-lg text-center pointer-events-none"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            left: `${((hovered + 0.5) / data.length) * 100}%`,
            transform: 'translateX(-50%)',
            top: '-8px',
          }}
        >
          <div className="text-xs font-bold" style={{ color: 'var(--text-1)' }}>{fmtEuro(data[hovered].cost)}</div>
          <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>{formatMonth(data[hovered].month)}</div>
        </div>
      )}
      <div className="flex items-end gap-1" style={{ height: '240px', paddingTop: '32px' }}>
        {data.map((d, i) => {
          const height = Math.max(4, (d.cost / maxCost) * 200);
          const isActive = hovered === i;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end cursor-pointer"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <div
                className="w-full rounded-t transition-all duration-150"
                style={{
                  height: `${height}px`,
                  background: isActive ? 'var(--accent)' : 'var(--accent)',
                  opacity: isActive ? 1 : 0.6,
                  minWidth: '12px',
                  transform: isActive ? 'scaleX(1.1)' : 'scaleX(1)',
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-2">
        {data.map((d, i) => (
          <div
            key={i}
            className="flex-1 text-center text-[10px] font-medium transition-colors"
            style={{ color: hovered === i ? 'var(--text-1)' : 'var(--text-3)' }}
          >
            {formatMonthShort(d.month)}
          </div>
        ))}
      </div>
    </div>
  );
}
