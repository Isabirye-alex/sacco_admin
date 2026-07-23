
export const API_BASE_URL = "https://sacco-api-pb2n.onrender.com";

export const APP_CONFIG = {
  currency: "UGX",
  locale: "en-UG",
  timezone: "Africa/Kampala",
  defaultPageSize: 25,
  maxPageSize: 200,
  apiTimeoutMs: 15000,
  telemetryIntervalMs: 60000,
  featureFlags: {
    enableBulkActions: false,
    enableSystemHealth: true,
    enableWorkflowApprovals: true,
    enableDirectExport: true,
  },
};
