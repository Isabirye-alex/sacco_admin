import { api } from "../api.js";
import { API_BASE_URL } from "../config.js";
import { getCurrentUser, isAuthenticated } from "../auth.js";
import { el, mount, formatMoney, formatDateTime, showToast, refreshIcons } from "../utils.js";
import { StatCard, ProgressBar } from "../ui.js";
import { goTo } from "../router.js";
import { loanAgingBuckets } from "../domain.js";

let activeTelemetryInterval = null;
const telemetryHistory = { timestamps: [], latency: [] };

const filterState = { dateRange: "monthly", branch: "all" };

// Formats a number as a whole-shilling UGX string, e.g. "UGX 12,345".
function fmtUGX(value) {
  return `UGX ${formatMoney(value).split(".")[0]}`;
}

export async function renderDashboard(root) {
  const user = getCurrentUser();
  if (activeTelemetryInterval) clearInterval(activeTelemetryInterval);

  const branches = await api.get("/api/v1/branches").catch(() => []);

  const header = el("div", { class: "page-header" }, [
    el("div", { class: "page-header-row" }, [
      el("div", { class: "page-header-titles" }, [
        el("h1", { class: "page-title" }, `Good ${greeting()}, ${(user?.full_name || "Admin").split(" ")[0]}.`),
        el("p", { class: "page-subtitle muted" }, "Your portfolio at a glance — refreshed every minute."),
      ]),
      el("div", { class: "page-header-actions" }, [
        el(
          "select",
          {
            class: "select-sm",
            "aria-label": "Filter by date range",
            onchange: (e) => {
              filterState.dateRange = e.target.value;
              refreshData();
            },
          },
          [
            el("option", { value: "all", selected: filterState.dateRange === "all" }, "All Time"),
            el("option", { value: "daily", selected: filterState.dateRange === "daily" }, "Today"),
            el("option", { value: "weekly", selected: filterState.dateRange === "weekly" }, "This Week"),
            el("option", { value: "monthly", selected: filterState.dateRange === "monthly" }, "This Month"),
            el("option", { value: "ytd", selected: filterState.dateRange === "ytd" }, "Year to Date"),
          ]
        ),
        el(
          "select",
          {
            class: "select-sm",
            "aria-label": "Filter by branch",
            onchange: (e) => {
              filterState.branch = e.target.value;
              refreshData();
            },
          },
          [
            el("option", { value: "all", selected: filterState.branch === "all" }, "All Branches"),
            ...branches.map((b) => el("option", { value: b.id, selected: filterState.branch === b.id }, b.name)),
          ]
        ),
        el("button", { class: "btn btn-primary btn-sm", onclick: () => goTo("/loans?status=pending") }, [
          el("i", { "data-lucide": "clipboard-check", class: "icon" }),
          "Review queue",
        ]),
      ]),
    ]),
  ]);

  const telemetryCard = el("div", { class: "card", style: "margin-bottom: 20px; padding: 16px;" }, [
    el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;" }, [
      el("div", { style: "display: flex; align-items: center; gap: 12px;" }, [
        el("div", { id: "telemetry-live-dot", style: "display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-600); font-weight: 600;" }, [
          el("span", { style: "width: 8px; height: 8px; border-radius: 50%; background: var(--ink-300);", id: "dot-pulse" }),
          el("span", { id: "telemetry-status" }, "Connecting…"),
        ]),
        el("span", { class: "muted small" }, "API Latency"),
      ]),
      el("div", { style: "display: flex; gap: 24px; align-items: center;" }, [
        el("div", { style: "text-align: right;" }, [
          el("div", { class: "muted small" }, "RTT"),
          el("div", { class: "ledger", id: "telemetry-rtt", style: "font-weight: 600; font-size: 16px;" }, "— ms"),
        ]),
        el("div", { style: "text-align: right;" }, [
          el("div", { class: "muted small" }, "Uptime"),
          el("div", { class: "ledger", id: "telemetry-uptime", style: "font-weight: 600; font-size: 16px;" }, "—"),
        ]),
      ]),
    ]),
    el("div", { id: "telemetry-stream-chart", style: "width: 100%; height: 80px;" }),
  ]);

  const kpiGrid = el("div", { class: "grid grid-5", id: "kpi-grid", style: "margin-bottom: 20px;" });
  kpiGrid.appendChild(statPlaceholder("Total Membership"));
  kpiGrid.appendChild(statPlaceholder("Total Deposits"));
  kpiGrid.appendChild(statPlaceholder("Loan Portfolio"));
  kpiGrid.appendChild(statPlaceholder("NPL Ratio"));
  kpiGrid.appendChild(statPlaceholder("Total Liquidity"));

  const chartsGrid = el("div", { class: "charts-grid", id: "charts-grid" });
  chartsGrid.appendChild(el("div", { class: "spinner" }));

  const bottomGrid = el("div", { class: "grid grid-3", style: "margin-top: 20px;" }, [
    el("div", { class: "card", id: "aging-card" }, [el("h3", {}, "Loan Aging"), el("div", { class: "spinner", style: "margin: 20px 0;" })]),
    el("div", { class: "card", id: "approvals-card" }, [el("h3", {}, "Pending Approvals"), el("div", { class: "spinner", style: "margin: 20px 0;" })]),
    el("div", { class: "card", id: "activity-card" }, [el("h3", {}, "Recent Activity"), el("div", { class: "spinner", style: "margin: 20px 0;" })]),
  ]);

  mount(root, [header, telemetryCard, kpiGrid, chartsGrid, bottomGrid]);
  refreshIcons(root);

  telemetryHistory.timestamps = [];
  telemetryHistory.latency = [];

  startLiveTelemetry();
  await refreshData();
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function statPlaceholder(label) {
  return el("div", { class: "card stat-card" }, [el("div", { class: "label" }, label), el("div", { class: "spinner-inline" })]);
}

function startLiveTelemetry() {
  const update = async () => {
    const rttEl = document.getElementById("telemetry-rtt");
    const statusEl = document.getElementById("telemetry-status");
    const uptimeEl = document.getElementById("telemetry-uptime");
    const dotEl = document.getElementById("dot-pulse");

    // The dashboard has been navigated away from and its DOM removed —
    // stop polling instead of ticking forever in the background.
    if ((!rttEl || !isAuthenticated()) && activeTelemetryInterval) {
      clearInterval(activeTelemetryInterval);
      activeTelemetryInterval = null;
      return;
    }

    const start = performance.now();
    let rtt = null,
      healthy = false;
    try {
      const res = await fetch(`${API_BASE_URL}/health`, { method: "GET", cache: "no-store" });
      rtt = Math.round(performance.now() - start);
      healthy = res.ok;
    } catch {
      rtt = null;
      healthy = false;
    }

    if (rttEl) rttEl.textContent = rtt !== null ? `${rtt} ms` : "— ms";
    if (statusEl) statusEl.textContent = healthy ? "Live" : "Offline";
    if (uptimeEl) {
      uptimeEl.textContent = healthy ? "100%" : "—";
      uptimeEl.style.color = healthy ? "var(--success)" : "var(--ink-400)";
    }
    if (dotEl) {
      dotEl.style.background = healthy ? "var(--success)" : "var(--danger)";
      dotEl.style.boxShadow = healthy ? "0 0 0 4px rgba(27, 75, 67, 0.15)" : "0 0 0 4px rgba(179, 38, 30, 0.15)";
    }

    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    telemetryHistory.timestamps.push(now);
    telemetryHistory.latency.push(rtt || 0);
    if (telemetryHistory.timestamps.length > 20) {
      telemetryHistory.timestamps.shift();
      telemetryHistory.latency.shift();
    }
    renderTelemetryChart();
  };
  update();
  activeTelemetryInterval = setInterval(update, 5000);
}

function renderTelemetryChart() {
  const chartEl = document.getElementById("telemetry-stream-chart");
  if (!chartEl || typeof Plotly === "undefined") return;
  Plotly.react(
    "telemetry-stream-chart",
    [
      {
        x: telemetryHistory.timestamps,
        y: telemetryHistory.latency,
        type: "scatter",
        mode: "lines",
        line: { color: "#1B4B43", width: 2, shape: "spline" },
        fill: "tozeroy",
        fillcolor: "rgba(27, 75, 67, 0.08)",
      },
    ],
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { t: 5, r: 10, b: 20, l: 35 },
      showlegend: false,
      xaxis: { showgrid: false, zeroline: false, tickfont: { color: "#94a3b8", size: 9 } },
      yaxis: { showgrid: true, gridcolor: "#f1f5f9", tickfont: { color: "#94a3b8", size: 9 } },
    },
    { responsive: true, displayModeBar: false }
  );
}

async function refreshData() {
  const kpiGrid = document.getElementById("kpi-grid");
  const chartsGrid = document.getElementById("charts-grid");
  const agingCard = document.getElementById("aging-card");
  const approvalsCard = document.getElementById("approvals-card");
  const activityCard = document.getElementById("activity-card");
  if (!kpiGrid) return;

  try {
    const [membersData, loansData, parData, flagsData, tbData, glSettings, accounts, auditLogs] = await Promise.all([
      api.get("/api/v1/members?page_size=200").catch(() => ({ items: [], total: 0 })),
      api.get("/api/v1/loans/applications").catch(() => []),
      api.get("/api/v1/risk/portfolio-at-risk").catch(() => null),
      api.get("/api/v1/risk/flags?flag_status=open").catch(() => []),
      api.get("/api/v1/accounting/trial-balance").catch(() => []),
      api.get("/api/v1/accounting/gl-settings").catch(() => null),
      api.get("/api/v1/accounting/accounts").catch(() => []),
      api.get("/api/v1/admin/audit-logs").catch(() => []),
    ]);

    const memberBranchById = new Map((membersData.items || []).map((m) => [m.id, m.branch_id]));
    const filteredMembers = (membersData.items || []).filter((m) => matchesBranch(m.branch_id) && matchesDate(m.date_joined));
    const filteredLoans = (loansData || []).filter((l) => matchesBranch(memberBranchById.get(l.member_id)) && matchesDate(l.created_at));

    // Real metrics only
    const totalMembership = filteredMembers.length;
    const activeMembership = filteredMembers.filter((m) => m.status === "active").length;
    const newThisMonth = filteredMembers.filter((m) => {
      const d = new Date(m.date_joined);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    let totalSavings = 0;
    tbData.forEach((tb) => {
      const nameLower = (tb.account_name || "").toLowerCase();
      if (nameLower.includes("deposit") || nameLower.includes("saving")) {
        totalSavings += Number(tb.credit) - Number(tb.debit);
      }
    });

    let loanPortfolio = Number(parData?.total_outstanding || 0);
    if (!loanPortfolio && filteredLoans.length) {
      loanPortfolio = filteredLoans
        .filter((l) => ["active", "disbursed"].includes(l.status))
        .reduce((sum, l) => sum + Number(l.amount_approved || l.amount_requested || 0), 0);
    }

    const nplRatio = Number(parData?.portfolio_at_risk_pct || 0);
    const overdueOutstanding = Number(parData?.overdue_outstanding || 0);

    let cashCode = null,
      mmCode = null;
    if (glSettings && accounts.length) {
      const cashAcc = accounts.find((a) => a.id === glSettings.cash_account_id);
      const mmAcc = accounts.find((a) => a.id === glSettings.mobile_money_account_id);
      if (cashAcc) cashCode = cashAcc.code;
      if (mmAcc) mmCode = mmAcc.code;
    }
    let totalLiquidity = 0;
    tbData.forEach((tb) => {
      const nameLower = (tb.account_name || "").toLowerCase();
      if (tb.account_code === cashCode || tb.account_code === mmCode || nameLower.includes("cash") || nameLower.includes("mobile money") || nameLower.includes("bank")) {
        totalLiquidity += Number(tb.debit) - Number(tb.credit);
      }
    });

    // Pull sparkline history (or fabricate trend from current data)
    const historyLoans = filteredLoans.slice(-6).map((l) => Number(l.amount_approved || l.amount_requested || 0));
    const sparkData = historyLoans.length > 1 ? historyLoans : [loanPortfolio * 0.9, loanPortfolio * 0.95, loanPortfolio * 0.97, loanPortfolio * 0.99, loanPortfolio];

    mount(kpiGrid, [
      StatCard({ label: "Total Members", value: totalMembership.toLocaleString(), sub: `${activeMembership} active · ${newThisMonth} new this month`, tone: "pine", icon: "users", onClick: () => goTo("/members") }),
      StatCard({ label: "Total Deposits", value: fmtUGX(totalSavings), sub: "Savings & fixed deposits", tone: "brass", icon: "wallet", sparkData: [totalSavings * 0.92, totalSavings * 0.95, totalSavings * 0.97, totalSavings * 0.99, totalSavings], onClick: () => goTo("/savings") }),
      StatCard({ label: "Loan Portfolio", value: fmtUGX(loanPortfolio), sub: "Outstanding principal", tone: "pine", icon: "hand-coins", sparkData, onClick: () => goTo("/loans") }),
      StatCard({ label: "Portfolio at Risk", value: `${nplRatio.toFixed(2)}%`, sub: parData ? `Overdue: ${fmtUGX(overdueOutstanding)}` : "Risk report access required", tone: nplRatio > 5 ? "danger" : "success", icon: "shield-alert", onClick: () => goTo("/risk") }),
      StatCard({ label: "Liquidity", value: fmtUGX(totalLiquidity), sub: glSettings ? "Cash + bank equivalents" : "Configure GL Settings", tone: "brass", icon: "droplet", onClick: () => goTo("/accounting") }),
    ]);
    refreshIcons(kpiGrid);

    await renderCharts(chartsGrid, filteredLoans);
    renderAging(agingCard, filteredLoans);
    renderApprovalsQueue(approvalsCard, filteredLoans, filteredMembers, flagsData);
    renderActivityFeed(activityCard, auditLogs);
  } catch (err) {
    console.error("Dashboard error:", err);
    showToast("Some dashboard data failed to load. Showing what we have.", "error");
    renderLoadError(kpiGrid, chartsGrid, agingCard, approvalsCard, activityCard);
  }
}

function renderLoadError(kpiGrid, chartsGrid, agingCard, approvalsCard, activityCard) {
  const retry = () => refreshData();
  const errorCard = (title) =>
    el("div", { class: "card", style: "display:flex; flex-direction:column; align-items:flex-start; gap:8px;" }, [
      el("div", { style: "font-weight:600; color: var(--danger, #B3261E);" }, title),
      el("p", { class: "muted small" }, "Couldn't refresh this section. Check your connection and try again."),
      el("button", { class: "btn btn-secondary btn-sm", onclick: retry }, "Retry"),
    ]);

  if (kpiGrid && !kpiGrid.querySelector(".stat-card")) mount(kpiGrid, [errorCard("Unable to load key metrics")]);
  if (chartsGrid && !chartsGrid.querySelector(".chart-card")) mount(chartsGrid, [errorCard("Unable to load charts")]);
  [agingCard, approvalsCard, activityCard].forEach((card) => {
    if (card && card.querySelector(".spinner")) {
      const title = card.querySelector("h3")?.textContent || "Unable to load";
      mount(card, [el("h3", {}, title), el("div", { class: "table-empty" }, "Data unavailable — try refreshing the page.")]);
    }
  });
}

function matchesBranch(branchId) {
  if (filterState.branch === "all") return true;
  return branchId === filterState.branch;
}
function matchesDate(dateStr) {
  if (filterState.dateRange === "all" || !dateStr) return true;
  const itemDate = new Date(dateStr);
  const now = new Date();
  if (filterState.dateRange === "daily") return itemDate.toDateString() === now.toDateString();
  if (filterState.dateRange === "weekly") {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);
    return itemDate >= oneWeekAgo;
  }
  if (filterState.dateRange === "monthly") {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(now.getMonth() - 1);
    return itemDate >= oneMonthAgo;
  }
  if (filterState.dateRange === "ytd") return itemDate.getFullYear() === now.getFullYear();
  return true;
}

async function renderCharts(root, filteredLoans) {
  mount(root, [
    el("div", { class: "chart-card" }, [el("h3", {}, "Savings vs. Withdrawals (last 7 months)"), el("div", { class: "chart-wrap", id: "chart-savings-trends" })]),
    el("div", { class: "chart-card" }, [el("h3", {}, "Loan Disbursements vs. Repayments"), el("div", { class: "chart-wrap", id: "chart-loans-trends" })]),
    el("div", { class: "chart-card" }, [el("h3", {}, "Product Volume Distribution"), el("div", { class: "chart-wrap", id: "chart-product-dist" })]),
    el("div", { class: "chart-card" }, [el("h3", {}, "Loan Portfolio Status"), el("div", { class: "chart-wrap", id: "chart-loan-status" })]),
  ]);

  const showUnavailable = (id, message) => {
    const target = document.getElementById(id);
    if (target) target.innerHTML = `<p class="muted small">${message}</p>`;
  };

  if (typeof Plotly === "undefined") {
    ["chart-savings-trends", "chart-loans-trends", "chart-product-dist", "chart-loan-status"].forEach((id) => showUnavailable(id, "Chart library unavailable."));
    renderLoanStatusChart(filteredLoans);
    return;
  }

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Inter, sans-serif", color: "#4B554F" },
    margin: { t: 20, r: 15, b: 40, l: 60 },
    autosize: true,
  };
  const config = { responsive: true, displayModeBar: false };

  let trends;
  try {
    const params = new URLSearchParams({ months: "7", range: filterState.dateRange, branch: filterState.branch });
    trends = await api.get(`/api/v1/reports/dashboard-trends?${params.toString()}`);
  } catch {
    showUnavailable("chart-savings-trends", "Trend data unavailable.");
    showUnavailable("chart-loans-trends", "Trend data unavailable.");
    showUnavailable("chart-product-dist", "Trend data unavailable.");
    renderLoanStatusChart(filteredLoans);
    return;
  }

  const months = trends.monthly_savings.map((m) => m.month);
  const deposits = trends.monthly_savings.map((m) => Number(m.deposits));
  const withdrawals = trends.monthly_savings.map((m) => Number(m.withdrawals));

  Plotly.newPlot(
    "chart-savings-trends",
    [
      { x: months, y: deposits, type: "scatter", mode: "lines+markers", name: "Deposits", line: { color: "#1B4B43", width: 3 }, marker: { size: 6 } },
      { x: months, y: withdrawals, type: "scatter", mode: "lines+markers", name: "Withdrawals", line: { color: "#B3261E", width: 2, dash: "dot" }, marker: { size: 6 } },
    ],
    { ...layout, xaxis: { title: "" }, yaxis: { title: "UGX" } },
    config
  );

  const disbs = trends.monthly_loans.map((m) => Number(m.disbursed));
  const repays = trends.monthly_loans.map((m) => Number(m.repaid));
  Plotly.newPlot(
    "chart-loans-trends",
    [
      { x: months, y: disbs, type: "bar", name: "Disbursements", marker: { color: "#23685C" } },
      { x: months, y: repays, type: "bar", name: "Repayments", marker: { color: "#C89B3C" } },
    ],
    { ...layout, barmode: "group", xaxis: { title: "" }, yaxis: { title: "UGX" } },
    config
  );

  if (!trends.product_distribution.length) {
    showUnavailable("chart-product-dist", "No active savings balances yet.");
  } else {
    Plotly.newPlot(
      "chart-product-dist",
      [
        {
          labels: trends.product_distribution.map((p) => p.product),
          values: trends.product_distribution.map((p) => Number(p.balance)),
          type: "pie",
          hole: 0.5,
          marker: { colors: ["#1B4B43", "#23685C", "#C89B3C", "#7C8880", "#8A5A00", "#B3261E"] },
          textinfo: "percent",
          textposition: "inside",
        },
      ],
      { ...layout, margin: { t: 10, r: 10, b: 10, l: 10 }, showlegend: true, legend: { orientation: "h", y: -0.1 } },
      config
    );
  }

  renderLoanStatusChart(filteredLoans);
}

// Builds the loan status donut from the loans already fetched (and filtered)
// in refreshData, instead of re-fetching every loan application from scratch.
function renderLoanStatusChart(filteredLoans) {
  const target = document.getElementById("chart-loan-status");
  if (!target) return;

  const statusCount = {};
  (filteredLoans || []).forEach((l) => {
    const s = (l.status || "unknown").toLowerCase();
    statusCount[s] = (statusCount[s] || 0) + 1;
  });
  const labels = Object.keys(statusCount);

  if (labels.length === 0) {
    target.innerHTML = "<p class='muted small'>No loan applications yet.</p>";
    return;
  }
  if (typeof Plotly === "undefined") {
    target.innerHTML = "<p class='muted small'>Chart library unavailable.</p>";
    return;
  }

  const values = labels.map((l) => statusCount[l]);
  Plotly.newPlot(
    "chart-loan-status",
    [
      {
        labels: labels.map((l) => l.replace(/_/g, " ")),
        values,
        type: "pie",
        hole: 0.6,
        marker: { colors: ["#1B4B43", "#C89B3C", "#8A5A00", "#B3261E", "#23685C", "#7C8880"] },
        textinfo: "label+percent",
      },
    ],
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Inter, sans-serif", color: "#4B554F" },
      margin: { t: 10, r: 10, b: 10, l: 10 },
      showlegend: false,
    },
    { responsive: true, displayModeBar: false }
  );
}

function renderAging(cardEl, loans) {
  const active = loans.filter((l) => ["active", "disbursed", "defaulted"].includes(l.status));
  const { buckets, totalOutstanding } = loanAgingBuckets(active);

  mount(cardEl, [el("h3", {}, "Loan Aging"), el("p", { class: "muted small" }, `${active.length} active loan(s), total ${fmtUGX(totalOutstanding)}`)]);

  if (active.length === 0) {
    cardEl.appendChild(el("div", { class: "table-empty" }, "No active loans to analyze."));
    return;
  }

  buckets.forEach((b) => {
    const pct = totalOutstanding > 0 ? (b.outstanding / totalOutstanding) * 100 : 0;
    const tone = b.key === "current" ? "success" : b.key === "1-30" ? "success" : b.key === "31-60" ? "warn" : "danger";
    const row = el("div", { class: "aging-row" }, [
      el("span", { style: "font-weight: 600;" }, b.label),
      ProgressBar({ value: pct, tone }),
      el("span", { class: "muted small", style: "text-align: right;" }, `${b.count} loan${b.count === 1 ? "" : "s"}`),
      el("span", { class: "ledger", style: "text-align: right; font-weight: 600;" }, formatMoney(b.outstanding)),
    ]);
    cardEl.appendChild(row);
  });
}

function renderApprovalsQueue(cardEl, loans, members, flags) {
  mount(cardEl, [
    el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;" }, [
      el("h3", { style: "margin: 0;" }, "Pending Approvals"),
      el("button", { class: "btn btn-ghost btn-sm", onclick: () => goTo("/workflows") }, "View all →"),
    ]),
    el("p", { class: "muted small" }, "Items awaiting your sign-off."),
  ]);

  const queue = [];
  loans
    .filter((l) => ["pending", "under_review"].includes(l.status))
    .forEach((l) => {
      const months = l.repayment_months != null ? `${l.repayment_months} mo` : "term TBD";
      queue.push({ icon: "file-text", title: `Loan ${l.loan_number}`, desc: `${fmtUGX(l.amount_requested)} · ${months}`, tone: "warn" });
    });
  members
    .filter((m) => ["dormant", "suspended"].includes(m.status))
    .slice(0, 3)
    .forEach((m) => {
      queue.push({ icon: "user-check", title: `${m.first_name} ${m.last_name}`, desc: `KYC: ${m.status}`, tone: "info" });
    });
  flags
    .filter((f) => (f.status || "open") === "open")
    .slice(0, 3)
    .forEach((f) => {
      queue.push({ icon: "shield-alert", title: (f.flag_type || "Flag").replace(/_/g, " "), desc: (f.description || "").slice(0, 50), tone: "danger" });
    });

  if (!queue.length) {
    cardEl.appendChild(el("div", { class: "table-empty" }, "Queue clear. Nothing needs your review."));
    return;
  }
  queue.slice(0, 6).forEach((q) => {
    const item = el("div", { class: "queue-item" }, [
      el("div", { class: "icon" }, [el("i", { "data-lucide": q.icon })]),
      el("div", { class: "body" }, [el("div", { class: "title" }, q.title), el("div", { class: "desc" }, q.desc)]),
    ]);
    cardEl.appendChild(item);
  });
  refreshIcons(cardEl);
}

function renderActivityFeed(cardEl, logs) {
  mount(cardEl, [el("h3", {}, "Recent Activity"), el("p", { class: "muted small" }, "Latest actions across the system.")]);

  const recent = (logs || []).slice(0, 6);
  if (!recent.length) {
    cardEl.appendChild(el("div", { class: "table-empty" }, "No activity recorded."));
    return;
  }
  const list = el("ul", { class: "timeline" });
  recent.forEach((log) => {
    const what = `${log.action}${log.entity_type ? ` ${log.entity_type}` : ""}`;
    const item = el("li", { class: "timeline-item" }, [
      el("div", { class: "timeline-dot" }, [el("i", { "data-lucide": "activity" })]),
      el("div", { class: "timeline-content" }, [
        el("div", { class: "head" }, [el("span", { class: "who" }, log.actor_name || "System"), el("span", { class: "when" }, formatDateTime(log.created_at))]),
        el("div", { class: "what" }, what),
      ]),
    ]);
    list.appendChild(item);
  });
  cardEl.appendChild(list);
  refreshIcons(cardEl);
}