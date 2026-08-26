import { useState, useEffect, useMemo } from "react";
import Icon from './Icon';
import {
  REVISION_TRIGGERS,
  BRAKE_SUBITEMS,
  TIRE_SUBITEMS,
  getRevisionItems,
  getDefaultChecked,
  filterItemsForMotorization,
  buildSelectedSubInterventions,
  getUrgencyMap,
} from "../lib/revisionChecklist";

/**
 * RevisionChecklistModal
 *
 * Props:
 *   vehicleType     {string}    'car' | 'motorcycle'
 *   motorization     {string}   utilisé pour filtrer les items voiture (diesel/essence)
 *   interventionType {string}   'Entretien annuel' | 'Révision périodique (km)' | 'Remplacement freins' | 'Remplacement pneus'
 *   upcomingMaintenances {Array} résultat de GET /upcoming, pour pré-cochage intelligent (ignoré si initialChecked fourni)
 *   initialChecked   {Object}   état "checked" pré-rempli (mode édition depuis l'historique)
 *   onClose          {Function} annulation
 *   onConfirm        {Function} (selectedSubInterventions: Array<{key,name}>) => void
 */
export default function RevisionChecklistModal({
  vehicleType,
  motorization,
  interventionType,
  upcomingMaintenances = [],
  initialChecked = null,
  onClose,
  onConfirm,
}) {
  const isFullRevision = REVISION_TRIGGERS.includes(interventionType);

  // Items à afficher : la checklist complète, ou juste les sous-cases freins/pneus
  const items = useMemo(() => {
    if (isFullRevision) {
      return filterItemsForMotorization(getRevisionItems(vehicleType), vehicleType, motorization);
    }
    const subItems = interventionType === 'Remplacement freins' ? BRAKE_SUBITEMS : TIRE_SUBITEMS;
    return [{ key: '__single__', name: interventionType, hasSubItems: true, subItems }];
  }, [isFullRevision, interventionType, vehicleType, motorization]);

  const [checked, setChecked] = useState({});

  useEffect(() => {
    if (initialChecked) {
      // En mode "freins/pneus seuls", l'item racine est toujours implicitement sélectionné
      // (c'est l'intervention elle-même) : on force sa clé même si elle n'apparaît pas
      // telle quelle dans les sous-interventions déjà enregistrées.
      setChecked(isFullRevision ? initialChecked : { ...initialChecked, __single__: true });
      return;
    }
    if (!isFullRevision) {
      // Cas freins/pneus seuls : rien de pré-coché, l'utilisateur choisit avant/arrière
      setChecked({ __single__: true });
      return;
    }
    // Cas révision complète : pré-cocher les défauts + les items en retard
    const urg = getUrgencyMap(upcomingMaintenances, items);
    const defaults = getDefaultChecked(vehicleType);
    const initial = {};
    items.forEach((item) => {
      initial[item.key] = defaults.includes(item.key) || urg[item.key] === 'due';
    });
    setChecked(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, initialChecked, isFullRevision, vehicleType]);

  const toggle = (key) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleParent = (item, value) => {
    setChecked((prev) => {
      const next = { ...prev, [item.key]: value };
      if (!value && item.hasSubItems) {
        item.subItems.forEach((sub) => { next[sub.key] = false; });
      }
      return next;
    });
  };

  const selection = buildSelectedSubInterventions({ items, checked, vehicleType, motorization });
  const selectedCount = selection.length;

  const handleConfirm = () => {
    onConfirm(selection);
  };

  const groups = isFullRevision
    ? items.reduce((acc, item) => {
        const g = acc.find((g) => g.label === item.group);
        if (g) g.items.push(item);
        else acc.push({ label: item.group, icon: item.icon, items: [item] });
        return acc;
      }, [])
    : [{ label: null, icon: null, items }];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1100,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1rem",
      background: "rgba(0,0,0,0.55)",
      backdropFilter: "blur(4px)",
    }}>
      <div className="card" style={{
        width: "100%", maxWidth: 500,
        maxHeight: "88vh",
        display: "flex", flexDirection: "column",
        overflow: "hidden", padding: 0,
        boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: "1.25rem 1.5rem 1rem",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "flex-start",
          justifyContent: "space-between", gap: "1rem",
        }}>
          <div>
            <h3 style={{ color: "var(--text-1)", fontWeight: 700, fontSize: "1rem", marginBottom: "0.2rem" }}>
              {isFullRevision ? 'Détail de la révision' : `Détail : ${interventionType}`}
            </h3>
            <p style={{ color: "var(--text-3)", fontSize: "0.8rem" }}>
              {isFullRevision
                ? "Cochez les interventions effectuées"
                : "Précisez les éléments concernés"}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--bg-surface)", border: "1px solid var(--border)",
              borderRadius: "0.5rem", color: "var(--text-3)",
              width: 30, height: 30, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", fontSize: "0.9rem",
            }}
          ><Icon name="close" size={16} strokeWidth={2.2} /></button>
        </div>

        {/* Liste scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          {groups.map((group) => (
            <div key={group.label || 'single'}>
              {group.label && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  marginBottom: "0.4rem",
                  fontSize: "0.7rem", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.07em",
                  color: "var(--text-3)",
                }}>
                  <Icon name={group.icon} size={14} style={{ color: 'var(--text-3)' }} />
                  <span>{group.label}</span>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {group.items.map((item) => {
                  const isChecked = checked[item.key] ?? false;
                  const bg = isChecked ? "rgba(108,138,247,0.07)" : "transparent";
                  const border = isChecked ? "var(--accent)" : "var(--border)";
                  const showAsCheckbox = item.key !== '__single__';

                  return (
                    <div key={item.key}>
                      {showAsCheckbox && (
                        <label style={{
                          display: "flex", alignItems: "center", gap: "0.65rem",
                          padding: "0.5rem 0.7rem",
                          borderRadius: "0.55rem",
                          border: `1px solid ${border}`,
                          background: bg,
                          cursor: "pointer",
                          transition: "border-color 0.15s, background 0.15s",
                        }}>
                          <div style={{
                            flexShrink: 0, width: 17, height: 17,
                            borderRadius: 3,
                            border: `2px solid ${isChecked ? "var(--accent)" : "var(--border)"}`,
                            background: isChecked ? "var(--accent)" : "var(--bg-base)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "white", fontSize: "0.65rem", fontWeight: 700,
                            transition: "all 0.15s",
                          }}>
                            {isChecked && <Icon name="check" size={12} strokeWidth={3} />}
                          </div>
                          <input
                            type="checkbox"
                            style={{ display: "none" }}
                            checked={isChecked}
                            onChange={(e) => item.hasSubItems ? toggleParent(item, e.target.checked) : toggle(item.key)}
                          />
                          <span style={{
                            flex: 1, fontSize: "0.83rem",
                            color: isChecked ? "var(--text-1)" : "var(--text-2)",
                            fontWeight: isChecked ? 500 : 400,
                          }}>
                            {item.name}
                          </span>
                        </label>
                      )}

                      {/* Sous-items (freins/pneus avant-arrière) */}
                      {item.hasSubItems && (showAsCheckbox ? isChecked : true) && (
                        <div style={{
                          marginLeft: showAsCheckbox ? "1.5rem" : 0,
                          marginTop: "0.35rem",
                          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem",
                        }}>
                          {item.subItems.map((sub) => {
                            const subChecked = checked[sub.key] ?? false;
                            return (
                              <label key={sub.key} style={{
                                display: "flex", alignItems: "center", gap: "0.5rem",
                                padding: "0.4rem 0.6rem",
                                borderRadius: "0.5rem",
                                border: `1px solid ${subChecked ? "var(--accent)" : "var(--border)"}`,
                                background: subChecked ? "rgba(108,138,247,0.07)" : "transparent",
                                cursor: "pointer",
                              }}>
                                <input
                                  type="checkbox"
                                  checked={subChecked}
                                  onChange={() => toggle(sub.key)}
                                  style={{ width: 14, height: 14 }}
                                />
                                <span style={{ fontSize: "0.78rem", color: subChecked ? "var(--text-1)" : "var(--text-2)" }}>
                                  {sub.name}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: "0.9rem 1.25rem",
          borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem",
        }}>
          <span style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>
            {selectedCount} sélectionnée{selectedCount > 1 ? "s" : ""}
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: "0.82rem" }}>
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              className="btn btn-primary"
              style={{ fontSize: "0.82rem", minWidth: 145 }}
            >
              <Icon name="check" size={16} strokeWidth={2.4} />
              Valider ({selectedCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}