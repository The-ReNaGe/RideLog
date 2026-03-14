/**
 * Configuration Frontend - API, intégrations, constantes.
 */

// API Configuration
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  TIMEOUT: parseInt(import.meta.env.VITE_API_TIMEOUT || '10000'),
  LOG_LEVEL: import.meta.env.VITE_LOG_LEVEL || 'info',
};

// Routes API
export const API_ROUTES = {
  // Véhicules
  VEHICLES: '/api/vehicles',
  VEHICLE_DETAIL: (id) => `/api/vehicles/${id}`,
  VEHICLE_UPCOMMING: (id) => `/api/vehicles/${id}/upcoming`,
  
  // Entretien
  MAINTENANCES: '/api/maintenances',
  MAINTENANCE_DELETE: (id) => `/api/maintenances/${id}`,
  
  // Carburant
  FUELS: '/api/fuels',
  FUEL_STATIONS: '/api/fuel-stations/search',
};

// Status Labels
export const STATUS_LABELS = {
  overdue: '⛔ En retard',
  urgent: '🔴 Urgent',
  planned: '🔔 Planifié',
  warning: '🟡 À prévoir',
  ok: '✅ OK',
};

// Status Colors
export const STATUS_COLORS = {
  overdue: '#CC0000',
  urgent: '#FF4400',
  planned: '#3399FF',
  warning: '#FFAA00',
  ok: '#22CC44',
};

// Integration Statuses
export const INTEGRATION_STATUS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  CONFIGURING: 'configuring',
  ERROR: 'error',
};
