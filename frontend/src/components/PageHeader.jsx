import React from 'react';

/**
 * En-tête de page — titre, précision, actions.
 *
 * Chaque page réécrivait le sien avec une taille de titre différente ; d'un
 * onglet à l'autre, le contenu ne commençait pas à la même hauteur.
 */
export default function PageHeader({ title, subtitle, actions, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-4 flex-wrap ${className}`} style={{ marginBottom: 20 }}>
      <div className="min-w-0">
        <h1 style={{ fontSize: '1.5rem' }}>{title}</h1>
        {subtitle && (
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 2 }}>{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
