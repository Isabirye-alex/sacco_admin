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
