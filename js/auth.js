import { API_BASE_URL } from "./config.js";
import { api, tokenStore, ApiError } from "./api.js";

let currentUser = null;

export function isAuthenticated() {
  return Boolean(tokenStore.getAccess());
}

export function getCurrentUser() {
  return currentUser;
}

export function hasRole(...roles) {
  return currentUser && roles.includes(currentUser.role);
}

let inactivityTimer = null;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  if (isAuthenticated()) {
    inactivityTimer = setTimeout(() => {
      logout();
      alert("Session expired due to 30 minutes of inactivity. Please sign in again.");
    }, IDLE_TIMEOUT_MS);
  }
}

if (typeof window !== "undefined") {
  ["mousemove", "keydown", "click", "scroll", "touchstart"].forEach((evt) => {
    window.addEventListener(evt, resetInactivityTimer, { passive: true });
  });
}

export async function login(email, password, remember = false) {
  const form = new URLSearchParams();
  form.set("username", email);
  form.set("password", password);

  const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.detail || "Incorrect email or password.", res.status);
  }

  const data = await res.json();
  tokenStore.set(data.access_token, data.refresh_token, remember);
  resetInactivityTimer();
  await loadCurrentUser();
  return currentUser;
}

export function logout() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  tokenStore.clear();
  currentUser = null;
  window.location.hash = "#/login";
}

export async function loadCurrentUser() {
  currentUser = await api.get("/api/v1/auth/me");
  resetInactivityTimer();
  return currentUser;
}
