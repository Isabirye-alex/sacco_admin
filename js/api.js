// Thin fetch wrapper: attaches the bearer token, transparently refreshes
// once on a 401, and normalizes errors so callers can just `await` and
// catch a single Error type with a readable message.
import { API_BASE_URL } from "./config.js";

const ACCESS_KEY = "sacco_access_token";
const REFRESH_KEY = "sacco_refresh_token";

export const tokenStore = {
  getAccess() {
    return sessionStorage.getItem(ACCESS_KEY) || localStorage.getItem(ACCESS_KEY);
  },
  getRefresh() {
    return sessionStorage.getItem(REFRESH_KEY) || localStorage.getItem(REFRESH_KEY);
  },
  isPersistent() {
    return Boolean(localStorage.getItem(ACCESS_KEY) || localStorage.getItem(REFRESH_KEY));
  },
  set(access, refresh, remember = false) {
    if (remember) {
      localStorage.setItem(ACCESS_KEY, access);
      if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
      sessionStorage.removeItem(ACCESS_KEY);
      sessionStorage.removeItem(REFRESH_KEY);
    } else {
      sessionStorage.setItem(ACCESS_KEY, access);
      if (refresh) sessionStorage.setItem(REFRESH_KEY, refresh);
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    }
  },
  clear() {
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function refreshAccessToken() {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    tokenStore.set(data.access_token, data.refresh_token, tokenStore.isPersistent());
    return true;
  } catch {
    return false;
  }
}

function extractErrorMessage(body) {
  if (!body) return "Something went wrong. Please try again.";
  if (typeof body.detail === "string") return body.detail;
  if (Array.isArray(body.detail)) {
    return body.detail.map((d) => d.msg || JSON.stringify(d)).join(" ");
  }
  return body.message || "Something went wrong. Please try again.";
}

/**
 * @param {string} path e.g. "/api/v1/members"
 * @param {object} options { method, body, auth }
 */
export async function apiRequest(path, options = {}) {
  const { method = "GET", body, auth = true, isForm = false, retry = true } = options;

  const headers = {};
  if (!isForm) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = tokenStore.getAccess();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });

  if (res.status === 401 && auth && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiRequest(path, { ...options, retry: false });
    }
    tokenStore.clear();
    window.location.hash = "#/login";
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }

  if (res.status === 204) return null;

  let payload = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    throw new ApiError(extractErrorMessage(payload), res.status, payload);
  }
  return payload;
}

export const api = {
  get: (path) => apiRequest(path, { method: "GET" }),
  post: (path, body) => apiRequest(path, { method: "POST", body }),
  patch: (path, body) => apiRequest(path, { method: "PATCH", body }),
  del: (path) => apiRequest(path, { method: "DELETE" }),
};

export { ApiError };
