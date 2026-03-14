import axios from 'axios';

// In production (nginx), all requests go to /api on the same origin.
// In development (vite dev server), the proxy rewrites /api -> http://backend:8000/api
const API_BASE = import.meta.env.VITE_API_URL || '/api';

const client = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Request interceptor: Ajoute le token JWT dans les headers
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global response interceptor for consistent error logs
client.interceptors.response.use(
  (response) => response,
  (error) => {
    // Si 401: token expiré ou invalide
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      // Redirige vers login (implémenté dans App.jsx)
      window.dispatchEvent(new Event('tokenExpired'));
    }
    const msg = error.response?.data?.detail || error.message;
    console.error(`[AutoLab API] ${error.config?.method?.toUpperCase()} ${error.config?.url} → ${error.response?.status || 'ERR'}: ${msg}`);
    return Promise.reject(error);
  }
);

export const api = {
  // ═══════════════════════════════════════════════════════════════════════
  // AUTHENTIFICATION
  // ═══════════════════════════════════════════════════════════════════════
  register: (username, displayName, password, passwordConfirm, inviteToken) =>
    client.post('/auth/register', {
      username,
      display_name: displayName,
      password,
      password_confirm: passwordConfirm,
      invite_token: inviteToken || undefined,
    }),
  
  login: (username, password) =>
    client.post('/auth/login', { username, password }),
  
  getCurrentUser: () =>
    client.get('/auth/me'),
  
  logout: () =>
    client.post('/auth/logout'),

  refreshToken: () =>
    client.post('/auth/refresh'),

  initHomeAssistant: () =>
    client.post('/auth/ha-init'),

  // Admin
  getAllUsers: () =>
    client.get('/admin/users'),
  
  deleteUser: (userId) =>
    client.delete(`/admin/users/${userId}`),
  
  promoteUser: (userId) =>
    client.put(`/admin/users/${userId}/promote`),

  // Invitations
  getInvitations: () =>
    client.get('/admin/invitations'),
  
  createInvitation: (expiresHours = 48) =>
    client.post('/admin/invitations', { expires_hours: expiresHours }),
  
  deleteInvitation: (invitationId) =>
    client.delete(`/admin/invitations/${invitationId}`),
  
  getRegistrationMode: () =>
    client.get('/admin/registration-mode'),
  
  setRegistrationMode: (mode) =>
    client.put('/admin/registration-mode', { mode }),
  
  checkInvite: (token) =>
    client.get(`/auth/check-invite/${token}`),
  
  getRegistrationStatus: () =>
    client.get('/auth/registration-status'),

  // Config / health
  getConfig: () => client.get(''),
  getVehicleModels: () => client.get('/vehicle-models'),

  // ═══════════════════════════════════════════════════════════════════════
  // VÉHICULES (nécessite authentification)
  // ═══════════════════════════════════════════════════════════════════════
  getVehicles: () => client.get('/vehicles'),
  getVehicle: (id) => client.get(`/vehicles/${id}`),
  createVehicle: (data) => client.post('/vehicles', data),
  updateVehicle: (id, data) => client.put(`/vehicles/${id}`, data),
  deleteVehicle: (id) => client.delete(`/vehicles/${id}`),
  decodeVin: (vin) => 
    client.post('/vehicles/decode-vin', null, {
      params: { vin }
    }),
  decodeLicensePlate: (plate, vehicle_type_hint) =>
    client.post('/vehicles/decode-license-plate', null, {
      params: { plate, vehicle_type_hint }
    }),
  suggestCategory: (brand, year, vehicle_type, purchase_price) => 
    client.post('/vehicles/suggest-category', null, {
      params: { brand, year, vehicle_type, purchase_price }
    }),
  getBrandServiceDefaults: (brand, displacement) =>
    client.get('/vehicles/brand-service-defaults', {
      params: { brand, displacement }
    }),

  // Vehicle photo
  uploadVehiclePhoto: (vehicleId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return client.post(`/vehicles/${vehicleId}/photo`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  deleteVehiclePhoto: (vehicleId) => client.delete(`/vehicles/${vehicleId}/photo`),
  getVehiclePhotoUrl: (vehicleId) => `${API_BASE}/vehicles/${vehicleId}/photo`,

  // Maintenances
  getMaintenances: (vehicleId) => client.get(`/vehicles/${vehicleId}/maintenances`),
  createMaintenance: (vehicleId, data) => {
    if (typeof FormData !== 'undefined' && data instanceof FormData) {
      return client.post(`/vehicles/${vehicleId}/maintenances`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return client.post(`/vehicles/${vehicleId}/maintenances`, data);
  },
  updateMaintenance: (vehicleId, maintenanceId, data) =>
    client.put(`/vehicles/${vehicleId}/maintenances/${maintenanceId}`, data),
  updateMaintenanceWithFiles: (vehicleId, maintenanceId, data) =>
    client.put(`/vehicles/${vehicleId}/maintenances/${maintenanceId}`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deleteMaintenance: (vehicleId, maintenanceId) =>
    client.delete(`/vehicles/${vehicleId}/maintenances/${maintenanceId}`),
  getPlanning: () => client.get('/vehicles/planning'),
  getUpcoming: (vehicleId) => client.get(`/vehicles/${vehicleId}/upcoming`),
  getRecommendations: (vehicleId) => client.get(`/vehicles/${vehicleId}/recommendations`),
  getCostForecast: (vehicleId) => client.get(`/vehicles/${vehicleId}/cost-forecast`),
  getMaintenanceInvoiceUrl: (vehicleId, maintenanceId) =>
    `${API_BASE}/vehicles/${vehicleId}/maintenances/${maintenanceId}/invoice`,

  // Maintenance recap
  getMaintenanceRecap: (vehicleId) => client.get(`/vehicles/${vehicleId}/recap`),
  getRecapDownloadUrl: (vehicleId) => `${API_BASE}/vehicles/${vehicleId}/recap/download`,
  getAvailableInterventions: (vehicleId, vehicleType, displacement) => 
    client.get(`/vehicles/${vehicleId}/available-interventions?vehicle_type=${vehicleType}&displacement=${displacement || ''}`),

  // Fuel tracking
  getFuelLogs: (vehicleId) => client.get(`/vehicles/${vehicleId}/fuel-logs`),
  createFuelLog: (vehicleId, data) => client.post(`/vehicles/${vehicleId}/fuel-logs`, data),
  updateFuelLog: (vehicleId, fuelLogId, data) => client.put(`/vehicles/${vehicleId}/fuel-logs/${fuelLogId}`, data),
  deleteFuelLog: (vehicleId, fuelLogId) => client.delete(`/vehicles/${vehicleId}/fuel-logs/${fuelLogId}`),
  getFuelStats: (vehicleId) => client.get(`/vehicles/${vehicleId}/fuel-stats`),

  // Exports
  getVehicleEstimate: (vehicleId) => client.get(`/vehicles/${vehicleId}/estimate`),

  getHaDashboardCard: (vehicleId) => client.get(`/vehicles/${vehicleId}/ha-dashboard-card`),

  // Webhooks / Discord
  getWebhooks: () => client.get('/settings/webhooks'),
  createWebhook: (data) => client.post('/settings/webhooks', data),
  deleteWebhook: (id) => client.delete(`/settings/webhooks/${id}`),
  toggleWebhook: (id, data) => client.put(`/settings/webhooks/${id}`, data),
  testWebhook: (id) => client.post(`/settings/webhooks/${id}/test`),
  checkReminders: () => client.post('/settings/webhooks/check-reminders'),

  // Dashboard
  getDashboard: () => client.get('/dashboard'),

  // Generic request method for flexible API calls
  request: (method, url, data = null, config = {}) => {
    return client({
      method,
      url,
      data,
      ...config,
    });
  },

  // Authenticated file download (creates blob + triggers browser download)
  downloadFile: async (url, filename) => {
    const response = await client.get(url, { responseType: 'blob' });
    const blob = new Blob([response.data]);
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  },
};

export default client;
