import { login, logout, isAuthenticated, loadCurrentUser, getCurrentUser } from "./auth.js";
import { registerRoute, startRouter, goTo, refreshCurrentRoute } from "./router.js";
import { showToast, titleCase } from "./utils.js";

import { renderDashboard } from "./views/dashboard.js";
import { renderMembers } from "./views/members.js";
import { renderSavings } from "./views/savings.js";
import { renderLoans } from "./views/loans.js";
import { renderAccounting } from "./views/accounting.js";
import { renderPayroll } from "./views/payroll.js";
import { renderShares } from "./views/shares.js";
import { renderGroups } from "./views/groups.js";
import { renderNotifications } from "./views/notifications.js";
import { renderReports } from "./views/reports.js";
import { renderRisk } from "./views/risk.js";
import { renderUsers } from "./views/users.js";

registerRoute("/dashboard", "Dashboard", renderDashboard);
registerRoute("/members", "Members", renderMembers);
registerRoute("/savings", "Savings", renderSavings);
registerRoute("/loans", "Credit & Loans", renderLoans);
registerRoute("/accounting", "Accounting", renderAccounting);
registerRoute("/payroll", "HR & Payroll", renderPayroll);
registerRoute("/shares", "Shares Management", renderShares);
registerRoute("/groups", "Group Management", renderGroups);
registerRoute("/notifications", "Notifications", renderNotifications);
registerRoute("/reports", "Reports & Analytics", renderReports);
registerRoute("/risk", "Risk & Compliance", renderRisk);
registerRoute("/users", "Users & Audit", renderUsers);

function renderUserChip() {
  const user = getCurrentUser();
  const chip = document.getElementById("user-chip");
  if (!user) return;
  chip.innerHTML = "";
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = user.full_name;
  const role = document.createElement("span");
  role.className = "role";
  role.textContent = titleCase(user.role);
  chip.appendChild(name);
  chip.appendChild(role);
}

/**
 * Manages global search redirects to the members view
 */
function initGlobalSearch() {
  const searchInput = document.getElementById("global-search");
  if (!searchInput) return;

  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const query = encodeURIComponent(searchInput.value.trim());
      if (query) {
        // Appends the query safely for the router or views to interpret
        goTo(`/members?search=${query}`);
      }
    }
  });
}

/**
 * Handles fetching audit/risk logs and syncing the notification bell UI
 */
function initNotificationSync() {
  const bellBtn = document.getElementById("bell-btn");
  const bellDropdown = document.getElementById("bell-dropdown");
  const bellBadge = document.getElementById("bell-badge");
  const bellItems = document.getElementById("bell-items");
  const clearBtn = document.getElementById("bell-clear-btn");

  if (!bellBtn || !bellDropdown) return;

  // Toggle Dropdown Display
  bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = bellDropdown.style.display === "none" || !bellDropdown.style.display;
    bellDropdown.style.display = isHidden ? "block" : "none";
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", () => {
    bellDropdown.style.display = "none";
  });
  bellDropdown.addEventListener("click", (e) => e.stopPropagation());

  // Fetch telemetry / audit data
  async function fetchSystemLogs() {
    try {
      // Modify this path endpoint to match your environment routing if necessary
      const response = await fetch("/api/logs/system-warnings"); 
      if (!response.ok) throw new Error("Network response failure.");
      
      const logs = await response.json(); 
      renderNotificationsUI(logs);
    } catch (error) {
      console.error("Failed to sync notification telemetry:", error);
    }
  }

  function renderNotificationsUI(logs) {
    const activeAlerts = logs.filter(log => !log.read);

    if (activeAlerts.length > 0) {
      bellBadge.textContent = activeAlerts.length > 99 ? "99+" : activeAlerts.length;
      bellBadge.style.display = "block";
      
      bellItems.innerHTML = activeAlerts.map(alert => `
        <div class="notification-item" style="padding: 8px; border-radius: 4px; background: #fdf2f2; border-left: 3px solid #B3261E; font-size: 12px; font-family: system-ui, sans-serif;">
          <strong style="display: block; color: #B3261E;">${alert.severity || "WARNING"}</strong>
          <span style="color: var(--pine-900);">${alert.message}</span>
        </div>
      `).join("");
    } else {
      bellBadge.style.display = "none";
      bellItems.innerHTML = `<div class="muted small" style="text-align: center; padding: 20px 0;">No active system warnings.</div>`;
    }
  }

  // Clear/Mark Read Action
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      try {
        await fetch("/api/logs/clear", { method: "POST" });
        renderNotificationsUI([]);
      } catch (err) {
        console.error("Failed to clear notifications:", err);
      }
    });
  }

  // Initial call and poll interval sync every 30 seconds
  fetchSystemLogs();
  setInterval(fetchSystemLogs, 30000);
}

async function bootstrap() {
  if (isAuthenticated()) {
    try {
      await loadCurrentUser();
      renderUserChip();
    } catch {
      logout();
    }
  }
  startRouter();
  
  // Initialize navigation & real-time notification dependencies
  initGlobalSearch();
  initNotificationSync();
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  errorEl.hidden = true;

  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in\u2026";

  try {
    await login(email, password);
    renderUserChip();
    goTo("/dashboard");
    refreshCurrentRoute();
    showToast(`Welcome back, ${getCurrentUser().full_name.split(" ")[0]}!`, "success");
  } catch (err) {
    errorEl.textContent = err.message || "Unable to sign in.";
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign in";
  }
});

document.getElementById("logout-btn").addEventListener("click", () => {
  logout();
});

document.getElementById("menu-toggle").addEventListener("click", () => {
  document.querySelector(".sidebar").classList.toggle("open");
});

bootstrap();