import React from 'react';
import Icon from './Icon';

/**
 * Encart d'explication ou de résultat.
 *
 * Ces bandeaux étaient réécrits à la main dans chaque onglet de réglages, avec
 * des fonds, des bordures et des tailles de texte tous légèrement différents.
 * Le ton choisit la couleur ; l'icône par défaut découle du ton.
 */
const TONES = {
  info:    { color: 'var(--accent)',  bg: 'var(--accent-light)',  icon: 'info' },
  success: { color: 'var(--success)', bg: 'var(--success-light)', icon: 'checkCircle' },
  warning: { color: 'var(--warning)', bg: 'var(--warning-light)', icon: 'alert' },
  danger:  { color: 'var(--danger)',  bg: 'var(--danger-light)',  icon: 'alertCircle' },
  neutral: { color: 'var(--text-2)',  bg: 'var(--bg-inset)',      icon: 'info' },
};

export default function Notice({ tone = 'info', icon, title, children, className = '', style }) {
  const t = TONES[tone] || TONES.info;
  return (
    <div
      className={`flex items-start gap-3 ${className}`}
      style={{
        background: t.bg,
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${t.color}`,
        borderRadius: 'var(--radius)',
        padding: '12px 14px',
        ...style,
      }}
    >
      <Icon name={icon || t.icon} size={17} style={{ color: t.color, marginTop: 1 }} />
      <div className="min-w-0" style={{ fontSize: 13.5, color: 'var(--text-2)' }}>
        {title && (
          <p style={{ color: 'var(--text-1)', fontWeight: 700, marginBottom: children ? 3 : 0 }}>{title}</p>
        )}
        {children}
      </div>
    </div>
  );
}
