import { api } from "../api.js";
import { getCurrentUser } from "../auth.js";
import { el, mount, formatMoney } from "../utils.js";
import { goTo } from "../router.js";

export async function renderDashboard(root) {
  const user = getCurrentUser();

  const quickLinks = el("div", { class: "card" }, [
    el("h3", {}, "Quick actions"),
    el("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:10px" }, [
      quickLink("Add a member", "/members"),
      quickLink("Review loan applications", "/loans"),
      quickLink("Post a journal entry", "/accounting"),
      quickLink("View risk flags", "/risk"),
    ]),
  ]);

  mount(root, [
    el("div", { class: "card" }, [
      el("h3", {}, `Welcome, ${user.full_name.split(" ")[0]}`),
      el("p", { class: "muted" }, "Here's a snapshot of the SACCO's current position."),
    ]),
    el("div", { class: "grid grid-3", id: "kpi-grid" }, [el("div", { class: "spinner" })]),
    quickLinks,
  ]);

  const kpiGrid = document.getElementById("kpi-grid");

  const results = await Promise.allSettled([
    api.get("/api/v1/members?page_size=1"),
    api.get("/api/v1/loans/applications?loan_status=active"),
    api.get("/api/v1/risk/portfolio-at-risk"),
    api.get("/api/v1/risk/flags?flag_status=open"),
  ]);

  const [membersRes, activeLoansRes, parRes, flagsRes] = results;

  const kpis = [];

  if (membersRes.status === "fulfilled") {
    kpis.push(statCard("Total Members", `${membersRes.value.total}`, "Registered members", "good"));
  }
  if (activeLoansRes.status === "fulfilled") {
    const loans = activeLoansRes.value;
    const outstanding = loans.reduce((sum, l) => sum + Number(l.amount_approved || 0), 0);
    kpis.push(statCard("Active Loans", `${loans.length}`, `UGX ${formatMoney(outstanding)} outstanding`, "good"));
  }
  if (parRes.status === "fulfilled") {
    const par = Number(parRes.value.portfolio_at_risk_pct || 0);
    kpis.push(statCard("Portfolio at Risk", `${par.toFixed(2)}%`, "Overdue vs. total outstanding", par > 5 ? "danger" : "good"));
  }
  if (flagsRes.status === "fulfilled") {
    const flags = flagsRes.value;
    kpis.push(statCard("Open Risk Flags", `${flags.length}`, "Awaiting review", flags.length > 0 ? "warn" : "good"));
  }

  if (!kpis.length) {
    mount(kpiGrid, el("div", { class: "card empty-state" }, [
      el("h4", {}, "No dashboard data available"),
      el("p", {}, "Your role may not have permission to view SACCO-wide metrics."),
    ]));
  } else {
    mount(kpiGrid, kpis);
  }
}

function statCard(label, value, sub, variant) {
  return el("div", { class: `card stat-card ${variant || ""}` }, [
    el("div", { class: "label" }, label),
    el("div", { class: "value ledger" }, value),
    el("div", { class: "sub" }, sub),
  ]);
}

function quickLink(label, path) {
  return el("button", { class: "btn btn-secondary btn-sm", onclick: () => goTo(path) }, label);
}
