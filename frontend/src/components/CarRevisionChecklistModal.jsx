import React, { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

// Mapping clé technique → nom français
const RECORDABLE_LABELS_CAR = {
  oil_change:           "Vidange + filtre à huile",
  air_filter:           "Remplacement filtre à air",
  cabin_filter:         "Remplacement filtre d'habitacle",
  fuel_filter_diesel:   "Remplacement filtre à gasoil",
  fuel_filter_gasoline: "Remplacement filtre à essence",
  spark_plug:           "Remplacement bougies d'allumage",
  brake_fluid:          "Purge de frein",
  coolant:              "Renouvellement liquide de refroidissement",
  transmission_fluid:   "Renouvellement liquide de transmission",
  battery:              "Remplacement batterie",
  // Les items freins et pneus sont gérés avec des sous-cases
};

// Configuration des items avec sous-cases
const HIERARCHICAL_ITEMS = {
  tire_replacement: {
    label: "Remplacement pneus",
    subItems: [
      { key: "tire_front", label: "Pneus avant" },
      { key: "tire_rear", label: "Pneus arrière" },
      { key: "tire_all", label: "Les 4 pneus" },
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

const ITEM_GROUPS_CAR = [
  { label: "Moteur",        emoji: "🔧", keys: ["oil_change", "air_filter", "spark_plug"] },
  { label: "Filtration",    emoji: "🌬️", keys: ["cabin_filter", "fuel_filter_diesel", "fuel_filter_gasoline"] },
  { label: "Liquides",      emoji: "💧", keys: ["brake_fluid", "coolant", "transmission_fluid"] },
  { label: "Freinage",      emoji: "🛑", hierarchical: "brake_replacement" },
  { label: "Pneumatiques", emoji: "🚗", hierarchical: "tire_replacement" },
  { label: "Électrique",   emoji: "⚡", keys: ["battery"] },
];

/**
 * CarRevisionChecklistModal
 *
 * Props:
 *   vehicleId           {number}    ID du véhicule
 *   interventionType    {string}    Type d'intervention principal (ex: "Vidange d'huile")
 *   date                {string}    Date ISO de la révision
 *   mileage             {number}   Kilométrage de la révision
 *   cost                {number}    Coût total de la révision
 *   notes               {string}    Notes additionnelles
 *   maintenanceCategory {string}    Catégorie de maintenance
 *   otherTitle          {string}    Titre personnalisé (si "Autre")
 *   invoiceFiles        {Array}     Fichiers de facture
 *   motorization        {string}    Motorisation du véhicule (diesel, essence, hybride, electrique, thermal)
 *   upcomingData        {Array}     Résultat de GET /upcoming (pré-cochage intelligent)
 *   onClose             {Function}  Fermeture (annulation ou fin)
 *   onSuccess           {Function}  Appelé après enregistrement réussi
 */
export default function CarRevisionChecklistModal({
  vehicleId,
  interventionType,
  date,
  mileage,
  cost = 0,
  notes = '',
  maintenanceCategory = 'scheduled',
  otherTitle = '',
  invoiceFiles = [],
  motorization,
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
      const key = Object.entries(RECORDABLE_LABELS_CAR).find(
        ([, label]) => label === item.intervention_type
      )?.[0];
      if (key) {
        if (item.status === "overdue" || item.status === "urgent") map[key] = "due";
        else if (item.status === "warning") map[key] = "soon";
      }
    }
    return map;
  }, [upcomingData]);

  // Initialiser coches : items pertinents selon motorisation + items "due"
  useEffect(() => {
    const urg = urgencyMap();
    const initial = {};
    const initialSub = {};

    // Items toujours pré-cochés selon la motorisation
    const alwaysChecked = [
      "oil_change",
      "air_filter",
      "cabin_filter",
      ...(motorization === "diesel" ? ["fuel_filter_diesel"] : []),
      ...(["essence", "hybride"].includes(motorization) ? ["fuel_filter_gasoline"] : []),
    ];

    for (const key of Object.keys(RECORDABLE_LABELS_CAR)) {
      initial[key] = alwaysChecked.includes(key) || urg[key] === "due";
    }

    // Initialiser les sous-cases (décochées par défaut)
    for (const [parentKey, config] of Object.entries(HIERARCHICAL_ITEMS)) {
      for (const sub of config.subItems) {
        initialSub[`${parentKey}_${sub.key}`] = false;
      }
    }

    setChecked(initial);
    setSubChecked(initialSub);
  }, [urgencyMap, motorization]);

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
            name: RECORDABLE_LABELS_CAR[key],
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
              {ITEM_GROUPS_CAR.map((group) => {
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
                const items = group.keys.filter((k) => {
                  if (!(k in RECORDABLE_LABELS_CAR)) return false;

                  // Filtre à gasoil : uniquement pour diesel
                  if (k === "fuel_filter_diesel" && motorization !== "diesel") return false;

                  // Filtre à essence : uniquement pour essence, hybride
                  if (k === "fuel_filter_gasoline" && !["essence", "hybride"].includes(motorization)) return false;

                  // Bougies : uniquement pour essence, hybride (pas diesel ni électrique)
                  if (k === "spark_plug" && !["essence", "hybride"].includes(motorization)) return false;

                  return true;
                });

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
                              {RECORDABLE_LABELS_CAR[key]}
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
