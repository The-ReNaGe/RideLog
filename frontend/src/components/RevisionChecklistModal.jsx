import React, { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

// Items toujours pré-cochés à chaque révision
const ALWAYS_CHECKED = ["oil_change_moto"];

// Mapping clé technique → nom français
const RECORDABLE_LABELS = {
  oil_change_moto:        "Vidange d'huile + Remplacement filtre à huile",
  spark_plug:             "Remplacement bougie d'allumage",
  air_filter:             "Remplacement filtre à air",
  valve_clearance:        "Contrôle et ajustement jeu aux soupapes",
  fork_service:           "Révision fourche (vidange + joints)",
  chain_kit:              "Remplacement kit chaîne (chaîne + pignon + couronne)",
  chain_maintenance:      "Tension et lubrification chaîne",
  battery:                "Remplacement batterie",
  wheel_bearings:         "Contrôle roulements de roue",
  steering_bearings:      "Contrôle roulements de direction",
  carburetor_cleaning:    "Nettoyage carburateur",
  injection_sync:         "Synchronisation injection",
  electronic_diagnosis:   "Diagnostic électronique",
  // Les items freins et pneus sont gérés avec des sous-cases
};

// Configuration des items avec sous-cases
const HIERARCHICAL_ITEMS = {
  tire_replacement: {
    label: "Remplacement pneus",
    subItems: [
      { key: "tire_front", label: "Pneu avant" },
      { key: "tire_rear", label: "Pneu arrière" },
      { key: "tire_all", label: "Les 2 pneus" },
    ],
  },
  brake_replacement: {
    label: "Remplacement freins",
    subItems: [
      { key: "brake_pads_front", label: "Plaquettes avant" },
      { key: "brake_pads_rear", label: "Plaquettes arrière" },
      { key: "brake_disc_front", label: "Disques avant" },
      { key: "brake_disc_rear", label: "Disques arrière" },
    ],
  },
};

const ITEM_GROUPS = [
  { label: "Moteur",        emoji: "🔧", keys: ["oil_change_moto", "spark_plug", "air_filter", "valve_clearance"] },
  { label: "Transmission",  emoji: "⛓️", keys: ["chain_kit", "chain_maintenance"] },
  { label: "Freinage",      emoji: "🛑", hierarchical: "brake_replacement" },
  { label: "Suspension",    emoji: "🔩", keys: ["fork_service", "wheel_bearings", "steering_bearings"] },
  { label: "Pneumatiques",  emoji: "🏍️", hierarchical: "tire_replacement" },
  { label: "Électronique",  emoji: "⚡", keys: ["battery", "carburetor_cleaning", "injection_sync", "electronic_diagnosis"] },
];

/**
 * RevisionChecklistModal
 *
 * Props:
 *   vehicleId           {number}    ID du véhicule
 *   interventionType    {string}    Type d'intervention principal (ex: "Révision périodique (km)")
 *   date                {string}    Date ISO de la révision
 *   mileage             {number}    Kilométrage de la révision
 *   cost                {number}    Coût total de la révision
 *   notes               {string}    Notes additionnelles
 *   maintenanceCategory {string}    Catégorie de maintenance
 *   otherTitle          {string}    Titre personnalisé (si "Autre")
 *   invoiceFiles        {Array}     Fichiers de facture
 *   upcomingData        {Array}     Résultat de GET /upcoming (pré-cochage intelligent)
 *   onClose             {Function}  Fermeture (annulation ou fin)
 *   onSuccess           {Function}  Appelé après enregistrement réussi
 */
export default function RevisionChecklistModal({
  vehicleId,
  interventionType,
  date,
  mileage,
  cost = 0,
  notes = '',
  maintenanceCategory = 'scheduled',
  otherTitle = '',
  invoiceFiles = [],
  upcomingData = [],
  onClose,
  onSuccess,
}) {
  const [checked, setChecked]  = useState({});
  const [subChecked, setSubChecked] = useState({});
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading]  = useState(false);
  const [done, setDone]        = useState(false);
  const [savedCount, setSaved] = useState(0);
  const [error, setError]      = useState(null);

  // Map clé → urgence depuis upcomingData
  const urgencyMap = useCallback(() => {
    const map = {};
    for (const item of upcomingData) {
      const key = Object.entries(RECORDABLE_LABELS).find(
        ([, label]) => label === item.intervention_type
      )?.[0];
      if (key) {
        if (item.status === "overdue" || item.status === "urgent") map[key] = "due";
        else if (item.status === "warning") map[key] = "soon";
      }
    }
    return map;
  }, [upcomingData]);

  // Initialiser coches : ALWAYS_CHECKED + items "due"
  useEffect(() => {
    const urg = urgencyMap();
    const initial = {};
    const initialSub = {};

    for (const key of Object.keys(RECORDABLE_LABELS)) {
      initial[key] = ALWAYS_CHECKED.includes(key) || urg[key] === "due";
    }

    // Initialiser les sous-cases (décochées par défaut)
    for (const [parentKey, config] of Object.entries(HIERARCHICAL_ITEMS)) {
      for (const sub of config.subItems) {
        initialSub[`${parentKey}_${sub.key}`] = false;
      }
    }

    setChecked(initial);
    setSubChecked(initialSub);
  }, [urgencyMap]);

  const toggle = (key) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleSub = (subKey) => setSubChecked((prev) => ({ ...prev, [subKey]: !prev[subKey] }));
  const toggleExpand = (key) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // Compter les items sélectionnés (simples + sous-cases)
  const selectedCount = React.useMemo(() => {
    let count = 0;
    // Items simples
    for (const [key, value] of Object.entries(checked)) {
      if (value) count++;
    }
    // Sous-cases
    for (const [key, value] of Object.entries(subChecked)) {
      if (value) count++;
    }
    return count;
  }, [checked, subChecked]);

  const handleSubmit = async () => {
    if (selectedCount === 0) { onClose(); return; }
    setLoading(true);
    setError(null);
    try {
      // Construire la liste des sous-interventions
      const subInterventions = [];

      // Items simples
      for (const [key, value] of Object.entries(checked)) {
        if (value) {
          subInterventions.push({
            key: key,
            name: RECORDABLE_LABELS[key],
          });
        }
      }

      // Sous-cases hiérarchiques
      for (const [parentKey, config] of Object.entries(HIERARCHICAL_ITEMS)) {
        for (const sub of config.subItems) {
          const subKey = `${parentKey}_${sub.key}`;
          if (subChecked[subKey]) {
            subInterventions.push({
              key: sub.key,
              name: sub.label,
            });
          }
        }
      }

      // Créer un seul enregistrement avec sub_interventions
      const payload = new FormData();
      payload.append('intervention_type', interventionType);
      payload.append('execution_date', date);
      payload.append('mileage_at_intervention', String(mileage));
      payload.append('maintenance_category', maintenanceCategory);
      if (cost > 0) payload.append('cost_paid', String(cost));
      if (notes) payload.append('notes', notes);
      if (otherTitle && interventionType === 'Autre') {
        payload.append('other_description', otherTitle);
      }
      // Envoyer sub_interventions comme JSON string
      payload.append('sub_interventions', JSON.stringify(subInterventions));
      // Ajouter les fichiers de facture
      invoiceFiles.forEach((file) => payload.append('invoice_files', file));

      await api.createMaintenance(vehicleId, payload);
      setSaved(selectedCount);
      setDone(true);
      onSuccess?.();
    } catch {
      setError("Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  const urg = urgencyMap();

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
              🔧 Détail de la révision
            </h3>
            <p style={{ color: "var(--text-3)", fontSize: "0.8rem" }}>
              Cochez les interventions effectuées à{" "}
              <strong style={{ color: "var(--accent)" }}>
                {mileage.toLocaleString("fr-FR")} km
              </strong>
            </p>
          </div>
          {!loading && (
            <button
              onClick={onClose}
              style={{
                background: "var(--bg-surface)", border: "1px solid var(--border)",
                borderRadius: "0.5rem", color: "var(--text-3)",
                width: 30, height: 30, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", fontSize: "0.9rem",
              }}
            >✕</button>
          )}
        </div>

        {done ? (
          /* ── État succès ── */
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "2.5rem 1.5rem", textAlign: "center", gap: "0.75rem",
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: "rgba(34,197,94,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.6rem",
            }}>✅</div>
            <p style={{ color: "var(--text-1)", fontWeight: 700, fontSize: "1rem" }}>
              {savedCount} intervention{savedCount > 1 ? "s" : ""} enregistrée{savedCount > 1 ? "s" : ""}
            </p>
            <p style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>
              Le planning de maintenance a été mis à jour.
            </p>
            <button onClick={onClose} className="btn btn-primary" style={{ marginTop: "0.5rem" }}>
              Fermer
            </button>
          </div>
        ) : (
          <>
            {/* Liste scrollable */}
            <div style={{ flex: 1, overflowY: "auto", padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              {ITEM_GROUPS.map((group) => {
                // Groupe hiérarchique (freins ou pneus)
                if (group.hierarchical) {
                  const parentKey = group.hierarchical;
                  const config = HIERARCHICAL_ITEMS[parentKey];
                  const isExpanded = expanded[parentKey] || false;

                  // Compter les sous-cases cochées
                  const subCheckedCount = config.subItems.filter(
                    sub => subChecked[`${parentKey}_${sub.key}`]
                  ).length;

                  const hasChecked = subCheckedCount > 0;
                  const bg = hasChecked ? "rgba(108,138,247,0.07)" : "transparent";
                  const border = hasChecked ? "var(--accent)" : "var(--border)";

                  return (
                    <div key={group.label}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 5,
                        marginBottom: "0.4rem",
                        fontSize: "0.7rem", fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.07em",
                        color: "var(--text-3)",
                      }}>
                        <span>{group.emoji}</span>
                        <span>{group.label}</span>
                      </div>

                      {/* Item principal avec expand */}
                      <div
                        onClick={() => toggleExpand(parentKey)}
                        style={{
                          display: "flex", alignItems: "center", gap: "0.65rem",
                          padding: "0.5rem 0.7rem",
                          borderRadius: "0.55rem",
                          border: `1px solid ${border}`,
                          background: bg,
                          cursor: "pointer",
                          transition: "border-color 0.15s, background 0.15s",
                        }}
                      >
                        <div style={{
                          flexShrink: 0, width: 17, height: 17,
                          borderRadius: 3,
                          border: `2px solid ${hasChecked ? "var(--accent)" : "var(--border)"}`,
                          background: hasChecked ? "var(--accent)" : "var(--bg-base)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "white", fontSize: "0.65rem", fontWeight: 700,
                          transition: "all 0.15s",
                        }}>
                          {hasChecked && "✓"}
                        </div>

                        <span style={{
                          flex: 1, fontSize: "0.83rem",
                          color: hasChecked ? "var(--text-1)" : "var(--text-2)",
                          fontWeight: hasChecked ? 500 : 400,
                        }}>
                          {config.label}
                        </span>

                        {subCheckedCount > 0 && (
                          <span style={{
                            fontSize: "0.7rem",
                            color: "var(--accent)",
                            fontWeight: 600,
                          }}>
                            {subCheckedCount}
                          </span>
                        )}

                        <span style={{
                          fontSize: "0.75rem",
                          color: "var(--text-3)",
                          transition: "transform 0.2s",
                          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                        }}>
                          ▼
                        </span>
                      </div>

                      {/* Sous-cases */}
                      {isExpanded && (
                        <div style={{
                          marginTop: "0.35rem",
                          marginLeft: "1.5rem",
                          display: "flex", flexDirection: "column", gap: "0.25rem",
                        }}>
                          {config.subItems.map((sub) => {
                            const subKey = `${parentKey}_${sub.key}`;
                            const isSubChecked = subChecked[subKey] || false;
                            const subBg = isSubChecked ? "rgba(108,138,247,0.05)" : "transparent";
                            const subBorder = isSubChecked ? "var(--accent)" : "var(--border)";

                            return (
                              <label
                                key={sub.key}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  display: "flex", alignItems: "center", gap: "0.65rem",
                                  padding: "0.4rem 0.6rem",
                                  borderRadius: "0.4rem",
                                  border: `1px solid ${subBorder}`,
                                  background: subBg,
                                  cursor: "pointer",
                                  transition: "border-color 0.15s, background 0.15s",
                                }}
                              >
                                <div style={{
                                  flexShrink: 0, width: 14, height: 14,
                                  borderRadius: 2,
                                  border: `2px solid ${isSubChecked ? "var(--accent)" : "var(--border)"}`,
                                  background: isSubChecked ? "var(--accent)" : "var(--bg-base)",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  color: "white", fontSize: "0.55rem", fontWeight: 700,
                                }}>
                                  {isSubChecked && "✓"}
                                </div>

                                <input
                                  type="checkbox"
                                  style={{ display: "none" }}
                                  checked={isSubChecked}
                                  onChange={() => toggleSub(subKey)}
                                />

                                <span style={{
                                  flex: 1, fontSize: "0.78rem",
                                  color: isSubChecked ? "var(--text-1)" : "var(--text-2)",
                                  fontWeight: isSubChecked ? 500 : 400,
                                }}>
                                  {sub.label}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                // Groupe standard avec items simples
                const items = group.keys.filter((k) => k in RECORDABLE_LABELS);
                if (!items.length) return null;

                return (
                  <div key={group.label}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 5,
                      marginBottom: "0.4rem",
                      fontSize: "0.7rem", fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "0.07em",
                      color: "var(--text-3)",
                    }}>
                      <span>{group.emoji}</span>
                      <span>{group.label}</span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {items.map((key) => {
                        const urgency = urg[key];
                        const isChecked = checked[key] ?? false;

                        const bg     = isChecked ? "rgba(108,138,247,0.07)" : "transparent";
                        const border = isChecked ? "var(--accent)" : "var(--border)";

                        return (
                          <label key={key} style={{
                            display: "flex", alignItems: "center", gap: "0.65rem",
                            padding: "0.5rem 0.7rem",
                            borderRadius: "0.55rem",
                            border: `1px solid ${border}`,
                            background: bg,
                            cursor: "pointer",
                            transition: "border-color 0.15s, background 0.15s",
                          }}>
                            {/* Checkbox custom */}
                            <div style={{
                              flexShrink: 0, width: 17, height: 17,
                              borderRadius: 3,
                              border: `2px solid ${isChecked ? "var(--accent)" : "var(--border)"}`,
                              background: isChecked ? "var(--accent)" : "var(--bg-base)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: "white", fontSize: "0.65rem", fontWeight: 700,
                              transition: "all 0.15s",
                            }}>
                              {isChecked && "✓"}
                            </div>

                            <input
                              type="checkbox"
                              style={{ display: "none" }}
                              checked={isChecked}
                              onChange={() => toggle(key)}
                            />

                            <span style={{
                              flex: 1, fontSize: "0.83rem",
                              color: isChecked ? "var(--text-1)" : "var(--text-2)",
                              fontWeight: isChecked ? 500 : 400,
                            }}>
                              {RECORDABLE_LABELS[key]}
                            </span>

                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Footer ── */}
            <div style={{
              padding: "0.9rem 1.25rem",
              borderTop: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem",
            }}>
              {error
                ? <p style={{ color: "var(--danger)", fontSize: "0.78rem", flex: 1 }}>{error}</p>
                : <span style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>
                    {selectedCount} sélectionnée{selectedCount > 1 ? "s" : ""}
                  </span>
              }
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="btn btn-secondary"
                  style={{ fontSize: "0.82rem" }}
                >
                  Passer
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || selectedCount === 0}
                  className="btn btn-primary"
                  style={{ fontSize: "0.82rem", minWidth: 145, opacity: selectedCount === 0 ? 0.5 : 1 }}
                >
                  {loading ? "⏳ Enregistrement…" : `✓ Enregistrer (${selectedCount})`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
