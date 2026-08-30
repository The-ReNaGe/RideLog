import React from 'react';
import Icon from './Icon';
import { useT } from '../lib/preferencesContext';

/**
 * La case « Véhicule privé », partagée par la création et l'édition.
 *
 * Pourquoi un composant plutôt que deux blocs
 * ───────────────────────────────────────────
 * Elle existait en deux exemplaires — `VehicleForm` et le formulaire d'édition
 * de `VehicleDetail` — et ils avaient divergé : pastille colorée d'un côté,
 * case nue de l'autre, deux libellés différents pour la même chose, et
 * l'explication reléguée dans un `title=` (une bulle native, que personne ne
 * survole sur téléphone). C'est le défaut que le §23.7 de CLAUDE.md décrit
 * déjà pour `CategoryTag` : une table recopiée à deux endroits finit toujours
 * par ne plus dire la même chose des deux côtés.
 *
 * Ce que le rendu corrige
 * ───────────────────────
 * - la case forçait `width: 15px` contre la règle `width: auto` d'`index.css`,
 *   ce qui l'écrasait ;
 * - l'icône était posée dans un `<span>` sans alignement : elle flottait
 *   au-dessus de la ligne de texte ;
 * - `rounded-lg` est un rayon Tailwind, hors des trois jetons du projet ;
 * - les trois éléments tenaient sur une seule ligne, sans `flex-wrap`, donc
 *   débordaient sur petit écran.
 *
 * L'état coché reprend le couple `--accent-light` / `--accent` : fond pastel,
 * texte plein, jamais l'inverse.
 */
export default function PrivateVehicleField({ checked, onChange }) {
  const t = useT();

  return (
    <label
      className="flex items-start gap-3 p-3 cursor-pointer transition-colors"
      style={{
        background: checked ? 'var(--accent-light)' : 'var(--bg-surface)',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2, flexShrink: 0 }}
      />
      <span>
        <span
          className="inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: checked ? 'var(--accent)' : 'var(--text-1)' }}
        >
          <Icon name="lock" size={14} />
          {t('Véhicule privé')}
        </span>
        {/* Ce que ça fait, pas ce que ça coche — et à l'écran, pas dans une
            bulle de survol qui n'existe pas au doigt. */}
        <span className="block field-hint">
          {t('Exclu du partage avec votre groupe famille. Vous continuez à le voir.')}
        </span>
      </span>
    </label>
  );
}
