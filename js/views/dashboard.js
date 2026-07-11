import { api } from "../api.js";
import { getCurrentUser } from "../auth.js";
import { el, mount, formatMoney } from "../utils.js";
import { goTo } from "../router.js";

export async function renderDashboard(root) {
  const user = getCurrentUser();

  const headerCard = el("div", { class: "card" }, [
    el("h3", {}, `Welcome, ${user.full_name.split(" ")[0]}`),
    el("p", { class: "muted" }, "Here's a snapshot of the SACCO's current position, including key portfolio and risk indicators."),
  ]);

  const kpiGrid = el("div", { class: "grid grid-3", id: "kpi-grid" }, [el("div", { class: "spinner" })]);
  const chartsGrid = el("div", { class: "charts-grid", id: "charts-grid" }, [el("div", { class: "spinner" })]);

  const quickLinks = el("div", { class: "card" }, [
    el("h3", {}, "Quick actions"),
    el("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:10px" }, [
      quickLink("Add a member", "/members"),
      quickLink("Review loan applications", "/loans"),
      quickLink("Post a journal entry", "/accounting"),
      quickLink("View risk flags", "/risk"),
    ]),
  ]);

  mount(root, [headerCard, kpiGrid, chartsGrid, quickLinks]);

  const [membersRes, loansRes, parRes, flagsRes] = await Promise.allSettled([
    api.get("/api/v1/members?page_size=1000"),
    api.get("/api/v1/loans/applications"),
    api.get("/api/v1/risk/portfolio-at-risk"),
    api.get("/api/v1/risk/flags?flag_status=open"),
  ]);

  const kpis = [];

  if (membersRes.status === "fulfilled") {
    const total = membersRes.value.total || membersRes.value.items?.length || 0;
    const active = membersRes.value.items?.filter((m) => m.status === "active").length || 0;
    kpis.push(statCard("Total Members", `${total}`, `${active} active`, "good"));
    kpis.push(statCard("Active Members", `${active}`, "Currently active", "good"));
  }

  if (loansRes.status === "fulfilled") {
    const loans = loansRes.value;
    const outstanding = loans.reduce((sum, l) => sum + Number(l.amount_approved || l.amount_requested || 0), 0);
    const activeLoans = loans.filter((l) => ["approved", "disbursed", "active"].includes(l.status)).length;
    kpis.push(statCard("Active Loans", `${activeLoans}`, `UGX ${formatMoney(outstanding)} outstanding`, "good"));
  }

  if (parRes.status === "fulfilled") {
    const par = Number(parRes.value.portfolio_at_risk_pct || 0);
    kpis.push(statCard("Portfolio at Risk", `${par.toFixed(2)}%`, "Overdue vs. total outstanding", par > 5 ? "danger" : "good"));
  }

  if (flagsRes.status === "fulfilled") {
    const flags = flagsRes.value;
    kpis.push(statCard("Open Risk Flags", `${flags.length}`, "Awaiting review", flags.length > 0 ? "warn" : "good"));
  }

  mount(kpiGrid, kpis.length ? kpis : [el("div", { class: "card empty-state" }, [el("h4", {}, "No dashboard data available"), el("p", {}, "Your role may not have permission to view SACCO-wide metrics.")])]);

  const chartData = buildDashboardData(membersRes, loansRes, parRes, flagsRes);
  renderCharts(chartsGrid, chartData);
}

function buildDashboardData(membersRes, loansRes, parRes, flagsRes) {
  const data = {
    memberStatuses: [],
    loanStatuses: [],
    parOverview: { overdue: 0, total: 0 },
    flagTypes: [],
  };

  if (membersRes.status === "fulfilled") {
    const counts = {};
    (membersRes.value.items || []).forEach((m) => {
      const s = m.status || "unknown";
      counts[s] = (counts[s] || 0) + 1;
    });
    data.memberStatuses = Object.entries(counts).map(([status, count]) => ({ status, count }));
  }

  if (loansRes.status === "fulfilled") {
    const counts = {};
    const amounts = {};
    (loansRes.value || []).forEach((l) => {
      const s = l.status || "unknown";
      counts[s] = (counts[s] || 0) + 1;
      amounts[s] = (amounts[s] || 0) + Number(l.amount_approved || l.amount_requested || 0);
    });
    data.loanStatuses = {
      labels: Object.keys(counts),
      counts: Object.values(counts),
      amounts: Object.keys(counts).map((s) => amounts[s] || 0),
    };
  }

  if (parRes.status === "fulfilled") {
    data.parOverview = {
      overdue: Number(parRes.value.overdue_outstanding || 0),
      total: Number(parRes.value.total_outstanding || 0),
      healthy: Number(parRes.value.total_outstanding || 0) - Number(parRes.value.overdue_outstanding || 0),
    };
  }

  if (flagsRes.status === "fulfilled") {
    const counts = {};
    (flagsRes.value || []).forEach((f) => {
      const t = f.flag_type || "unknown";
      counts[t] = (counts[t] || 0) + 1;
    });
    data.flagTypes = Object.entries(counts)
      .map(([type, count]) => ({ type: type.replace(/_/g, " "), count }))
      .sort((a, b) => b.count - a.count);
  }

  return data;
}

function renderCharts(root, data) {
  mount(root, [
    el("div", { class: "chart-card" }, [
      el("h3", {}, "Loan portfolio by status"),
      el("div", { class: "chart-wrap", id: "chart-loans" }),
    ]),
    el("div", { class: "chart-card" }, [
      el("h3", {}, "Member status distribution"),
      el("div", { class: "chart-wrap", id: "chart-members" }),
    ]),
    el("div", { class: "chart-card" }, [
      el("h3", {}, "Portfolio at risk"),
      el("div", { class: "chart-wrap", id: "chart-par" }),
    ]),
    el("div", { class: "chart-card" }, [
      el("h3", {}, "Open risk flags by type"),
      el("div", { class: "chart-wrap", id: "chart-flags" }),
    ]),
  ]);

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Inter, sans-serif", color: "#4B554F" },
    margin: { t: 10, r: 10, b: 40, l: 50 },
    autosize: true,
  };
  const config = { responsive: true, displayModeBar: false };

  if (data.loanStatuses.labels.length) {
    Plotly.newPlot("chart-loans", {
      data: [
        {
          x: data.loanStatuses.labels,
          y: data.loanStatuses.counts,
          type: "bar",
          marker: { color: "#1B4B43" },
          name: "Loans",
        },
      ],
      layout: {
        ...layout,
        xaxis: { title: "Status", tickangle: -30 },
        yaxis: { title: "Count" },
        bargap: 0.4,
      },
      config,
    });
  }

  if (data.memberStatuses.length) {
    Plotly.newPlot("chart-members", {
      data: [
        {
          labels: data.memberStatuses.map((s) => titleCase(s.status)),
          values: data.memberStatuses.map((s) => s.count),
          type: "pie",
          hole: 0.55,
          marker: { colors: ["#1B4B43", "#23685C", "#C89B3C", "#B3261E", "#7C8880"] },
          textinfo: "label+percent",
          textposition: "outside",
        },
      ],
      layout: {
        ...layout,
        showlegend: false,
        margin: { t: 10, r: 10, b: 10, l: 10 },
      },
      config,
    });
  }

  if (data.parOverview.total > 0 || data.parOverview.overdue > 0) {
    Plotly.newPlot("chart-par", {
      data: [
        {
          x: ["Healthy", "Overdue"],
          y: [data.parOverview.healthy, data.parOverview.overdue],
          type: "bar",
          marker: { color: ["#1B4B43", "#B3261E"] },
        },
      ],
      layout: {
        ...layout,
        xaxis: { title: "" },
        yaxis: { title: "UGX" },
        bargap: 0.4,
      },
      config,
    });
  }

  if (data.flagTypes.length) {
    Plotly.newPlot("chart-flags", {
      data: [
        {
          x: data.flagTypes.map((f) => f.count),
          y: data.flagTypes.map((f) => f.type),
          type: "bar",
          orientation: "h",
          marker: { color: "#C89B3C" },
        },
      ],
      layout: {
        ...layout,
        xaxis: { title: "Flags" },
        yaxis: { title: "" },
        bargap: 0.35,
      },
      config,
    });
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

function titleCase(value) {
  if (!value) return "";
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
