/**
 * Custom Lovelace Card - Auto Maintenance List
 * 
 * Affiche dynamiquement les entretiens en retard et à venir
 * Réutilisable avec juste le changement du nom du véhicule
 * 
 * Usage:
 * type: custom:autolab-maintenance-card
 * vehicle_id: triumph_street_triple
 * title: 🚗 Triumph Street Triple
 */

class AutoLabMaintenanceCard extends HTMLElement {
  setConfig(config) {
    this.config = config;
    this.vehicleId = config.vehicle_id;
    this.title = config.title || this.vehicleId;
  }

  set hass(hass) {
    this.hass = hass;
    this.render();
  }

  render() {
    if (!this.vehicleId) {
      this.innerHTML = `<ha-alert alert-type="error">vehicle_id is required</ha-alert>`;
      return;
    }

    const overdueSensor = `sensor.${this.vehicleId}_maintenance_en_retard`;
    const upcomingSensor = `sensor.${this.vehicleId}_maintenance_a_venir`;
    const summarySensor = `sensor.${this.vehicleId}_summary`;

    const overdueData = this.hass.states[overdueSensor];
    const upcomingData = this.hass.states[upcomingSensor];
    const summary = this.hass.states[summarySensor];

    if (!overdueData || !upcomingData) {
      this.innerHTML = `<ha-alert alert-type="warning">Entités non trouvées pour ${this.vehicleId}</ha-alert>`;
      return;
    }

    const overdueMaintenances = overdueData.attributes.maintenances || [];
    const upcomingMaintenances = upcomingData.attributes.maintenances || [];

    let html = `
      <div style="background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="margin: 0 0 8px 0; font-size: 20px;">🚗 ${this.title}</h2>
        <p style="margin: 0 0 16px 0; color: #666; font-size: 14px;">Gestion maintenance</p>
        
        <!-- Stats -->
        <div style="display: flex; gap: 12px; margin-bottom: 24px;">
          <div style="flex: 1; padding: 12px; background: #ffebee; border-radius: 6px; color: #c62828;">
            <strong>${overdueMaintenances.length}</strong> en retard
          </div>
          <div style="flex: 1; padding: 12px; background: #fff3e0; border-radius: 6px; color: #e65100;">
            <strong>${upcomingMaintenances.length}</strong> à venir
          </div>
        </div>
    `;

    // Section à venir
    if (upcomingMaintenances.length > 0) {
      html += `
        <h3 style="margin: 20px 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #ff9800;">
          🟠 Entretiens à venir (${upcomingMaintenances.length})
        </h3>
      `;
      upcomingMaintenances.forEach((m, idx) => {
        html += this.renderMaintenanceCard(m, 'orange');
      });
    }

    // Section en retard
    if (overdueMaintenances.length > 0) {
      html += `
        <h3 style="margin: 20px 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #f44336;">
          🔴 Entretiens en retard (${overdueMaintenances.length})
        </h3>
      `;
      overdueMaintenances.forEach((m, idx) => {
        html += this.renderMaintenanceCard(m, 'red');
      });
    } else {
      html += `
        <div style="margin: 20px 0; padding: 12px; background: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px;">
          ✅ Aucun entretien en retard
        </div>
      `;
    }

    html += `</div>`;
    this.innerHTML = html;
  }

  renderMaintenanceCard(maintenance, color) {
    const colors = {
      orange: { bg: 'rgba(255, 152, 0, 0.1)', border: '#ff9800' },
      red: { bg: 'rgba(244, 67, 54, 0.1)', border: '#f44336' }
    };
    const style = colors[color] || colors.orange;

    let details = [];
    
    if (maintenance.km_remaining && maintenance.km_remaining !== 999999) {
      details.push(`📏 ${Math.abs(maintenance.km_remaining)} km`);
    }
    if (maintenance.days_remaining && maintenance.days_remaining !== 999999) {
      details.push(`📅 ${Math.abs(maintenance.days_remaining)} j`);
    }
    if (maintenance.estimated_cost_min !== undefined) {
      details.push(`💰 ${maintenance.estimated_cost_min}€–${maintenance.estimated_cost_max}€`);
    }

    return `
      <div style="
        background: ${style.bg};
        border-left: 4px solid ${style.border};
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 8px;
        font-size: 14px;
      ">
        <div style="font-weight: bold; margin-bottom: 4px;">${maintenance.intervention_type}</div>
        <div style="color: #555; font-size: 13px;">${details.join(' • ')}</div>
      </div>
    `;
  }

  getCardSize() {
    return 4;
  }
}

customElements.define('autolab-maintenance-card', AutoLabMaintenanceCard);
