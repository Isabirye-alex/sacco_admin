import { login, logout, isAuthenticated, loadCurrentUser, getCurrentUser } from "./auth.js";
import { registerRoute, startRouter, goTo, refreshCurrentRoute } from "./router.js";
import { showToast, titleCase, setButtonLoadingState, el, initials, refreshIcons, debounce, initGlobalButtonSpinners } from "./utils.js";
import { api } from "./api.js";
import { initCommandPalette } from "./command-palette.js";

import { renderDashboard } from "./views/dashboard.js";
import { renderWorkflows } from "./views/workflows.js";
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
import { renderReferrals } from "./views/referrals.js";
import { renderBranches } from "./views/branches.js";
import { renderSystem } from "./views/system.js";

registerRoute("/dashboard", "Dashboard", renderDashboard);
registerRoute("/workflows", "Approvals", renderWorkflows);
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
registerRoute("/system", "System Health", renderSystem);
registerRoute("/referrals", "Referrals", renderReferrals);
registerRoute("/users", "Users & Audit", renderUsers);
registerRoute("/branches", "Branch Management", renderBranches);

function renderUserChip() {
  const user = getCurrentUser();
  if (!user) return;
  const nameEl = document.getElementById("user-name");
  const roleEl = document.getElementById("user-role");
  const avatar = document.getElementById("user-avatar");
  if (nameEl) nameEl.textContent = user.full_name;
  if (roleEl) roleEl.textContent = user.role.replace(/_/g, " ");
  if (avatar) avatar.textContent = initials(user.full_name);
  refreshIcons(document.querySelector(".sidebar-footer"));
}

/**
 * Global search redirects to the members view
 */
function initGlobalSearch() {
  const searchInput = document.getElementById("global-search");
  if (!searchInput) return;
  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const query = encodeURIComponent(searchInput.value.trim());
      if (query) goTo(`/members?search=${query}`);
    }
  });
}

/**
 * Polls system notifications and the audit log to power the notification bell.
 */
function initNotificationSync() {
  const bellBtn = document.getElementById("bell-btn");
  const bellDropdown = document.getElementById("bell-dropdown");
  const bellBadge = document.getElementById("bell-badge");
  const bellItems = document.getElementById("bell-items");
  const clearBtn = document.getElementById("bell-clear-btn");

  if (!bellBtn || !bellDropdown) return;

  bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = bellDropdown.style.display === "none" || !bellDropdown.style.display;
    bellDropdown.style.display = isHidden ? "block" : "none";
  });

  document.addEventListener("click", () => { bellDropdown.style.display = "none"; });
  bellDropdown.addEventListener("click", (e) => e.stopPropagation());

  async function fetchSystemLogs() {
    if (!isAuthenticated()) return;
    try {
      // Pull open risk flags + open workflow items as a proxy for system-level warnings
      const [flags, loans] = await Promise.all([
        api.get("/api/v1/risk/flags?flag_status=open").catch(() => []),
        api.get("/api/v1/loans/applications?loan_status=pending").catch(() => []),
      ]);
      const warnings = [];
      flags.forEach((f) => {
        warnings.push({
          severity: ["ghost_member", "aml_suspicious_deposit"].includes(f.flag_type) ? "CRITICAL" : "WARNING",
          message: `${(f.flag_type || "").replace(/_/g, " ")}: ${f.description?.slice(0, 80) || "—"}`,
        });
      });
      if (loans.length > 0) {
        warnings.push({
          severity: "INFO",
          message: `${loans.length} loan application${loans.length === 1 ? "" : "s"} awaiting review`,
        });
      }
      renderNotificationsUI(warnings);
      updateNavBadge(warnings.length);
    } catch (err) {
      console.error("Failed to sync notification telemetry:", err);
    }
  }

  function renderNotificationsUI(warnings) {
    if (warnings.length > 0) {
      bellBadge.textContent = warnings.length > 99 ? "99+" : String(warnings.length);
      bellBadge.style.display = "block";
      bellItems.innerHTML = warnings.map((w) => `
        <div style="padding: 10px 14px; border-bottom: 1px solid var(--line-2); font-size: 13px;">
          <div style="font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; color: ${w.severity === "CRITICAL" ? "var(--danger)" : w.severity === "WARNING" ? "var(--warn)" : "var(--info)"};">${w.severity}</div>
          <div style="color: var(--ink-700); margin-top: 2px;">${w.message}</div>
        </div>
      `).join("");
    } else {
      bellBadge.style.display = "none";
      bellItems.innerHTML = `<div class="muted small" style="text-align: center; padding: 24px 16px;">No active system warnings.</div>`;
    }
  }

  function updateNavBadge(count) {
    const wf = document.getElementById("nav-badge-workflows");
    if (wf) {
      wf.textContent = count > 99 ? "99+" : String(count);
      wf.hidden = count === 0;
    }
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      bellBadge.style.display = "none";
      bellItems.innerHTML = `<div class="muted small" style="text-align: center; padding: 24px 16px;">No active system warnings.</div>`;
    });
  }

  fetchSystemLogs();
  setInterval(fetchSystemLogs, 30000);
}

async function bootstrap() {
  initCommandPalette();
  initGlobalButtonSpinners();
  if (isAuthenticated()) {
    try {
      await loadCurrentUser();
      renderUserChip();
    } catch {
      logout();
    }
  }
  startRouter();
  initGlobalSearch();
  initNotificationSync();
  // Initial icon pass for static UI
  if (window.lucide) window.lucide.createIcons();
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  errorEl.hidden = true;

  const submitBtn = e.target.querySelector("button[type=submit]");
  setButtonLoadingState(submitBtn, true, "Signing in…");

  try {
    await login(email, password);
    renderUserChip();
    goTo("/dashboard");
    refreshCurrentRoute();
    showToast(`Welcome back, ${getCurrentUser().full_name.split(" ")[0]}!`, "success");
    refreshIcons();
  } catch (err) {
    errorEl.textContent = err.message || "Unable to sign in.";
    errorEl.hidden = false;
  } finally {
    setButtonLoadingState(submitBtn, false);
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
