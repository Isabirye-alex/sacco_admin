import { api } from "../api.js";
import { API_BASE_URL } from "../config.js";
import { getCurrentUser } from "../auth.js";
import { 
  el, 
  mount, 
  formatMoney, 
  formatDate, 
  formatDateTime, 
  badge, 
  openModal, 
  showToast, 
  refreshIcons 
} from "../utils.js";
import { 
  StatCard, 
  Sparkline, 
  KeyValueGrid, 
  ProgressBar, 
  EmptyState, 
  ErrorState, 
  ColorChip, 
  MetricDelta, 
  Card 
} from "../ui.js";
import { goTo } from "../router.js";
import { loanAgingBuckets } from "../domain.js";

let activeTelemetryInterval = null;
const telemetryHistory = { timestamps: [], latency: [] };
const filterState = { dateRange: "monthly", branch: "all" };

// Helper to calculate greeting based on current time
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

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
        el("select", {
          class: "select-sm",
          onchange: (e) => { filterState.dateRange = e.target.value; refreshData(); }
        }, [
          el("option", { value: "all" }, "All Time"),
          el("option", { value: "daily", selected: filterState.dateRange === "daily" }, "Today"),
          el("option", { value: "weekly", selected: filterState.dateRange === "weekly" }, "This Week"),
          el("option", { value: "monthly", selected: filterState.dateRange === "monthly" }, "This Month"),
          el("option", { value: "ytd", selected: filterState.dateRange === "ytd" }, "Year to Date"),
        ]),
        el("select", {
          class: "select-sm",
          onchange: (e) => { filterState.branch = e.target.value; refreshData(); }
        }, [
          el("option", { value: "all" }, "All Branches"),
          ...branches.map((b) => el("option", { value: b.id }, b.name)),
        ]),
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
  kpiGrid.appendChild(statCardPlaceholder("Total Membership"));
  kpiGrid.appendChild(statCardPlaceholder("Total Deposits"));
  kpiGrid.appendChild(statCardPlaceholder("Loan Portfolio"));
  kpiGrid.appendChild(statCardPlaceholder("NPL Ratio"));
  kpiGrid.appendChild(statCardPlaceholder("Total Liquidity"));

  const chartsGrid = el("div", { class: "charts-grid", id: "charts-grid" });
  chartsGrid.appendChild(el("div", { class: "spinner" }));

  const bottomGrid = el("div", { class: "grid grid-2", style: "margin-top: 20px;" }, [
    el("div", { class: "card", id: "approvals-card" }, [
      el("h3", {}, "Pending Approvals"),
      el("div", { class: "spinner", style: "margin: 20px 0" })
    ]),
    el("div", { class: "card", id: "activity-card" }, [
      el("h3", {}, "System Activity Feed"),
      el("div", { class: "spinner", style: "margin: 20px 0" })
    ])
  ]);

  mount(root, [header, telemetryCard, kpiGrid, chartsGrid, bottomGrid]);
  refreshIcons(root);

  telemetryHistory.timestamps = [];
  telemetryHistory.latency = [];

  startLiveTelemetry();
  await refreshData();

  window.addEventListener('hashchange', function cleanupDashboard() {
    if (activeTelemetryInterval) {
      clearInterval(activeTelemetryInterval);
      activeTelemetryInterval = null;
    }
    window.removeEventListener('hashchange', cleanupDashboard);
  });
}

function setupTelemetryElements() {
  const container = document.getElementById('dashboard-telemetry-container');
  if (!container) return;

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px; font-family: system-ui, sans-serif; align-items: stretch;">
      <div class="card" style="padding: 12px; background: #fff; border: 1px solid var(--line); border-radius: 6px; display: flex; flex-direction: column;">
        <div style="font-size: 12px; font-weight: 600; color: var(--pine-900); margin-bottom: 6px; display: flex; justify-content: space-between;">
          <span>API Latency (live)</span>
          <span id="telemetry-live-dot" style="color: green; font-size: 11px; font-weight: normal;">\u25cf Checking\u2026</span>
        </div>
        <div id="telemetry-stream-chart" style="width: 100%; height: 140px;"></div>
      </div>

      <div style="display: grid; grid-template-rows: repeat(2, 1fr); gap: 10px;">
        <div class="metric-card" style="padding: 10px; background: #fff; border: 1px solid var(--line); border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 11px; color: var(--muted);">API Response Time</div>
            <div id="telemetry-rtt" style="font-size: 18px; font-weight: bold; color: var(--pine-900);">-- ms</div>
          </div>
          <div style="font-size: 11px; color: var(--muted); text-align: right;">Round-trip to backend</div>
        </div>

        <div class="metric-card" style="padding: 10px; background: #fff; border: 1px solid var(--line); border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 11px; color: var(--muted);">Backend Status</div>
            <div id="telemetry-uptime" style="font-size: 18px; font-weight: bold; color: var(--muted);">Checking\u2026</div>
          </div>
          <div id="telemetry-sub-memory" style="font-size: 11px; color: var(--muted); text-align: right;"></div>
        </div>
      </div>
    </div>
  `;
}

function startLiveTelemetry() {
  const updateMetrics = async () => {
    let currentRtt = null;

    const rttElement = document.getElementById('telemetry-rtt');
    const uptimeElement = document.getElementById('telemetry-uptime');
    const liveDot = document.getElementById('telemetry-live-dot');

    const start = performance.now();
    let healthy = false;
    try {
      const res = await fetch(`${API_BASE_URL}/health`, { method: "GET", cache: "no-store" });
      currentRtt = Math.round(performance.now() - start);
      healthy = res.ok;
    } catch {
      currentRtt = null;
      healthy = false;
    }

    if (rttElement) rttElement.textContent = currentRtt !== null ? `${currentRtt} ms` : "— ms";
    if (uptimeElement) {
      uptimeElement.textContent = healthy ? "100%" : "—";
      uptimeElement.style.color = healthy ? "var(--success)" : "var(--ink-400)";
    }
    if (liveDot) {
      liveDot.style.color = healthy ? "var(--success)" : "var(--danger)";
    }

    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    telemetryHistory.timestamps.push(now);
    telemetryHistory.latency.push(currentRtt || 0);
    if (telemetryHistory.timestamps.length > 20) {
      telemetryHistory.timestamps.shift();
      telemetryHistory.latency.shift();
    }
    renderStreamingTelemetryChart();
  };

  updateMetrics();
  activeTelemetryInterval = setInterval(updateMetrics, 5000);
}

function renderStreamingTelemetryChart() {
  const chartNode = document.getElementById('telemetry-stream-chart');
  if (!chartNode || typeof Plotly === 'undefined') return;

  const traceLatency = {
    x: telemetryHistory.timestamps,
    y: telemetryHistory.latency,
    name: 'RTT (ms)',
    type: 'scatter',
    mode: 'lines',
    line: { color: '#1B4B43', width: 2, shape: 'spline' },
  };

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "system-ui, sans-serif", size: 9, color: "#7C8880" },
    margin: { t: 10, r: 20, b: 20, l: 40 },
    showlegend: false,
    xaxis: { showgrid: false, zeroline: false },
    yaxis: { title: 'Latency (ms)', titlefont: { color: '#1B4B43' }, tickfont: { color: '#1B4B43' }, showgrid: true, gridcolor: '#f1f5f9' },
  };

  Plotly.react("telemetry-stream-chart", [traceLatency], layout, { responsive: true, displayModeBar: false });
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
      api.get("/api/v1/members?page_size=1000").catch(() => ({ items: [], total: 0 })),
      api.get("/api/v1/loans/applications").catch(() => []),
      api.get("/api/v1/risk/portfolio-at-risk").catch(() => null),
      api.get("/api/v1/risk/flags?flag_status=open").catch(() => []),
      api.get("/api/v1/accounting/trial-balance").catch(() => []),
      api.get("/api/v1/accounting/gl-settings").catch(() => null),
      api.get("/api/v1/accounting/accounts").catch(() => []),
      api.get("/api/v1/admin/audit-logs").catch(() => []),
    ]);

    const memberBranchById = new Map((membersData.items || []).map((m) => [m.id, m.branch_id]));

    const filteredMembers = (membersData.items || []).filter(
      (m) => matchesBranch(m.branch_id) && matchesDate(m.date_joined)
    );
    const filteredLoans = (loansData || []).filter(
      (l) => matchesBranch(memberBranchById.get(l.member_id)) && matchesDate(l.created_at)
    );

    const totalMembership = filteredMembers.length;
    const activeMembership = filteredMembers.filter((m) => m.status === "active").length;

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

    let cashCode = null;
    let mmCode = null;
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

    mount(kpiGrid, [
      statCard("Total Membership", `${totalMembership}`, `${activeMembership} active members`, "good", "/members"),
      statCard("Total Deposits", `UGX ${formatMoney(totalSavings)}`, "Savings & Fixed deposits", "good", "/savings"),
      statCard("Loan Portfolio", `UGX ${formatMoney(loanPortfolio)}`, "Outstanding loan principal", "good", "/loans"),
      statCard("NPL Ratio", `${nplRatio.toFixed(2)}%`, parData ? `Overdue: UGX ${formatMoney(overdueOutstanding)}` : "Requires risk-report access", nplRatio > 5 ? "danger" : "good", "/risk"),
      statCard("Total Liquidity", `UGX ${formatMoney(totalLiquidity)}`, glSettings ? "Cash & bank equivalents" : "Set up GL Settings for this figure", "good", "/accounting"),
    ]);
    refreshIcons(kpiGrid);

    await renderVisualCharts(chartsGrid);
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
    const oneWeekAgo = new Date(); oneWeekAgo.setDate(now.getDate() - 7);
    return itemDate >= oneWeekAgo;
  }
  if (filterState.dateRange === "monthly") {
    const oneMonthAgo = new Date(); oneMonthAgo.setMonth(now.getMonth() - 1);
    return itemDate >= oneMonthAgo;
  }
  if (filterState.dateRange === "ytd") return itemDate.getFullYear() === now.getFullYear();
  return true;
}

async function renderVisualCharts(root) {
  mount(root, [
    el("div", { class: "chart-card" }, [
      el("h3", {}, "Savings vs. Withdrawals Trends"),
      el("div", { class: "chart-wrap", id: "chart-savings-trends" }),
    ]),
    el("div", { class: "chart-card" }, [
      el("h3", {}, "Loan Disbursements vs. Repayments"),
      el("div", { class: "chart-wrap", id: "chart-loans-trends" }),
    ]),
    el("div", { class: "chart-card" }, [
      el("h3", {}, "Product Volume Distribution"),
      el("div", { class: "chart-wrap", id: "chart-product-dist" }),
    ])
  ]);

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Inter, sans-serif", color: "#4B554F" },
    margin: { t: 20, r: 15, b: 40, l: 60 }, autosize: true,
  };
  const config = { responsive: true, displayModeBar: false };
  let trends;
  try {
    const params = new URLSearchParams({ months: "7", range: filterState.dateRange, branch: filterState.branch });
    trends = await api.get(`/api/v1/reports/dashboard-trends?${params.toString()}`);
  } catch {
    document.getElementById("chart-savings-trends").innerHTML = "<p class='muted small'>Trend data unavailable.</p>";
    document.getElementById("chart-loans-trends").innerHTML = "<p class='muted small'>Trend data unavailable.</p>";
    document.getElementById("chart-product-dist").innerHTML = "<p class='muted small'>Trend data unavailable.</p>";
    return;
  }
  const months = trends.monthly_savings.map((m) => m.month);
  const deposits = trends.monthly_savings.map((m) => Number(m.deposits));
  const withdrawals = trends.monthly_savings.map((m) => Number(m.withdrawals));

  Plotly.newPlot("chart-savings-trends", [
    { x: months, y: deposits, type: "scatter", mode: "lines+markers", name: "Deposits", line: { color: "#1B4B43", width: 3 }, marker: { size: 6 } },
    { x: months, y: withdrawals, type: "scatter", mode: "lines+markers", name: "Withdrawals", line: { color: "#B3261E", width: 2, dash: "dot" }, marker: { size: 6 } }
  ], { ...layout, xaxis: { title: "Month" }, yaxis: { title: "UGX Amount" } }, config);

  const disbs = trends.monthly_loans.map((m) => Number(m.disbursed));
  const repays = trends.monthly_loans.map((m) => Number(m.repaid));

  Plotly.newPlot("chart-loans-trends", [
    { x: months, y: disbs, type: "bar", name: "Disbursements", marker: { color: "#23685C" } },
    { x: months, y: repays, type: "bar", name: "Repayments", marker: { color: "#C89B3C" } }
  ], { ...layout, barmode: "group", xaxis: { title: "Month" }, yaxis: { title: "UGX Amount" } }, config);

  if (!trends.product_distribution.length) {
    document.getElementById("chart-product-dist").innerHTML = "<p class='muted small'>No active savings balances yet.</p>";
  } else {
    Plotly.newPlot("chart-product-dist", [
      {
        labels: trends.product_distribution.map((p) => p.product),
        values: trends.product_distribution.map((p) => Number(p.balance)),
        type: "pie",
        hole: 0.5,
        marker: { colors: ["#1B4B43", "#23685C", "#C89B3C", "#7C8880", "#8A5A00", "#B3261E"] },
        textinfo: "percent",
        textposition: "inside"
      }
    ], { ...layout, margin: { t: 10, r: 10, b: 10, l: 10 }, showlegend: true, legend: { orientation: "h", y: -0.1 } }, config);
  }
}

function renderApprovalsQueue(cardEl, loans, members, flags) {
  mount(cardEl, [
    el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;" }, [
      el("h3", { style: "margin: 0;" }, "Pending Approvals"),
      el("button", { class: "btn btn-ghost btn-sm", onclick: () => goTo("/workflows") }, "View all →"),
    ]),
    el("p", { class: "muted small" }, "Items awaiting your sign-off."),
  ]);

  const queueItems = [];
  loans.filter(l => ["pending", "under_review"].includes(l.status)).forEach(l => {
    queueItems.push({ type: "Credit Request", details: `${l.loan_number} — UGX ${formatMoney(l.amount_requested)}`, date: l.created_at, badgeVal: l.status, action: () => goTo("/loans") });
  });

  members.filter(m => m.status === "dormant" || m.status === "suspended").forEach(m => {
    queueItems.push({ type: "Member Verification", details: `${m.first_name} ${m.last_name} (${m.member_number})`, date: m.date_joined, badgeVal: "KYC Pending", action: () => goTo("/members") });
  });

  flags.filter(f => f.status === "open").forEach(f => {
    queueItems.push({ type: "Risk Flag Alert", details: `${f.flag_type.replace(/_/g, " ")}: ${f.description.slice(0, 30)}...`, date: f.created_at || new Date().toISOString(), badgeVal: "High Risk", action: () => goTo("/risk") });
  });

  queueItems.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!queueItems.length) {
    cardEl.appendChild(el("div", { class: "table-empty" }, "Queue clear. Nothing needs your review."));
    return;
  }

  const table = el("table", { style: "width:100%; font-size: 13px;" }, [
    el("thead", {}, el("tr", {}, [el("th", {}, "Type"), el("th", {}, "Description"), el("th", {}, "Date"), el("th", {}, "Status"), el("th", {}, "")])),
    el("tbody", {}, queueItems.slice(0, 5).map(item => el("tr", {}, [
      el("td", { style: "font-weight: 600" }, item.type),
      el("td", {}, item.details),
      el("td", {}, formatDate(item.date)),
      el("td", {}, badge(item.badgeVal)),
      el("td", {}, el("button", { class: "btn btn-secondary btn-sm", onclick: item.action }, "Review"))
    ])))
  ]);

  cardEl.appendChild(el("div", { class: "table-wrap", style: "margin-top: 10px;" }, table));
}

function renderActivityFeed(cardEl, logs) {
  mount(cardEl, [
    el("h3", {}, "Recent System Audit Trail"),
    el("p", { class: "muted small" }, "Immutable audit records showing system modifications and workflow updates.")
  ]);

  const recentLogs = logs.slice(0, 6);

  if (!recentLogs.length) {
    cardEl.appendChild(el("div", { class: "table-empty" }, "No recent activities recorded."));
    return;
  }

  const feedList = el("ul", { class: "activity-feed", style: "list-style:none; padding:0; margin-top:10px;" }, 
    recentLogs.map(log => {
      return el("li", { style: "padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 13px;" }, [
        el("div", { style: "display:flex; justify-content:space-between; align-items:center;" }, [
          el("span", { style: "font-weight:600; color:var(--pine-800)" }, log.action),
          el("span", { class: "muted small" }, formatDateTime(log.created_at))
        ]),
        el("div", { style: "margin-top: 2px" }, [
          el("span", { class: "muted" }, "Actor: "),
          el("span", {}, log.actor_name || "System Operator"),
          el("span", { class: "muted", style: "margin-left: 10px;" }, "Details: "),
          el("span", { style: "font-style: italic" }, log.details || "None recorded")
        ])
      ]);
    })
  );

  cardEl.appendChild(feedList);
}

function statCardPlaceholder(label) {
  return el("div", { class: "card stat-card" }, [el("div", { class: "label" }, label), el("div", { class: "spinner" })]);
}

function statCard(label, value, sub, variant, route) {
  return el("div", {
    class: `card stat-card clickable-card ${variant || ""}`,
    style: "cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;",
    onclick: () => route && goTo(route)
  }, [
    el("div", { class: "label" }, label),
    el("div", { class: "value ledger", style: "font-size: 1.5rem" }, value),
    el("div", { class: "sub" }, sub),
  ]);
}