import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api';

const interventionTranslations = {
  'Oil change': 'Vidange',
  'Air filter replacement': 'Filtre à air',
  'Cabin filter replacement': 'Filtre habitacle',
  'Cabin air filter replacement': 'Filtre habitacle',
  'Brake fluid flush': 'Purge freins',
  'Timing belt replacement': 'Courroie distrib.',
  'Coolant replacement': 'Liquide refroid.',
  'Coolant fluid renewal': 'Liquide refroid.',
  'Transmission fluid renewal': 'Liquide transm.',
  'Transmission fluid replacement': 'Liquide transm.',
  'Brake pads replacement': 'Plaquettes frein',
  'Battery replacement': 'Batterie',
  'MOT inspection': 'Contrôle technique',
  'Technical inspection': 'Contrôle technique',
  'Spark plug replacement': 'Bougies',
  'Chain lubrication': 'Graissage chaîne',
  'Tire replacement': 'Pneus',
  'Tire inspection': 'Inspection pneus',
  'Chain replacement': 'Chaîne',
  'Other': 'Autre',
  'Fork service (oil change + seals)': 'Fourche',
  'Valve clearance check': 'Jeu soupapes',
};

function t(name) {
  return interventionTranslations[name] || name;
}

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];
const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getStatusColor(status) {
  switch (status) {
    case 'overdue': return 'var(--danger)';
    case 'urgent': return 'var(--warning)';
    case 'warning': return '#e6a817';
    default: return 'var(--success)';
  }
}

function getStatusEmoji(status) {
  switch (status) {
    case 'overdue': return '🔴';
    case 'urgent': return '🟠';
    case 'warning': return '🟡';
    default: return '🟢';
  }
}

function CalendarDay({ day, isCurrentMonth, isToday, items, onDayClick }) {
  if (!day) {
    return <div className="calendar-cell calendar-cell-empty" />;
  }

  const hasItems = items && items.length > 0;
  const worstStatus = hasItems
    ? items.reduce((worst, item) => {
        const order = { overdue: 0, urgent: 1, warning: 2, ok: 3 };
        return order[item.status] < order[worst] ? item.status : worst;
      }, 'ok')
    : null;

  return (
    <div
      className={`calendar-cell${!isCurrentMonth ? ' calendar-cell-other' : ''}${isToday ? ' calendar-cell-today' : ''}${hasItems ? ' calendar-cell-has-items' : ''}`}
      onClick={() => hasItems && onDayClick(day, items)}
      style={{ cursor: hasItems ? 'pointer' : 'default' }}
    >
      <div className="calendar-day-number" style={isToday ? { background: 'var(--accent)', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}}>
        {day.getDate()}
      </div>
      {hasItems && (
        <div className="calendar-day-items">
          {items.slice(0, 3).map((item, i) => (
            <div
              key={i}
              className="calendar-item-dot"
              style={{ background: getStatusColor(item.status), color: '#fff', fontSize: '10px', padding: '1px 4px', borderRadius: 3, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '14px' }}
              title={`${item.vehicle_name} - ${t(item.intervention_type)}`}
            >
              {item.vehicle_type === 'car' ? '🚗' : '🏍️'} {t(item.intervention_type)}
            </div>
          ))}
          {items.length > 3 && (
            <div style={{ fontSize: '10px', color: 'var(--text-3)', textAlign: 'center' }}>
              +{items.length - 3}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DayDetailModal({ date, items, onClose }) {
  if (!date || !items) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}>
      <div className="card" style={{ maxWidth: 500, width: '90%', maxHeight: '80vh', overflow: 'auto', padding: 24 }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ color: 'var(--text-1)', margin: 0 }}>
            📅 {date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-2)' }}>✕</button>
        </div>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="card p-3" style={{ borderLeft: `4px solid ${getStatusColor(item.status)}` }}>
              <div className="flex items-center gap-2 mb-1">
                <span style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                  {item.vehicle_type === 'car' ? '🚗' : '🏍️'} {item.vehicle_name}
                </span>
                <span style={{ fontSize: 11, color: getStatusColor(item.status), fontWeight: 600 }}>
                  {getStatusEmoji(item.status)} {item.status === 'overdue' ? 'En retard' : item.status === 'urgent' ? 'Urgent' : item.status === 'warning' ? 'À surveiller' : 'Planifié'}
                </span>
              </div>
              <div style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: 14 }}>{t(item.intervention_type)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                {item.km_remaining != null && item.km_remaining !== 999999 && (
                  <span>{item.km_remaining < 0 ? `⚠️ ${Math.abs(item.km_remaining).toLocaleString('fr-FR')} km de retard` : `Dans ${item.km_remaining.toLocaleString('fr-FR')} km`}</span>
                )}
                {item.estimated_cost_max && (
                  <span style={{ marginLeft: 12, color: 'var(--success)' }}>€{item.estimated_cost_min}–{item.estimated_cost_max}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Planning() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedItems, setSelectedItems] = useState(null);

  useEffect(() => {
    loadPlanning();
  }, []);

  const loadPlanning = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getPlanning();
      setItems(res.data.items || []);
    } catch (err) {
      console.error('Failed to load planning', err);
      setError(err.response?.data?.detail || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  // Group items by date string (YYYY-MM-DD)
  const itemsByDate = useMemo(() => {
    const map = {};
    for (const item of items) {
      if (!item.estimated_date) continue;
      if (!map[item.estimated_date]) map[item.estimated_date] = [];
      map[item.estimated_date].push(item);
    }
    return map;
  }, [items]);

  // Build calendar grid for current month
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    // Monday = 0 in our grid
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6; // Sunday → 6
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthDays - i);
      cells.push({ date: d, isCurrentMonth: false });
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
    }
    // Next month padding to fill 6 rows
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
    }
    return cells;
  }, [currentMonth]);

  // Summary counts for displayed info
  const summary = useMemo(() => {
    const overdue = items.filter(i => i.status === 'overdue');
    const urgent = items.filter(i => i.status === 'urgent');
    // Items in current month
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const monthItems = items.filter(i => {
      if (!i.estimated_date) return false;
      const d = new Date(i.estimated_date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
    return { overdue, urgent, monthItems };
  }, [items, currentMonth]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const goToToday = () => setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));

  const handleDayClick = (date, dayItems) => {
    setSelectedDay(date);
    setSelectedItems(dayItems);
  };

  if (loading) {
    return <div className="text-center py-12" style={{ color: 'var(--text-2)' }}>Chargement du planning...</div>;
  }

  if (error) {
    return (
      <div className="card p-8 text-center">
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        <button onClick={loadPlanning} className="btn btn-primary mt-4">Réessayer</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-3">
        {summary.overdue.length > 0 && (
          <div className="card px-4 py-2 flex items-center gap-2" style={{ borderLeft: '4px solid var(--danger)' }}>
            <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 20 }}>{summary.overdue.length}</span>
            <span style={{ color: 'var(--text-2)', fontSize: 13 }}>en retard</span>
          </div>
        )}
        {summary.urgent.length > 0 && (
          <div className="card px-4 py-2 flex items-center gap-2" style={{ borderLeft: '4px solid var(--warning)' }}>
            <span style={{ color: 'var(--warning)', fontWeight: 700, fontSize: 20 }}>{summary.urgent.length}</span>
            <span style={{ color: 'var(--text-2)', fontSize: 13 }}>urgents</span>
          </div>
        )}
        <div className="card px-4 py-2 flex items-center gap-2" style={{ borderLeft: '4px solid var(--accent)' }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 20 }}>{summary.monthItems.length}</span>
          <span style={{ color: 'var(--text-2)', fontSize: 13 }}>ce mois</span>
        </div>
      </div>

      {/* Calendar header with navigation */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <button onClick={prevMonth} className="btn btn-secondary" style={{ padding: '6px 12px', minWidth: 'auto' }}>
            ◀
          </button>
          <div className="flex items-center gap-3">
            <h2 style={{ margin: 0, color: 'var(--text-1)', fontSize: 20, fontWeight: 700, textTransform: 'capitalize' }}>
              {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </h2>
            {(currentMonth.getMonth() !== today.getMonth() || currentMonth.getFullYear() !== today.getFullYear()) && (
              <button onClick={goToToday} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: '1px solid var(--accent)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
                Aujourd'hui
              </button>
            )}
          </div>
          <button onClick={nextMonth} className="btn btn-secondary" style={{ padding: '6px 12px', minWidth: 'auto' }}>
            ▶
          </button>
        </div>

        {/* Day name headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {DAY_NAMES.map(d => (
            <div key={d} style={{ textAlign: 'center', padding: '8px 0', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {calendarDays.map((cell, i) => {
            const dateStr = `${cell.date.getFullYear()}-${String(cell.date.getMonth() + 1).padStart(2, '0')}-${String(cell.date.getDate()).padStart(2, '0')}`;
            const dayItems = itemsByDate[dateStr] || [];
            const cellDate = new Date(cell.date);
            cellDate.setHours(0, 0, 0, 0);
            const isToday = cellDate.getTime() === today.getTime();

            return (
              <CalendarDay
                key={i}
                day={cell.date}
                isCurrentMonth={cell.isCurrentMonth}
                isToday={isToday}
                items={dayItems}
                onDayClick={handleDayClick}
              />
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4" style={{ fontSize: 12, color: 'var(--text-3)' }}>
        <span>🔴 En retard</span>
        <span>🟠 Urgent</span>
        <span>🟡 À surveiller</span>
        <span>🟢 Planifié</span>
      </div>

      {/* Day detail modal */}
      {selectedDay && selectedItems && (
        <DayDetailModal
          date={selectedDay}
          items={selectedItems}
          onClose={() => { setSelectedDay(null); setSelectedItems(null); }}
        />
      )}
    </div>
  );
}
