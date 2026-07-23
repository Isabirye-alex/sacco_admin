import { api } from "../api.js";
import { el, mount, formatMoney, titleCase, dataTable, openModal, showToast } from "../utils.js";

let active = "trial-balance";
let accountSearchQuery = "";
let vendorSearchQuery = "";
let tbSearchQuery = "";
let entriesPerPage = 10;
let postingDateFilter = new Date().toLocaleDateString("en-GB");
let coaSortKey = null;
let coaSortDir = 1;

// Cached data shared across tabs so the KPI strip doesn't refetch on every switch
let accountsCache = null;
let accountsCacheAt = 0;
const CACHE_TTL_MS = 15000;

// --- Local-only persistence (feature areas without a dedicated backend endpoint) ---
const LS = {
  vendors: "sacco_vendors",
  vendorLedger: "sacco_vendor_ledger",
  dividendHistory: "sacco_dividend_history",
  journalDrafts: "sacco_journal_drafts",
};

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// --- Inline SVG Icons ---
const ICONS = {
  trialBalance: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/></svg>`,
  chart: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>`,
  journal: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>`,
  dividends: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  vendors: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`,
  settings: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
  search: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>`,
  plus: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>`,
  trash: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`,
  file: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`,
  edit: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>`,
  download: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M7 10l5 5 5-5M12 15V3"/></svg>`,
  print: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"/></svg>`,
  history: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  refresh: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>`,
};

function createIconSpan(svgString) {
  const span = el("span", { class: "ac-btn-icon-wrapper" });
  span.innerHTML = svgString;
  return span;
}

function iconOnly(svgString) {
  const span = el("span", { class: "ac-icon-only" });
  span.innerHTML = svgString;
  return span;
}

// --- Shared helpers -------------------------------------------------------

async function getAccounts(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && accountsCache && now - accountsCacheAt < CACHE_TTL_MS) {
    return accountsCache;
  }
  const accounts = await api.get("/api/v1/accounting/accounts");
  accountsCache = accounts;
  accountsCacheAt = now;
  return accounts;
}

function categoryTone(category) {
  const key = (category || "").toLowerCase();
  if (key.includes("asset")) return "blue";
  if (key.includes("liab")) return "amber";
  if (key.includes("equity")) return "violet";
  if (key.includes("income") || key.includes("revenue")) return "emerald";
  if (key.includes("expense")) return "rose";
  return "slate";
}

function categoryBadge(category) {
  const tone = categoryTone(category);
  return el("span", { class: `ac-chip ac-chip-${tone}` }, category || "Uncategorized");
}

function computeSummary(accounts) {
  const sum = (pred) => accounts.filter(pred).reduce((s, a) => s + Number(a.balance || 0), 0);
  const isCat = (a, c) => (a.category || a.account_type || "").toLowerCase().includes(c);
  const assets = sum((a) => isCat(a, "asset"));
  const liabilities = sum((a) => isCat(a, "liab"));
  const equity = sum((a) => isCat(a, "equity"));
  const income = sum((a) => isCat(a, "income") || isCat(a, "revenue"));
  const expenses = sum((a) => isCat(a, "expense"));
  return { assets, liabilities, equity, income, expenses, netIncome: income - expenses };
}

function exportToCsv(filename, headers, rows) {
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`Exported ${filename}`, "success");
}

function skeletonRows(n = 5) {
  return el(
    "div",
    { class: "ac-skeleton-block" },
    Array.from({ length: n }).map(() => el("div", { class: "ac-skeleton-row" }))
  );
}

// --- Root render ------------------------------------------------------------

export async function renderAccounting(root) {
  injectGlobalStylesOnce();

  const shell = el("div", { class: "ac-shell" });
  const kpiBar = el("div", { class: "ac-kpi-bar" }, [skeletonRows(1)]);

  const tabs = el("div", { class: "ac-tabs-container" }, [
    tabButton("trial-balance", "Trial Balance", ICONS.trialBalance, root),
    tabButton("accounts", "Chart of Accounts", ICONS.chart, root),
    tabButton("journal", "Journal Entry", ICONS.journal, root),
    tabButton("dividends", "Dividends", ICONS.dividends, root),
    tabButton("vendors", "Vendors", ICONS.vendors, root),
    tabButton("gl-settings", "GL Settings", ICONS.settings, root),
  ]);

  const content = el("div", { class: "ac-tab-content-wrapper" });
  mount(shell, [kpiBar, tabs, content]);
  mount(root, [shell]);

  renderKpiBar(kpiBar);
  await renderTabContent(content, root);
}

async function renderKpiBar(kpiBar) {
  try {
    const accounts = await getAccounts();
    const s = computeSummary(accounts);
    const balanced = Math.abs(s.assets - (s.liabilities + s.equity + s.netIncome)) < 1;
    mount(kpiBar, [
      kpiCard("Total Assets", s.assets, "blue"),
      kpiCard("Total Liabilities", s.liabilities, "amber"),
      kpiCard("Member Equity", s.equity, "violet"),
      kpiCard("Net Income (YTD)", s.netIncome, s.netIncome >= 0 ? "emerald" : "rose"),
      el("div", { class: `ac-kpi-status ${balanced ? "ok" : "warn"}` }, [
        el("span", { class: "ac-kpi-status-dot" }),
        el("span", {}, balanced ? "Books Balanced" : "Review Needed"),
      ]),
    ]);
  } catch {
    mount(kpiBar, []);
  }
}

function kpiCard(label, value, tone) {
  return el("div", { class: `ac-kpi-card ac-kpi-${tone}` }, [
    el("span", { class: "ac-kpi-label" }, label),
    el("span", { class: "ac-kpi-value" }, `UGX ${formatMoney(value)}`),
  ]);
}

function tabButton(key, label, iconSvg, root) {
  const btn = el("button", {
    class: `ac-tab-btn ${active === key ? "active" : ""}`,
    onclick: async (e) => {
      if (active === key) return;
      active = key;

      const parent = e.currentTarget.parentNode;
      if (parent) {
        parent.querySelectorAll(".ac-tab-btn").forEach((b) => b.classList.remove("active"));
      }
      e.currentTarget.classList.add("active");

      const contentWrapper = root.querySelector(".ac-tab-content-wrapper");
      if (contentWrapper) {
        await renderTabContent(contentWrapper, root);
      }
    },
  });
  btn.innerHTML = `${iconSvg} <span>${label}</span>`;
  return btn;
}

async function renderTabContent(content, root) {
  mount(content, [
    el("div", { class: "ac-card ac-skeleton-card" }, [
      el("div", { class: "ac-skeleton-title" }),
      skeletonRows(5),
    ]),
  ]);

  try {
    if (active === "accounts") await renderAccountsTab(content, root);
    else if (active === "journal") await renderJournalTab(content, root);
    else if (active === "dividends") await renderDividendsTab(content, root);
    else if (active === "vendors") await renderVendorsTab(content, root);
    else if (active === "gl-settings") await renderGlSettingsTab(content, root);
    else await renderTrialBalanceTab(content);
  } catch (err) {
    mount(content, [
      el("div", { class: "ac-card ac-empty-state ac-fade-in" }, [
        el("h4", { style: "color: var(--rose-600);" }, "Error Loading Ledger Data"),
        el("p", { class: "muted" }, err.message || "An unexpected error occurred."),
        el("button", { class: "ac-btn-secondary", onclick: () => renderTabContent(content, root) }, "Retry"),
      ]),
    ]);
  }
}

// --- 1. Trial Balance Tab ---------------------------------------------------

async function renderTrialBalanceTab(content) {
  const [lines, accounts] = await Promise.all([
    api.get("/api/v1/accounting/trial-balance"),
    getAccounts().catch(() => []),
  ]);

  const codeToCategory = new Map(accounts.map((a) => [a.code, a.category || titleCase(a.account_type || "")]));

  const searchInput = el("input", {
    class: "ac-search-input",
    placeholder: "Search by account name or code...",
    value: tbSearchQuery,
    oninput: (e) => {
      tbSearchQuery = e.target.value;
      renderTable();
    },
  });
  const searchIconSpan = el("span", { class: "ac-search-icon" });
  searchIconSpan.innerHTML = ICONS.search;

  const tableHolder = el("div", { class: "ac-fade-in" });
  const footerHolder = el("div");

  function renderTable() {
    const q = tbSearchQuery.toLowerCase().trim();
    const filtered = lines.filter(
      (l) => (l.account_code || "").toLowerCase().includes(q) || (l.account_name || "").toLowerCase().includes(q)
    );

    const totalDebit = filtered.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCredit = filtered.reduce((s, l) => s + Number(l.credit || 0), 0);
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

    const table = dataTable(
      [
        { header: "Account Code", render: (l) => el("span", { class: "ac-code-badge" }, l.account_code) },
        { header: "Account Name", render: (l) => el("span", { style: "font-weight: 500; color: var(--pine-900);" }, l.account_name) },
        {
          header: "Category",
          render: (l) => categoryBadge(codeToCategory.get(l.account_code) || "—"),
        },
        { header: "Debit", className: "ledger", render: (l) => (Number(l.debit) > 0 ? `UGX ${formatMoney(l.debit)}` : el("span", { class: "muted" }, "—")) },
        { header: "Credit", className: "ledger", render: (l) => (Number(l.credit) > 0 ? `UGX ${formatMoney(l.credit)}` : el("span", { class: "muted" }, "—")) },
      ],
      filtered,
      tbSearchQuery ? "No accounts match your search." : "No posted journal activity yet."
    );

    mount(tableHolder, [table]);
    mount(footerHolder, [
      el("div", { class: "ac-summary-footer" }, [
        el("span", {}, `Total Debit: UGX ${formatMoney(totalDebit)}`),
        el("span", {}, `Total Credit: UGX ${formatMoney(totalCredit)}`),
        el("span", { class: `ac-status-badge ${isBalanced ? "success" : "warning"}` }, isBalanced ? "✓ Ledger Balanced" : "⚠ Ledger Unbalanced"),
      ]),
    ]);
  }

  renderTable();

  mount(content, [
    el("div", { class: "ac-card ac-fade-in" }, [
      el("div", { class: "ac-card-header" }, [
        el("div", {}, [el("h3", {}, "Trial Balance"), el("p", { class: "muted small" }, "Double-entry validation ledger summary")]),
        el("div", { class: "ac-header-actions" }, [
          el("button", { class: "ac-btn-secondary btn-sm", onclick: () => window.print() }, [iconOnly(ICONS.print), el("span", {}, "Print")]),
          el(
            "button",
            {
              class: "ac-btn-secondary btn-sm",
              onclick: () =>
                exportToCsv(
                  "trial-balance.csv",
                  ["Account Code", "Account Name", "Category", "Debit", "Credit"],
                  lines.map((l) => [l.account_code, l.account_name, codeToCategory.get(l.account_code) || "", l.debit || 0, l.credit || 0])
                ),
            },
            [iconOnly(ICONS.download), el("span", {}, "Export CSV")]
          ),
        ]),
      ]),
      el("div", { class: "ac-search-wrapper", style: "max-width: 320px; margin-bottom: 16px;" }, [searchIconSpan, searchInput]),
      tableHolder,
      footerHolder,
    ]),
  ]);
}

// --- 2. Chart of Accounts ----------------------------------------------------

async function renderAccountsTab(content, root) {
  let accounts = [];
  try {
    accounts = await getAccounts(true);
  } catch (e) {
    accounts = [];
  }

  const headerTitleStrip = el("div", { class: "coa-title-strip" }, [
    el("div", { class: "coa-title-group" }, [el("h2", { class: "coa-main-title" }, "Chart of Accounts"), el("span", { class: "coa-subtitle" }, "SACCO")]),
    el("div", { class: "coa-breadcrumb" }, [el("span", { class: "coa-home-icon" }, "Accounting > "), el("span", {}, "Chart of Accounts")]),
  ]);

  const actionBar = el("div", { class: "coa-action-bar" }, [
    el("button", { class: "coa-btn-group-item coa-btn-new", onclick: () => openAccountModal(content, root) }, [createIconSpan(ICONS.file), el("span", {}, "New")]),
    el("button", {
      class: "coa-btn-group-item",
      onclick: () =>
        exportToCsv(
          "chart-of-accounts.csv",
          ["Code", "Name", "Income/Balance", "Category", "Subcategory", "Type", "Balance"],
          accounts.map((a) => [a.code, a.name, a.income_balance || "Balance Sheet", a.category || a.account_type || "", a.subcategory || "", a.type || "Posting", a.balance || 0])
        ),
    }, [createIconSpan(ICONS.download), el("span", {}, "Export")]),
    el("div", { class: "coa-btn-dropdown-group" }, [el("button", { class: "coa-btn-group-item" }, "Trial Balance"), el("button", { class: "coa-btn-caret" }, "▾")]),
    el("div", { class: "coa-btn-dropdown-group" }, [el("button", { class: "coa-btn-group-item" }, "Detailed Trial Balance"), el("button", { class: "coa-btn-caret" }, "▾")]),
  ]);

  const postingDateInput = el("input", { type: "text", class: "coa-date-input", value: postingDateFilter });

  const filterBar = el("div", { class: "coa-filter-bar" }, [
    el("label", { class: "coa-filter-label" }, "Posting Date Filter"),
    postingDateInput,
    el(
      "button",
      {
        class: "coa-btn-set",
        onclick: () => {
          postingDateFilter = postingDateInput.value;
          showToast(`Date filter updated: ${postingDateFilter}`, "info");
        },
      },
      "Set"
    ),
  ]);

  const entriesSelect = el(
    "select",
    {
      class: "coa-entries-select",
      onchange: (e) => {
        entriesPerPage = parseInt(e.target.value);
        renderGrid();
      },
    },
    [
      el("option", { value: "10", selected: entriesPerPage === 10 }, "10"),
      el("option", { value: "25", selected: entriesPerPage === 25 }, "25"),
      el("option", { value: "50", selected: entriesPerPage === 50 }, "50"),
      el("option", { value: "100", selected: entriesPerPage === 100 }, "100"),
    ]
  );

  const searchInput = el("input", {
    class: "coa-search-input",
    type: "text",
    value: accountSearchQuery,
    placeholder: "Code, name, category...",
    oninput: (e) => {
      accountSearchQuery = e.target.value;
      renderGrid();
    },
  });

  const tableControls = el("div", { class: "coa-table-controls" }, [
    el("div", { class: "coa-show-entries" }, [el("span", {}, "Show "), entriesSelect, el("span", {}, " entries")]),
    el("div", { class: "coa-search-group" }, [el("span", {}, "Search: "), searchInput]),
  ]);

  const gridHolder = el("div", { class: "coa-grid-wrapper ac-fade-in" });

  async function handleDelete(accountId) {
    if (confirm("Are you sure you want to delete this account? This cannot be undone.")) {
      try {
        await api.delete(`/api/v1/accounting/accounts/${accountId}`);
        showToast("Account deleted.", "success");
        await renderAccountsTab(content, root);
        const kpiBar = root.querySelector(".ac-kpi-bar");
        if (kpiBar) renderKpiBar(kpiBar);
      } catch (err) {
        showToast(err.message || "Failed to delete account.", "error");
      }
    }
  }

  function setSort(key) {
    if (coaSortKey === key) coaSortDir *= -1;
    else {
      coaSortKey = key;
      coaSortDir = 1;
    }
    renderGrid();
  }

  function sortHeader(label, key) {
    const active = coaSortKey === key;
    return el(
      "th",
      { class: "coa-col-sortable", onclick: () => setSort(key) },
      [label, el("span", { class: `coa-sort-icon ${active ? "active" : ""}` }, active ? (coaSortDir === 1 ? "▲" : "▼") : "⇅")]
    );
  }

  function renderGrid() {
    const query = accountSearchQuery.toLowerCase().trim();
    let filtered = accounts.filter(
      (a) =>
        (a.code && a.code.toLowerCase().includes(query)) ||
        (a.name && a.name.toLowerCase().includes(query)) ||
        (a.category && a.category.toLowerCase().includes(query)) ||
        (a.subcategory && a.subcategory.toLowerCase().includes(query))
    );

    if (coaSortKey) {
      filtered = [...filtered].sort((a, b) => {
        const va = a[coaSortKey] ?? "";
        const vb = b[coaSortKey] ?? "";
        if (typeof va === "number" || typeof vb === "number") return (Number(va) - Number(vb)) * coaSortDir;
        return String(va).localeCompare(String(vb)) * coaSortDir;
      });
    }

    const paginated = filtered.slice(0, entriesPerPage);

    const table = el("table", { class: "coa-data-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          sortHeader("Name", "name"),
          sortHeader("Income/Balance", "income_balance"),
          sortHeader("Account Category", "category"),
          sortHeader("Account Subcategory", "subcategory"),
          sortHeader("Account Type", "type"),
          el("th", { class: "coa-col-sortable text-right", onclick: () => setSort("balance") }, [
            "Balance",
            el("span", { class: `coa-sort-icon ${coaSortKey === "balance" ? "active" : ""}` }, coaSortKey === "balance" ? (coaSortDir === 1 ? "▲" : "▼") : "⇅"),
          ]),
          el("th", { style: "width: 70px;" }, ""),
        ]),
      ]),
      el(
        "tbody",
        {},
        paginated.length > 0
          ? paginated.map((a) => {
              const balanceVal = Number(a.balance || 0);
              return el("tr", { class: "coa-row-item" }, [
                el("td", { class: "coa-cell-name" }, [
                  el("span", { class: "ac-code-badge" }, a.code || "—"),
                  el("span", { style: "margin-left: 8px; font-weight: 500;" }, a.name || "—"),
                ]),
                el("td", {}, a.income_balance || "Balance Sheet"),
                el("td", {}, categoryBadge(a.category || titleCase(a.account_type || "Assets"))),
                el("td", {}, a.subcategory || "Current Assets"),
                el("td", {}, a.type || "Posting"),
                el("td", { class: "coa-cell-balance text-right" }, formatMoney(balanceVal)),
                el("td", { class: "text-center" }, [
                  el("button", { class: "coa-btn-icon", title: "Edit Account", onclick: () => openAccountModal(content, root, a) }, [iconOnly(ICONS.edit)]),
                  el("button", { class: "coa-btn-icon coa-btn-icon-danger", title: "Delete Account", onclick: () => handleDelete(a.id) }, [iconOnly(ICONS.trash)]),
                ]),
              ]);
            })
          : [el("tr", {}, [el("td", { colspan: "7", class: "coa-empty-cell" }, "No matching chart of accounts found.")])]
      ),
    ]);

    const rangeLabel = el(
      "div",
      { class: "coa-range-label" },
      `Showing ${Math.min(paginated.length, entriesPerPage)} of ${filtered.length} accounts`
    );

    mount(gridHolder, [table, rangeLabel]);
  }

  renderGrid();

  mount(content, [el("div", { class: "coa-container" }, [headerTitleStrip, actionBar, filterBar, tableControls, gridHolder])]);
}

function openAccountModal(content, root, existing = null) {
  const isEdit = !!existing;
  openModal(isEdit ? `Edit Account — ${existing.name}` : "New Chart of Account", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });

    const codeInput = el("input", { id: "coa-code", placeholder: "e.g. 1200", required: true, defaultValue: existing?.code || "" });
    const nameInput = el("input", { id: "coa-name", placeholder: "e.g. Petty Cash", required: true, defaultValue: existing?.name || "" });

    const incomeBalanceSelect = el("select", { id: "coa-income-balance" }, [
      el("option", { value: "Balance Sheet", selected: (existing?.income_balance || "Balance Sheet") === "Balance Sheet" }, "Balance Sheet"),
      el("option", { value: "Income Statement", selected: existing?.income_balance === "Income Statement" }, "Income Statement"),
    ]);

    const categoryOptions = ["Assets", "Liabilities", "Equity", "Income", "Expenses"];
    const categorySelect = el(
      "select",
      { id: "coa-category" },
      categoryOptions.map((c) => el("option", { value: c, selected: (existing?.category || "Assets") === c }, c))
    );

    const typeOptions = ["Posting", "Heading", "Total"];
    const typeSelect = el(
      "select",
      { id: "coa-type" },
      typeOptions.map((t) => el("option", { value: t, selected: (existing?.type || "Posting") === t }, t))
    );

    const subcategoryInput = el("input", { id: "coa-subcategory", placeholder: "e.g. Current Assets, Equity...", defaultValue: existing?.subcategory || "Current Assets" });
    const balanceInput = el("input", { id: "coa-balance", type: "number", step: "0.01", defaultValue: existing ? String(existing.balance ?? 0) : "0.00", disabled: isEdit });

    const form = el("form", { class: "ac-form" }, [
      el("div", { class: "field-row" }, [
        el("div", { class: "ac-field" }, [el("label", {}, "Account No. / Code"), codeInput]),
        el("div", { class: "ac-field" }, [el("label", {}, "Account Name"), nameInput]),
      ]),
      el("div", { class: "field-row" }, [
        el("div", { class: "ac-field" }, [el("label", {}, "Income / Balance"), incomeBalanceSelect]),
        el("div", { class: "ac-field" }, [el("label", {}, "Account Category"), categorySelect]),
      ]),
      el("div", { class: "field-row" }, [
        el("div", { class: "ac-field" }, [el("label", {}, "Account Subcategory"), subcategoryInput]),
        el("div", { class: "ac-field" }, [el("label", {}, "Account Type"), typeSelect]),
      ]),
      el("div", { class: "ac-field" }, [
        el("label", {}, isEdit ? "Current Balance (UGX) — adjust via a journal entry" : "Opening Balance (UGX)"),
        balanceInput,
      ]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, isEdit ? "Save Changes" : "Create Account"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        const payload = {
          code: codeInput.value,
          name: nameInput.value,
          income_balance: incomeBalanceSelect.value,
          category: categorySelect.value,
          account_type: categorySelect.value.toLowerCase(),
          subcategory: subcategoryInput.value,
          type: typeSelect.value,
        };
        if (!isEdit) payload.balance = Number(balanceInput.value || 0);

        if (isEdit) {
          await api.patch(`/api/v1/accounting/accounts/${existing.id}`, payload);
          showToast("Account updated successfully.", "success");
        } else {
          await api.post("/api/v1/accounting/accounts", payload);
          showToast("Account created successfully.", "success");
        }
        await renderTabContent(content, root);
        const kpiBar = root.querySelector(".ac-kpi-bar");
        if (kpiBar) renderKpiBar(kpiBar);
        closeFn();
      } catch (err) {
        errorEl.textContent = err.message || `Failed to ${isEdit ? "update" : "create"} account.`;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

// --- 3. Journal Entry Builder --------------------------------------------------

async function renderJournalTab(content, root) {
  const accounts = await getAccounts();
  if (!accounts.length) {
    mount(content, [
      el("div", { class: "ac-card ac-empty-state ac-fade-in" }, [
        el("h4", {}, "No Chart of Accounts yet"),
        el("p", { class: "muted" }, "Create at least two accounts on the Chart of Accounts tab first."),
      ]),
    ]);
    return;
  }

  const linesHolder = el("div", { class: "ac-je-lines-container" });
  const narrativeInput = el("input", { id: "je-narrative", placeholder: "Explain this transaction..." });
  const dateInput = el("input", { id: "je-date", type: "date", value: new Date().toISOString().slice(0, 10) });
  const errorEl = el("p", { class: "form-error", hidden: true });
  const balanceIndicator = el("div", { class: "ac-je-balance-bar" });
  const recentHolder = el("div", { class: "ac-fade-in", style: "margin-top: 24px;" });

  function accountOptions() {
    return accounts.map((a) => el("option", { value: a.id }, `${a.code} — ${a.name}`));
  }

  function addLine(prefill) {
    const debitInput = el("input", { class: "je-debit ac-input", type: "number", placeholder: "Debit Amount", step: "0.01", oninput: updateBalance });
    const creditInput = el("input", { class: "je-credit ac-input", type: "number", placeholder: "Credit Amount", step: "0.01", oninput: updateBalance });
    if (prefill?.debit) debitInput.value = prefill.debit;
    if (prefill?.credit) creditInput.value = prefill.credit;

    const row = el("div", { class: "ac-je-row ac-slide-up" }, [
      el("div", { style: "flex: 2;" }, [el("select", { class: "je-account ac-input" }, accountOptions())]),
      el("div", { style: "flex: 1;" }, [debitInput]),
      el("div", { style: "flex: 1;" }, [creditInput]),
      el(
        "button",
        {
          type: "button",
          class: "ac-btn-icon-danger",
          onclick: () => {
            if (linesHolder.children.length <= 2) {
              showToast("A journal entry needs at least two lines.", "info");
              return;
            }
            row.style.opacity = 0;
            row.style.transform = "scale(0.95)";
            setTimeout(() => {
              row.remove();
              updateBalance();
            }, 150);
          },
        },
        []
      ),
    ]);
    row.querySelector(".ac-btn-icon-danger").innerHTML = ICONS.trash;
    if (prefill?.accountId) row.querySelector(".je-account").value = prefill.accountId;
    linesHolder.appendChild(row);
    updateBalance();
  }

  function clearLines() {
    linesHolder.innerHTML = "";
    addLine();
    addLine();
    narrativeInput.value = "";
    updateBalance();
  }

  function updateBalance() {
    const rows = [...linesHolder.children];
    let debit = 0,
      credit = 0;
    rows.forEach((r) => {
      debit += Number(r.querySelector(".je-debit").value || 0);
      credit += Number(r.querySelector(".je-credit").value || 0);
    });
    const balanced = Math.abs(debit - credit) < 0.01 && debit > 0;

    balanceIndicator.innerHTML = `
      <div style="display: flex; gap: 16px;">
        <span>Debit: <strong>UGX ${formatMoney(debit)}</strong></span>
        <span>Credit: <strong>UGX ${formatMoney(credit)}</strong></span>
      </div>
      <span class="ac-status-badge ${balanced ? "success" : "warning"}">
        ${balanced ? "✓ Balanced" : "⚠ Not Balanced"}
      </span>
    `;
  }

  addLine();
  addLine();

  const form = el("form", { class: "ac-form" }, [
    el("div", { class: "field-row" }, [
      el("div", { class: "ac-field", style: "flex: 2;" }, [el("label", {}, "Narrative / Memorandum Description"), narrativeInput]),
      el("div", { class: "ac-field", style: "flex: 1;" }, [el("label", {}, "Transaction Date"), dateInput]),
    ]),
    el("div", { class: "ac-field" }, [
      el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;" }, [
        el("label", { style: "margin: 0;" }, "Transaction Split Lines"),
        el("button", { type: "button", class: "ac-btn-secondary btn-sm", onclick: () => addLine() }, "+ Add Split Line"),
      ]),
      linesHolder,
    ]),
    balanceIndicator,
    errorEl,
    el("div", { class: "modal-actions", style: "justify-content: flex-start; margin-top: 24px; gap: 12px;" }, [
      el("button", { type: "submit", class: "ac-btn-primary" }, "Post Journal Entry"),
      el("button", { type: "button", class: "ac-btn-secondary", onclick: clearLines }, "Clear Form"),
    ]),
  ]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const rows = [...linesHolder.children];
    const lines = rows
      .map((r) => ({
        account_id: r.querySelector(".je-account").value,
        debit: Number(r.querySelector(".je-debit").value || 0),
        credit: Number(r.querySelector(".je-credit").value || 0),
      }))
      .filter((l) => l.debit > 0 || l.credit > 0);

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (lines.length < 2) {
      errorEl.textContent = "Add at least two split lines before posting.";
      errorEl.hidden = false;
      return;
    }
    if (Math.abs(totalDebit - totalCredit) >= 0.01) {
      errorEl.textContent = "Total debits must equal total credits before posting.";
      errorEl.hidden = false;
      return;
    }

    try {
      await api.post("/api/v1/accounting/journal-entries", { narrative: narrativeInput.value || null, date: dateInput.value || null, lines });
      showToast("Journal entry successfully posted.", "success");
      active = "trial-balance";

      const tabbar = root.querySelector(".ac-tabs-container");
      if (tabbar) {
        tabbar.querySelectorAll(".ac-tab-btn").forEach((btn) => btn.classList.remove("active"));
        const targetBtn = tabbar.querySelector("button[onclick*='trial-balance']");
        if (targetBtn) targetBtn.classList.add("active");
      }

      await renderTabContent(content, root);
      const kpiBar = root.querySelector(".ac-kpi-bar");
      if (kpiBar) renderKpiBar(kpiBar);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  // Best-effort recent entries panel — gracefully hides itself if the endpoint isn't available.
  api
    .get("/api/v1/accounting/journal-entries")
    .then((entries) => {
      if (!Array.isArray(entries) || !entries.length) return;
      const recent = entries.slice(0, 6);
      mount(recentHolder, [
        el("div", { class: "ac-card" }, [
          el("div", { class: "ac-card-header" }, [
            el("div", {}, [el("h3", {}, "Recent Journal Entries"), el("p", { class: "muted small" }, "Last posted transactions")]),
          ]),
          el(
            "div",
            { class: "ac-recent-list" },
            recent.map((entry) =>
              el("div", { class: "ac-recent-item" }, [
                el("div", {}, [
                  el("div", { style: "font-weight: 600; color: var(--pine-900);" }, entry.narrative || "Untitled entry"),
                  el("div", { class: "muted small" }, entry.date || entry.created_at || ""),
                ]),
                el("span", { class: "ac-code-badge" }, `UGX ${formatMoney(entry.total_debit || entry.amount || 0)}`),
              ])
            )
          ),
        ]),
      ]);
    })
    .catch(() => {
      /* endpoint not available yet — silently skip */
    });

  mount(content, [
    el("div", { class: "ac-card ac-fade-in" }, [
      el("div", { class: "ac-card-header" }, [
        el("div", {}, [el("h3", {}, "New Journal Entry"), el("p", { class: "muted small" }, "Post manual balanced double-entry ledger adjustments")]),
      ]),
      form,
    ]),
    recentHolder,
  ]);
}

// --- 4. Dividend Calculator --------------------------------------------------

async function renderDividendsTab(content, root) {
  const errorEl = el("p", { class: "form-error", hidden: true });
  const resultHolder = el("div", { class: "ac-slide-up", style: "margin-top:20px" });
  const historyHolder = el("div", { style: "margin-top: 20px;" });

  const yearInput = el("input", { id: "dv-year", placeholder: "e.g. 2025", required: true });
  const rateInput = el("input", { id: "dv-rate", type: "number", step: "0.0001", placeholder: "Rate per weight", required: true });

  const form = el("form", { class: "ac-form" }, [
    el("div", { class: "field-row" }, [
      el("div", { class: "ac-field" }, [el("label", {}, "Financial Year"), yearInput]),
      el("div", { class: "ac-field" }, [el("label", {}, "Dividend Rate (UGX per Share Weight)"), rateInput]),
    ]),
    errorEl,
    el("button", { type: "submit", class: "ac-btn-primary", style: "width: fit-content;" }, "Run Calculations"),
  ]);

  function renderHistory() {
    const history = lsGet(LS.dividendHistory, []);
    if (!history.length) {
      mount(historyHolder, []);
      return;
    }
    mount(historyHolder, [
      el("div", { class: "ac-card" }, [
        el("div", { class: "ac-card-header" }, [
          el("div", {}, [el("h3", {}, [iconOnly(ICONS.history), " Declaration History"]), el("p", { class: "muted small" }, "Recent dividend runs on this device")]),
        ]),
        dataTable(
          [
            { header: "Financial Year", render: (h) => h.year },
            { header: "Rate", render: (h) => `UGX ${h.rate}` },
            { header: "Total Disbursed", render: (h) => `UGX ${formatMoney(h.total)}` },
            { header: "Accounts Paid", render: (h) => h.membersPaid },
            { header: "Declared On", render: (h) => new Date(h.at).toLocaleString() },
          ],
          history,
          "No declarations yet."
        ),
      ]),
    ]);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    try {
      const result = await api.post("/api/v1/shares/dividends/declare", {
        financial_year: yearInput.value,
        rate_per_share: Number(rateInput.value),
      });
      showToast("Dividends successfully computed and distributed.", "success");
      mount(resultHolder, [
        el("div", { class: "ac-card success", style: "border-left: 4px solid var(--emerald-500);" }, [
          el("h3", { style: "color: var(--emerald-800);" }, "✓ Calculation Complete"),
          el("p", { class: "muted small" }, `Calculations processed based on financial year ${yearInput.value}:`),
          infoRow("Total Disbursed Sum", `UGX ${formatMoney(result.total_amount)}`),
          infoRow("Member Accounts Paid", `${result.members_paid} accounts`),
          infoRow("Rate Applied", `UGX ${rateInput.value} per unit`),
        ]),
      ]);

      const history = lsGet(LS.dividendHistory, []);
      history.unshift({ year: yearInput.value, rate: rateInput.value, total: result.total_amount, membersPaid: result.members_paid, at: Date.now() });
      lsSet(LS.dividendHistory, history.slice(0, 20));
      renderHistory();

      const kpiBar = root.querySelector(".ac-kpi-bar");
      if (kpiBar) renderKpiBar(kpiBar);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  renderHistory();

  mount(content, [
    el("div", { class: "ac-card ac-fade-in" }, [
      el("div", { class: "ac-card-header" }, [
        el("div", {}, [el("h3", {}, "Calculate & Disburse Dividends"), el("p", { class: "muted small" }, "Automatically credit member ledger weightings.")]),
      ]),
      form,
    ]),
    resultHolder,
    historyHolder,
  ]);
}

function infoRow(label, val) {
  return el("div", { class: "ac-info-row" }, [el("span", { class: "muted" }, label), el("span", { style: "font-weight: 600; color: var(--pine-900);" }, val)]);
}

// --- 5. Vendor & Supplies Manager ---------------------------------------------

async function renderVendorsTab(content, root) {
  let vendors = lsGet(LS.vendors, null);
  if (!vendors) {
    vendors = [
      { id: "1", name: "Umeme Utilities Ltd", contact: "Billing Desk", phone: "0800185185", email: "billing@umeme.co.ug" },
      { id: "2", name: "National Water & Sewerage Corp", contact: "NWSC Help", phone: "0800300900", email: "info@nwsc.co.ug" },
    ];
    lsSet(LS.vendors, vendors);
  }

  const accounts = await getAccounts().catch(() => []);
  const ledger = lsGet(LS.vendorLedger, {});

  const searchInput = el("input", {
    class: "ac-search-input",
    placeholder: "Search vendors by name...",
    value: vendorSearchQuery,
    oninput: (e) => {
      vendorSearchQuery = e.target.value;
      renderVendorList();
    },
  });

  const searchIconSpan = el("span", { class: "ac-search-icon" });
  searchIconSpan.innerHTML = ICONS.search;

  const header = el("div", { class: "ac-card-header-row" }, [
    el("div", { class: "ac-search-wrapper" }, [searchIconSpan, searchInput]),
    el("button", { class: "ac-btn-primary", onclick: () => openVendorModal(content, root) }, [createIconSpan(ICONS.plus), el("span", {}, "Register Vendor")]),
  ]);

  const tableWrapper = el("div", { class: "ac-fade-in" });

  function vendorTotalPaid(vendorId) {
    const entries = ledger[vendorId] || [];
    return entries.reduce((s, e) => s + Number(e.amount || 0), 0);
  }

  function handleDeleteVendor(id) {
    if (!confirm("Remove this vendor? Payment history stays on record.")) return;
    const list = lsGet(LS.vendors, []).filter((v) => v.id !== id);
    lsSet(LS.vendors, list);
    showToast("Vendor removed.", "success");
    renderVendorsTab(content, root);
  }

  function renderVendorList() {
    const query = vendorSearchQuery.toLowerCase().trim();
    const filteredVendors = vendors.filter((v) => v.name.toLowerCase().includes(query) || v.contact.toLowerCase().includes(query));

    const table = dataTable(
      [
        { header: "Vendor Name", render: (v) => el("span", { style: "font-weight: 600; color: var(--pine-900);" }, v.name) },
        { header: "Contact Person", render: (v) => v.contact },
        { header: "Phone", render: (v) => v.phone },
        { header: "Email", render: (v) => el("span", { class: "muted small" }, v.email) },
        { header: "Lifetime Paid", render: (v) => `UGX ${formatMoney(vendorTotalPaid(v.id))}` },
        {
          header: "",
          render: (v) =>
            el("div", { style: "display:flex; gap:6px;" }, [
              el("button", { class: "ac-btn-secondary btn-sm", onclick: () => payVendorBillModal(v, accounts, () => renderVendorsTab(content, root)) }, "Pay Invoice"),
              el("button", { class: "ac-btn-secondary btn-sm", onclick: () => openVendorModal(content, root, v) }, "Edit"),
              el("button", { class: "ac-btn-icon-danger btn-sm", onclick: () => handleDeleteVendor(v.id) }, [iconOnly(ICONS.trash)]),
            ]),
        },
      ],
      filteredVendors,
      "No matching vendors found."
    );

    mount(tableWrapper, [el("div", { class: "ac-card" }, [table])]);
  }

  renderVendorList();
  mount(content, [header, tableWrapper]);
  setTimeout(() => searchInput.focus(), 50);
}

function openVendorModal(content, root, existing = null) {
  const isEdit = !!existing;
  openModal(isEdit ? `Edit Vendor — ${existing.name}` : "Register New Vendor", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const nameInput = el("input", { placeholder: "Company Name", required: true, defaultValue: existing?.name || "" });
    const contactInput = el("input", { placeholder: "Primary Contact Account Manager", defaultValue: existing?.contact || "" });
    const phoneInput = el("input", { placeholder: "+256...", defaultValue: existing?.phone || "" });
    const emailInput = el("input", { type: "email", placeholder: "billing@company.com", defaultValue: existing?.email || "" });

    const form = el("form", { class: "ac-form" }, [
      el("div", { class: "ac-field" }, [el("label", {}, "Vendor / Supplier Name"), nameInput]),
      el("div", { class: "field-row" }, [
        el("div", { class: "ac-field" }, [el("label", {}, "Contact Person"), contactInput]),
        el("div", { class: "ac-field" }, [el("label", {}, "Phone Number"), phoneInput]),
      ]),
      el("div", { class: "ac-field" }, [el("label", {}, "Email Address"), emailInput]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, isEdit ? "Save Changes" : "Register Vendor"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!nameInput.value.trim()) {
        errorEl.textContent = "Vendor name is required.";
        errorEl.hidden = false;
        return;
      }
      const list = lsGet(LS.vendors, []);
      if (isEdit) {
        const idx = list.findIndex((v) => v.id === existing.id);
        if (idx >= 0) {
          list[idx] = { ...existing, name: nameInput.value, contact: contactInput.value || "—", phone: phoneInput.value || "—", email: emailInput.value || "—" };
        }
        showToast("Vendor updated.", "success");
      } else {
        list.push({ id: Date.now().toString(), name: nameInput.value, contact: contactInput.value || "—", phone: phoneInput.value || "—", email: emailInput.value || "—" });
        showToast("Vendor successfully registered.", "success");
      }
      lsSet(LS.vendors, list);

      await renderVendorsTab(content, root);
      closeFn();
    });

    return [form];
  });
}

function payVendorBillModal(vendor, accounts, onDone) {
  openModal(`Payout Invoice — ${vendor.name}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const amountInput = el("input", { type: "number", required: true, min: "1", placeholder: "UGX Amount" });
    const invoiceInput = el("input", { placeholder: "Invoice identifier string" });

    const assetAccounts = (accounts || []).filter((a) => a.account_type && a.account_type.toLowerCase() === "asset");
    const expenseAccounts = (accounts || []).filter((a) => a.account_type && a.account_type.toLowerCase() === "expense");

    if (assetAccounts.length === 0 || expenseAccounts.length === 0) {
      return [
        el("div", { class: "ac-card ac-empty-state" }, [
          el("p", { style: "color: var(--rose-600); font-weight: 600;" }, "Configuration Error"),
          el("p", { class: "muted small" }, "You must register at least one Asset account and one Expense account in your Chart of Accounts first."),
          el("button", { type: "button", class: "btn btn-secondary", style: "margin-top: 10px;", onclick: closeFn }, "Close"),
        ]),
      ];
    }

    const assetSelect = el("select", { class: "ac-input" }, assetAccounts.map((a) => el("option", { value: a.id }, `${a.code} — ${a.name}`)));
    const expenseSelect = el("select", { class: "ac-input" }, expenseAccounts.map((a) => el("option", { value: a.id }, `${a.code} — ${a.name}`)));

    const form = el("form", { class: "ac-form" }, [
      el("div", { class: "field-row" }, [
        el("div", { class: "ac-field" }, [el("label", {}, "Expense Account (Dr.)"), expenseSelect]),
        el("div", { class: "ac-field" }, [el("label", {}, "Asset/Clearing Account (Cr.)"), assetSelect]),
      ]),
      el("div", { class: "field-row" }, [
        el("div", { class: "ac-field" }, [el("label", {}, "Amount"), amountInput]),
        el("div", { class: "ac-field" }, [el("label", {}, "Invoice / Bill Number"), invoiceInput]),
      ]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Post Payment Ledger"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      const amt = Number(amountInput.value);

      if (!expenseSelect.value || !assetSelect.value) {
        errorEl.textContent = "Please select both an Expense and an Asset account.";
        errorEl.hidden = false;
        return;
      }

      try {
        await api.post("/api/v1/accounting/journal-entries", {
          narrative: `Vendor Payout: ${vendor.name} (Invoice: ${invoiceInput.value || "OTC"})`,
          lines: [
            { account_id: expenseSelect.value, debit: amt, credit: 0 },
            { account_id: assetSelect.value, debit: 0, credit: amt },
          ],
        });

        const ledger = lsGet(LS.vendorLedger, {});
        ledger[vendor.id] = ledger[vendor.id] || [];
        ledger[vendor.id].unshift({ amount: amt, invoice: invoiceInput.value || "OTC", at: Date.now() });
        lsSet(LS.vendorLedger, ledger);

        showToast("Vendor transaction logged successfully.", "success");
        closeFn();
        if (onDone) onDone();
      } catch (err) {
        errorEl.textContent = err.message || "Failed to post ledger transaction.";
        errorEl.hidden = false;
      }
    });

    return [form];
  });
}

// --- 6. GL Settings Tab -------------------------------------------------------

async function renderGlSettingsTab(content, root) {
  const [settings, accounts] = await Promise.all([api.get("/api/v1/accounting/gl-settings"), getAccounts()]);

  if (!accounts.length) {
    mount(content, [
      el("div", { class: "ac-card ac-empty-state" }, [
        el("h4", {}, "No Chart of Accounts yet"),
        el("p", { class: "muted" }, "Create cash, mobile money, and interest accounts first."),
      ]),
    ]);
    return;
  }

  const errorEl = el("p", { class: "form-error", hidden: true });
  const savedLabel = el("p", { class: "muted small", hidden: true });

  function accountSelect(id, currentValue) {
    return el("select", { id }, [
      el("option", { value: "" }, "— Select system parameter target —"),
      ...accounts.map((a) => el("option", { value: a.id, selected: a.id === currentValue }, `${a.code} — ${a.name}`)),
    ]);
  }

  const cashSelect = accountSelect("gl-cash", settings.cash_account_id);
  const mmSelect = accountSelect("gl-mm", settings.mobile_money_account_id);
  const interestSelect = accountSelect("gl-interest", settings.interest_income_account_id);

  const form = el("form", { class: "ac-form" }, [
    el("div", { class: "ac-field" }, [el("label", {}, "Primary Cash / Vault Till"), cashSelect]),
    el("div", { class: "ac-field" }, [el("label", {}, "Mobile Money Clearing Account"), mmSelect]),
    el("div", { class: "ac-field" }, [el("label", {}, "Accrued Share Interest Account"), interestSelect]),
    errorEl,
    el("div", { style: "display:flex; align-items:center; gap:14px;" }, [
      el("button", { type: "submit", class: "ac-btn-primary", style: "width: fit-content;" }, "Save Configuration"),
      savedLabel,
    ]),
  ]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    try {
      await api.patch("/api/v1/accounting/gl-settings", {
        cash_account_id: cashSelect.value || null,
        mobile_money_account_id: mmSelect.value || null,
        interest_income_account_id: interestSelect.value || null,
      });
      showToast("Settings updated.", "success");
      savedLabel.textContent = `Last saved ${new Date().toLocaleString()}`;
      savedLabel.hidden = false;
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  mount(content, [
    el("div", { class: "ac-card ac-fade-in" }, [
      el("div", { class: "ac-card-header" }, [
        el("div", {}, [el("h3", {}, "System Ledger Routing Maps"), el("p", { class: "muted small" }, "Assign auto-transaction hooks to physical ledger structures")]),
      ]),
      form,
    ]),
  ]);
}

// --- CSS Injector System ------------------------------------------------------

function injectGlobalStylesOnce() {
  if (document.getElementById("accounting-global-styles")) return;
  const style = el("style", { id: "accounting-global-styles" });
  style.textContent = `
    .ac-shell {
      --ac-blue: #2563eb;
      --ac-amber: #d97706;
      --ac-violet: #7c3aed;
      --ac-slate: #64748b;
      font-variant-numeric: tabular-nums;
    }

    /* KPI Strip */
    .ac-kpi-bar {
      display: grid;
      grid-template-columns: repeat(4, minmax(160px, 1fr)) auto;
      gap: 12px;
      margin-bottom: 20px;
    }
    .ac-kpi-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-left: 4px solid var(--pine-900, #0f172a);
      border-radius: 12px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .ac-kpi-blue { border-left-color: var(--ac-blue); }
    .ac-kpi-amber { border-left-color: var(--ac-amber); }
    .ac-kpi-violet { border-left-color: var(--ac-violet); }
    .ac-kpi-emerald { border-left-color: var(--emerald-500, #10b981); }
    .ac-kpi-rose { border-left-color: var(--rose-600, #e11d48); }
    .ac-kpi-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #94a3b8;
    }
    .ac-kpi-value {
      font-size: 18px;
      font-weight: 700;
      color: var(--pine-900, #0f172a);
    }
    .ac-kpi-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 14px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 13px;
      white-space: nowrap;
    }
    .ac-kpi-status.ok { color: var(--emerald-800, #065f46); background: #ecfdf5; border: 1px solid #a7f3d0; }
    .ac-kpi-status.warn { color: #92400e; background: #fffbeb; border: 1px solid #fde68a; }
    .ac-kpi-status-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: currentColor;
    }
    @media (max-width: 900px) {
      .ac-kpi-bar { grid-template-columns: repeat(2, 1fr); }
      .ac-kpi-status { grid-column: 1 / -1; justify-content: center; }
    }

    /* Layout & Navigation Tab-bar */
    .ac-tabs-container {
      display: flex;
      gap: 6px;
      background: #f1f5f9;
      padding: 6px;
      border-radius: 12px;
      margin-bottom: 24px;
      overflow-x: auto;
    }
    .ac-tab-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: transparent;
      border: none;
      color: #64748b;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      border-radius: 8px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      white-space: nowrap;
    }
    .ac-tab-btn:hover {
      background: rgba(0, 0, 0, 0.04);
      color: #0f172a;
    }
    .ac-tab-btn.active {
      background: #ffffff;
      color: #0f172a;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
      transform: translateY(-1px);
    }
    .ac-tab-content-wrapper {
      min-height: 250px;
    }

    /* Cards & Containers */
    .ac-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
    }
    .ac-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid #f1f5f9;
      flex-wrap: wrap;
      gap: 12px;
    }
    .ac-card-header h3 {
      font-size: 18px;
      font-weight: 700;
      margin: 0 0 4px 0;
      color: #0f172a;
    }
    .ac-header-actions {
      display: flex;
      gap: 8px;
    }

    /* Skeleton loading states */
    .ac-skeleton-card { pointer-events: none; }
    .ac-skeleton-title {
      height: 18px;
      width: 220px;
      border-radius: 6px;
      margin-bottom: 20px;
      background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 37%, #f1f5f9 63%);
      background-size: 400% 100%;
      animation: ac-shimmer 1.4s ease infinite;
    }
    .ac-skeleton-block { display: flex; flex-direction: column; gap: 10px; }
    .ac-skeleton-row {
      height: 34px;
      border-radius: 8px;
      background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 37%, #f1f5f9 63%);
      background-size: 400% 100%;
      animation: ac-shimmer 1.4s ease infinite;
    }
    @keyframes ac-shimmer {
      0% { background-position: 100% 50%; }
      100% { background-position: 0 50%; }
    }

    /* Category chips */
    .ac-chip {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
    }
    .ac-chip-blue { background: #eff6ff; color: #1d4ed8; }
    .ac-chip-amber { background: #fffbeb; color: #b45309; }
    .ac-chip-violet { background: #f5f3ff; color: #6d28d9; }
    .ac-chip-emerald { background: #ecfdf5; color: #047857; }
    .ac-chip-rose { background: #fff1f2; color: #be123c; }
    .ac-chip-slate { background: #f1f5f9; color: #475569; }

    /* Modern Dynamic Search Rows */
    .ac-card-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .ac-search-wrapper {
      position: relative;
      flex: 1;
      max-width: 400px;
    }
    .ac-search-input {
      width: 100%;
      padding: 10px 12px 10px 40px;
      font-size: 14px;
      border: 1.5px solid #e2e8f0;
      border-radius: 10px;
      outline: none;
      transition: all 0.15s ease;
      box-sizing: border-box;
    }
    .ac-search-input:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }
    .ac-search-icon {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: #94a3b8;
      display: flex;
    }

    /* Buttons */
    .ac-btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #0f172a;
      color: #ffffff;
      border: none;
      font-weight: 600;
      font-size: 14px;
      padding: 10px 18px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .ac-btn-primary:hover {
      background: #1e293b;
      transform: translateY(-1px);
    }
    .ac-btn-primary:active {
      transform: translateY(1px);
    }
    .ac-btn-secondary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #f8fafc;
      color: #334155;
      border: 1.5px solid #e2e8f0;
      font-weight: 600;
      font-size: 13px;
      padding: 8px 14px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .ac-btn-secondary:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }
    .ac-btn-secondary.btn-sm { padding: 6px 10px; font-size: 12px; }
    .ac-btn-icon-danger {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 38px;
      height: 38px;
      background: #fff1f2;
      border: none;
      color: #f43f5e;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .ac-btn-icon-danger.btn-sm { width: 30px; height: 30px; }
    .ac-btn-icon-danger:hover {
      background: #ffe4e6;
    }
    .ac-icon-only { display: flex; }

    /* Recent journal entries panel */
    .ac-recent-list { display: flex; flex-direction: column; gap: 2px; }
    .ac-recent-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 4px;
      border-bottom: 1px solid #f1f5f9;
    }
    .ac-recent-item:last-child { border-bottom: none; }

    /* --- CHART OF ACCOUNTS CUSTOM DESIGN SYSTEM --- */
    .coa-container {
      background: #ffffff;
      padding: 16px 20px;
      font-family: inherit;
      color: #333333;
    }
    .coa-title-strip {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .coa-title-group {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .coa-main-title {
      font-size: 24px;
      font-weight: 400;
      color: #444444;
      margin: 0;
    }
    .coa-subtitle {
      font-size: 13px;
      color: #888888;
      font-weight: 500;
      letter-spacing: 0.5px;
    }
    .coa-breadcrumb {
      font-size: 12px;
      color: #666666;
    }
    .coa-action-bar {
      display: flex;
      gap: 10px;
      margin-bottom: 18px;
      flex-wrap: wrap;
    }
    .coa-btn-group-item {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #f4f4f4;
      border: 1px solid #dcdcdc;
      color: #333333;
      padding: 6px 14px;
      font-size: 13px;
      border-radius: 3px;
      cursor: pointer;
    }
    .coa-btn-group-item:hover {
      background: #e9e9e9;
    }
    .coa-btn-new {
      background: #337ab7;
      color: #ffffff;
      border-color: #2e6da4;
    }
    .coa-btn-new:hover {
      background: #286090;
    }
    .coa-btn-dropdown-group {
      display: flex;
    }
    .coa-btn-dropdown-group .coa-btn-group-item {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }
    .coa-btn-caret {
      background: #f4f4f4;
      border: 1px solid #dcdcdc;
      border-left: none;
      padding: 6px 10px;
      font-size: 11px;
      border-top-right-radius: 3px;
      border-bottom-right-radius: 3px;
      cursor: pointer;
      color: #555;
    }
    .coa-filter-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 22px;
      flex-wrap: wrap;
    }
    .coa-filter-label {
      font-weight: 700;
      font-size: 13px;
      color: #333333;
    }
    .coa-date-input {
      padding: 5px 10px;
      border: 1px solid #ccc;
      border-radius: 3px;
      font-size: 13px;
      width: 140px;
    }
    .coa-btn-set {
      background: #f4f4f4;
      border: 1px solid #ccc;
      padding: 5px 12px;
      font-size: 13px;
      border-radius: 3px;
      cursor: pointer;
    }
    .coa-btn-set:hover {
      background: #e8e8e8;
    }
    .coa-table-controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      font-size: 13px;
      color: #333333;
      flex-wrap: wrap;
      gap: 8px;
    }
    .coa-entries-select {
      padding: 4px 8px;
      border: 1px solid #ccc;
      border-radius: 3px;
      margin: 0 4px;
    }
    .coa-search-input {
      padding: 4px 8px;
      border: 1px solid #ccc;
      border-radius: 3px;
      margin-left: 6px;
      outline: none;
    }
    .coa-search-input:focus {
      border-color: #66afff;
    }
    .coa-grid-wrapper {
      width: 100%;
      overflow-x: auto;
    }
    .coa-data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      text-align: left;
    }
    .coa-data-table th {
      padding: 10px 12px;
      border-bottom: 2px solid #ddd;
      font-weight: 700;
      color: #333333;
      white-space: nowrap;
    }
    .coa-col-sortable {
      cursor: pointer;
      user-select: none;
    }
    .coa-sort-icon {
      font-size: 11px;
      margin-left: 6px;
      color: #aaa;
    }
    .coa-sort-icon.active {
      color: #337ab7;
    }
    .coa-data-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #eee;
      color: #555555;
      white-space: nowrap;
    }
    .coa-row-item:hover {
      background-color: #f9f9f9;
    }
    .coa-cell-code {
      color: #337ab7;
      font-weight: 500;
    }
    .coa-cell-balance {
      color: #337ab7;
      font-weight: 600;
    }
    .coa-btn-icon {
      background: transparent;
      border: none;
      color: #337ab7;
      cursor: pointer;
      font-size: 14px;
      padding: 4px 6px;
      border-radius: 6px;
    }
    .coa-btn-icon:hover {
      background: #eef4fb;
    }
    .coa-btn-icon-danger {
      color: #d9534f;
    }
    .coa-btn-icon-danger:hover {
      background: #fdeeee;
    }
    .coa-empty-cell {
      text-align: center;
      padding: 30px !important;
      color: #999;
    }
    .coa-range-label {
      font-size: 12px;
      color: #888;
      margin-top: 10px;
      text-align: right;
    }
    .text-right {
      text-align: right;
    }
    .text-center {
      text-align: center;
    }

    @media print {
      .ac-tabs-container, .ac-kpi-bar, .ac-header-actions, .ac-search-wrapper { display: none !important; }
      .ac-card { box-shadow: none; border: none; }
    }
  `;
  document.head.appendChild(style);
}