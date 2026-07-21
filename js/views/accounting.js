import { api } from "../api.js";
import { el, mount, formatMoney, titleCase, dataTable, openModal, showToast } from "../utils.js";

let active = "trial-balance";
let accountSearchQuery = "";
let vendorSearchQuery = "";
let entriesPerPage = 10;
let postingDateFilter = "31/12/2021";

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
  file: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`
};

function createIconSpan(svgString) {
  const span = el("span", { class: "ac-btn-icon-wrapper" });
  span.innerHTML = svgString;
  return span;
}

export async function renderAccounting(root) {
  injectGlobalStylesOnce();

  const tabs = el("div", { class: "ac-tabs-container" }, [
    tabButton("trial-balance", "Trial Balance", ICONS.trialBalance, root),
    tabButton("accounts", "Chart of Accounts", ICONS.chart, root),
    tabButton("journal", "Journal Entry", ICONS.journal, root),
    tabButton("dividends", "Dividends", ICONS.dividends, root),
    tabButton("vendors", "Vendors", ICONS.vendors, root),
    tabButton("gl-settings", "GL Settings", ICONS.settings, root)
  ]);

  const content = el("div", { class: "ac-tab-content-wrapper" });
  mount(root, [tabs, content]);
  await renderTabContent(content, root);
}

function tabButton(key, label, iconSvg, root) {
  const btn = el("button", { 
    class: `ac-tab-btn ${active === key ? "active" : ""}`, 
    onclick: async (e) => { 
      if (active === key) return;
      active = key; 
      
      const parent = e.currentTarget.parentNode;
      if (parent) {
        parent.querySelectorAll(".ac-tab-btn").forEach(b => b.classList.remove("active"));
      }
      e.currentTarget.classList.add("active");

      const contentWrapper = root.querySelector(".ac-tab-content-wrapper");
      if (contentWrapper) {
        await renderTabContent(contentWrapper, root);
      }
    } 
  });
  btn.innerHTML = `${iconSvg} <span>${label}</span>`;
  return btn;
}

async function renderTabContent(content, root) {
  mount(content, [el("div", { class: "ac-spinner-container" }, [el("div", { class: "ac-spinner" })])]);
  
  try {
    if (active === "accounts") await renderAccountsTab(content, root);
    else if (active === "journal") await renderJournalTab(content, root);
    else if (active === "dividends") await renderDividendsTab(content, root);
    else if (active === "vendors") await renderVendorsTab(content, root);
    else if (active === "gl-settings") await renderGlSettingsTab(content, root);
    else await renderTrialBalanceTab(content);
  } catch (err) {
    mount(content, [el("div", { class: "ac-card ac-empty-state ac-fade-in" }, [
      el("h4", { style: "color: var(--rose-600);" }, "Error Loading Ledger Data"),
      el("p", { class: "muted" }, err.message || "An unexpected error occurred.")
    ])]);
  }
}

// --- 1. Trial Balance Tab ---
async function renderTrialBalanceTab(content) {
  const lines = await api.get("/api/v1/accounting/trial-balance");
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);

  const table = dataTable(
    [
      { header: "Account Code", render: (l) => el("span", { class: "ac-code-badge" }, l.account_code) },
      { header: "Account Name", render: (l) => el("span", { style: "font-weight: 500; color: var(--pine-900);" }, l.account_name) },
      { header: "Debit", className: "ledger", render: (l) => Number(l.debit) > 0 ? `UGX ${formatMoney(l.debit)}` : el("span", { class: "muted" }, "—") },
      { header: "Credit", className: "ledger", render: (l) => Number(l.credit) > 0 ? `UGX ${formatMoney(l.credit)}` : el("span", { class: "muted" }, "—") },
    ],
    lines, "No posted journal activity yet."
  );

  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  mount(content, [el("div", { class: "ac-card ac-fade-in" }, [
    el("div", { class: "ac-card-header" }, [
      el("div", {}, [
        el("h3", {}, "Trial Balance"),
        el("p", { class: "muted small" }, "Double-entry validation ledger summary")
      ]),
      el("span", { class: `ac-status-badge ${isBalanced ? "success" : "warning"}` }, 
        isBalanced ? "✓ Ledger Balanced" : "⚠ Ledger Unbalanced"
      )
    ]),
    table,
    el("div", { class: "ac-summary-footer" }, [
      el("span", {}, `Total Debit: UGX ${formatMoney(totalDebit)}`),
      el("span", {}, `Total Credit: UGX ${formatMoney(totalCredit)}`),
    ]),
  ])]);
}

// --- 2. Chart of Accounts ---
async function renderAccountsTab(content, root) {
  let accounts = [];
  try {
    accounts = await api.get("/api/v1/accounting/accounts");
  } catch (e) {
    accounts = [];
  }

  // --- Button Action Bar ---
  const actionBar = el("div", { class: "coa-action-bar" }, [
    el("button", { 
      class: "coa-btn-group-item coa-btn-new", 
      onclick: () => openAccountModal(content, root) 
    }, [createIconSpan(ICONS.file), el("span", {}, "New")]),
    
    el("div", { class: "coa-btn-dropdown-group" }, [
      el("button", { class: "coa-btn-group-item" }, "Trial Balance"),
      el("button", { class: "coa-btn-caret" }, "▾")
    ]),

    el("div", { class: "coa-btn-dropdown-group" }, [
      el("button", { class: "coa-btn-group-item" }, "Detailed Trial Balance"),
      el("button", { class: "coa-btn-caret" }, "▾")
    ])
  ]);

  // --- Posting Date Filter Bar ---
  const postingDateInput = el("input", { 
    type: "text", 
    class: "coa-date-input", 
    value: postingDateFilter 
  });

  const filterBar = el("div", { class: "coa-filter-bar" }, [
    el("label", { class: "coa-filter-label" }, "Posting Date Filter"),
    postingDateInput,
    el("button", { 
      class: "coa-btn-set",
      onclick: () => {
        postingDateFilter = postingDateInput.value;
        showToast(`Date filter updated: ${postingDateFilter}`, "info");
      }
    }, "Set")
  ]);

  // --- Table Controls (Show entries + Search) ---
  const entriesSelect = el("select", { 
    class: "coa-entries-select",
    onchange: (e) => {
      entriesPerPage = parseInt(e.target.value);
      renderGrid();
    }
  }, [
    el("option", { value: "10", selected: entriesPerPage === 10 }, "10"),
    el("option", { value: "25", selected: entriesPerPage === 25 }, "25"),
    el("option", { value: "50", selected: entriesPerPage === 50 }, "50"),
    el("option", { value: "100", selected: entriesPerPage === 100 }, "100")
  ]);

  const searchInput = el("input", { 
    class: "coa-search-input", 
    type: "text",
    value: accountSearchQuery,
    oninput: (e) => {
      accountSearchQuery = e.target.value;
      renderGrid();
    }
  });

  const tableControls = el("div", { class: "coa-table-controls" }, [
    el("div", { class: "coa-show-entries" }, [
      el("span", {}, "Show "),
      entriesSelect,
      el("span", {}, " entries")
    ]),
    el("div", { class: "coa-search-group" }, [
      el("span", {}, "Search: "),
      searchInput
    ])
  ]);

  const gridHolder = el("div", { class: "coa-grid-wrapper ac-fade-in" });

  async function handleDelete(accountId) {
    if (confirm("Are you sure you want to delete this account?")) {
      try {
        await api.delete(`/api/v1/accounting/accounts/${accountId}`);
        showToast("Account deleted.", "success");
        await renderAccountsTab(content, root);
      } catch (err) {
        showToast(err.message || "Failed to delete account.", "error");
      }
    }
  }

  function renderGrid() {
    const query = accountSearchQuery.toLowerCase().trim();
    const filtered = accounts.filter(a => 
      (a.code && a.code.toLowerCase().includes(query)) || 
      (a.name && a.name.toLowerCase().includes(query)) ||
      (a.category && a.category.toLowerCase().includes(query)) ||
      (a.subcategory && a.subcategory.toLowerCase().includes(query))
    );

    const paginated = filtered.slice(0, entriesPerPage);

    const table = el("table", { class: "coa-data-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", { class: "coa-col-sortable" }, ["No.", el("span", { class: "coa-sort-icon" }, "⇅")]),
          el("th", { class: "coa-col-sortable" }, ["Name", el("span", { class: "coa-sort-icon" }, "⇅")]),
          el("th", { class: "coa-col-sortable" }, ["Income/Balance", el("span", { class: "coa-sort-icon" }, "⇅")]),
          el("th", { class: "coa-col-sortable" }, ["Account Category", el("span", { class: "coa-sort-icon" }, "⇅")]),
          el("th", { class: "coa-col-sortable" }, ["Account Subcategory", el("span", { class: "coa-sort-icon" }, "⇅")]),
          el("th", { class: "coa-col-sortable" }, ["Account Type", el("span", { class: "coa-sort-icon" }, "⇅")]),
          el("th", { class: "coa-col-sortable text-right" }, ["Balance", el("span", { class: "coa-sort-icon" }, "⇅")]),
          el("th", { style: "width: 40px;" }, "")
        ])
      ]),
      el("tbody", {}, 
        paginated.length > 0 
          ? paginated.map(a => {
              const balanceVal = Number(a.balance || 0);
              return el("tr", { class: "coa-row-item" }, [
                el("td", { class: "coa-cell-code" }, a.code || "—"),
                el("td", { class: "coa-cell-name" }, a.name || "—"),
                el("td", {}, a.income_balance || "Balance Sheet"),
                el("td", {}, a.category || titleCase(a.account_type || "Assets")),
                el("td", {}, a.subcategory || "Current Assets"),
                el("td", {}, a.type || "Posting"),
                el("td", { class: "coa-cell-balance text-right" }, formatMoney(balanceVal)),
                el("td", { class: "text-center" }, [
                  el("button", { 
                    class: "coa-btn-delete", 
                    title: "Delete Account",
                    onclick: () => handleDelete(a.id)
                  }, "🗑")
                ])
              ]);
            })
          : [el("tr", {}, [el("td", { colspan: "8", class: "coa-empty-cell" }, "No matching chart of accounts found.")])]
      )
    ]);

    mount(gridHolder, [table]);
  }

  renderGrid();

  mount(content, [
    el("div", { class: "coa-container" }, [
      actionBar,
      filterBar,
      tableControls,
      gridHolder
    ])
  ]);
}

function openAccountModal(content, root) {
  openModal("New Chart of Account", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    
    const form = el("form", { class: "ac-form" }, [
      el("div", { class: "field-row" }, [
        el("div", { class: "ac-field" }, [el("label", {}, "Account No. / Code"), el("input", { id: "coa-code", placeholder: "e.g. 1200", required: true })]),
        el("div", { class: "ac-field" }, [el("label", {}, "Account Name"), el("input", { id: "coa-name", placeholder: "e.g. Petty Cash", required: true })])
      ]),
      el("div", { class: "field-row" }, [
        el("div", { class: "ac-field" }, [
          el("label", {}, "Income / Balance"),
          el("select", { id: "coa-income-balance" }, [
            el("option", { value: "Balance Sheet" }, "Balance Sheet"),
            el("option", { value: "Income Statement" }, "Income Statement")
          ])
        ]),
        el("div", { class: "ac-field" }, [
          el("label", {}, "Account Category"),
          el("select", { id: "coa-category" }, [
            el("option", { value: "Assets" }, "Assets"),
            el("option", { value: "Liabilities" }, "Liabilities"),
            el("option", { value: "Equity" }, "Equity"),
            el("option", { value: "Income" }, "Income"),
            el("option", { value: "Expenses" }, "Expenses")
          ])
        ])
      ]),
      el("div", { class: "field-row" }, [
        el("div", { class: "ac-field" }, [
          el("label", {}, "Account Subcategory"),
          el("input", { id: "coa-subcategory", placeholder: "e.g. Current Assets, Equity...", defaultValue: "Current Assets" })
        ]),
        el("div", { class: "ac-field" }, [
          el("label", {}, "Account Type"),
          el("select", { id: "coa-type" }, [
            el("option", { value: "Posting" }, "Posting"),
            el("option", { value: "Heading" }, "Heading"),
            el("option", { value: "Total" }, "Total")
          ])
        ])
      ]),
      el("div", { class: "ac-field" }, [
        el("label", {}, "Opening Balance (UGX)"),
        el("input", { id: "coa-balance", type: "number", step: "0.01", defaultValue: "0.00" })
      ]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Create Account"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        const payload = {
          code: form.querySelector("#coa-code").value,
          name: form.querySelector("#coa-name").value,
          income_balance: form.querySelector("#coa-income-balance").value,
          category: form.querySelector("#coa-category").value,
          account_type: form.querySelector("#coa-category").value.toLowerCase(),
          subcategory: form.querySelector("#coa-subcategory").value,
          type: form.querySelector("#coa-type").value,
          balance: Number(form.querySelector("#coa-balance").value || 0)
        };

        await api.post("/api/v1/accounting/accounts", payload);
        showToast("Account created successfully.", "success");
        await renderTabContent(content, root);
        closeFn();
      } catch (err) {
        errorEl.textContent = err.message || "Failed to create account.";
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

// --- 3. Modern Journal Entry Builder ---
async function renderJournalTab(content, root) {
  const accounts = await api.get("/api/v1/accounting/accounts");
  if (!accounts.length) {
    mount(content, [el("div", { class: "ac-card ac-empty-state ac-fade-in" }, [
      el("h4", {}, "No Chart of Accounts yet"),
      el("p", { class: "muted" }, "Create at least two accounts on the Chart of Accounts tab first."),
    ])]);
    return;
  }

  const linesHolder = el("div", { class: "ac-je-lines-container" });
  const narrativeInput = el("input", { id: "je-narrative", placeholder: "Explain this transaction..." });
  const errorEl = el("p", { class: "form-error", hidden: true });
  const balanceIndicator = el("div", { class: "ac-je-balance-bar" });

  function accountOptions() {
    return accounts.map((a) => el("option", { value: a.id }, `${a.code} — ${a.name}`));
  }

  function addLine() {
    const row = el("div", { class: "ac-je-row ac-slide-up" }, [
      el("div", { style: "flex: 2;" }, [
        el("select", { class: "je-account ac-input" }, accountOptions())
      ]),
      el("div", { style: "flex: 1;" }, [
        el("input", { class: "je-debit ac-input", type: "number", placeholder: "Debit Amount", step: "0.01", oninput: updateBalance })
      ]),
      el("div", { style: "flex: 1;" }, [
        el("input", { class: "je-credit ac-input", type: "number", placeholder: "Credit Amount", step: "0.01", oninput: updateBalance })
      ]),
      el("button", { 
        type: "button", 
        class: "ac-btn-icon-danger", 
        onclick: () => { 
          row.style.opacity = 0;
          row.style.transform = "scale(0.95)";
          setTimeout(() => {
            row.remove(); 
            updateBalance(); 
          }, 150);
        } 
      }, []),
    ]);
    row.querySelector(".ac-btn-icon-danger").innerHTML = ICONS.trash;
    linesHolder.appendChild(row);
    updateBalance();
  }

  function updateBalance() {
    const rows = [...linesHolder.children];
    let debit = 0, credit = 0;
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
    el("div", { class: "ac-field" }, [el("label", {}, "Narrative / Memorandum Description"), narrativeInput]),
    el("div", { class: "ac-field" }, [
      el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;" }, [
        el("label", { style: "margin: 0;" }, "Transaction Split Lines"),
        el("button", { type: "button", class: "ac-btn-secondary btn-sm", onclick: addLine }, "+ Add Split Line")
      ]),
      linesHolder,
    ]),
    balanceIndicator,
    errorEl,
    el("div", { class: "modal-actions", style: "justify-content: flex-start; margin-top: 24px;" }, [
      el("button", { type: "submit", class: "ac-btn-primary" }, "Post Journal Entry"),
    ]),
  ]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const rows = [...linesHolder.children];
    const lines = rows.map((r) => ({
      account_id: r.querySelector(".je-account").value,
      debit: Number(r.querySelector(".je-debit").value || 0),
      credit: Number(r.querySelector(".je-credit").value || 0),
    })).filter((l) => l.debit > 0 || l.credit > 0);

    try {
      await api.post("/api/v1/accounting/journal-entries", { narrative: narrativeInput.value || null, lines });
      showToast("Journal entry successfully posted.", "success");
      active = "trial-balance";
      
      const tabbar = root.querySelector(".ac-tabs-container");
      if (tabbar) {
        tabbar.querySelectorAll(".ac-tab-btn").forEach(btn => btn.classList.remove("active"));
        const targetBtn = tabbar.querySelector("button[onclick*='trial-balance']");
        if (targetBtn) targetBtn.classList.add("active");
      }
      
      await renderTabContent(content, root);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  mount(content, [el("div", { class: "ac-card ac-fade-in" }, [
    el("div", { class: "ac-card-header" }, [
      el("div", {}, [
        el("h3", {}, "New Journal Entry"),
        el("p", { class: "muted small" }, "Post manual balanced Double-Entry Ledger adjustments")
      ])
    ]),
    form
  ])]);
}

// --- 4. Dividend Calculator ---
async function renderDividendsTab(content, root) {
  const errorEl = el("p", { class: "form-error", hidden: true });
  const resultHolder = el("div", { class: "ac-slide-up", style: "margin-top:20px" });

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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    try {
      const result = await api.post("/api/v1/shares/dividends/declare", {
        financial_year: yearInput.value,
        rate_per_share: Number(rateInput.value),
      });
      showToast("Dividends successfully computed and distributed.", "success");
      mount(resultHolder, [el("div", { class: "ac-card success", style: "border-left: 4px solid var(--emerald-500);" }, [
        el("h3", { style: "color: var(--emerald-800);" }, "✓ Calculation Complete"),
        el("p", { class: "muted small" }, `Calculations processed based on financial year ${yearInput.value}:`),
        infoRow("Total Disbursed Sum", `UGX ${formatMoney(result.total_amount)}`),
        infoRow("Member Accounts Paid", `${result.members_paid} accounts`),
        infoRow("Rate Applied", `UGX ${rateInput.value} per unit`)
      ])]);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  mount(content, [
    el("div", { class: "ac-card ac-fade-in" }, [
      el("div", { class: "ac-card-header" }, [
        el("div", {}, [
          el("h3", {}, "Calculate & Disburse Dividends"),
          el("p", { class: "muted small" }, "Automatically credit member ledger weightings.")
        ])
      ]),
      form,
    ]),
    resultHolder,
  ]);
}

function infoRow(label, val) {
  return el("div", { class: "ac-info-row" }, [
    el("span", { class: "muted" }, label),
    el("span", { style: "font-weight: 600; color: var(--pine-900);" }, val)
  ]);
}

// --- 5. Vendor & Supplies Manager ---
async function renderVendorsTab(content, root) {
  let vendors = JSON.parse(localStorage.getItem("sacco_vendors") || "[]");
  if (!vendors.length) {
    vendors = [
      { id: "1", name: "Umeme Utilities Ltd", contact: "Billing Desk", phone: "0800185185", email: "billing@umeme.co.ug" },
      { id: "2", name: "National Water & Sewerage Corp", contact: "NWSC Help", phone: "0800300900", email: "info@nwsc.co.ug" }
    ];
    localStorage.setItem("sacco_vendors", JSON.stringify(vendors));
  }

  const accounts = await api.get("/api/v1/accounting/accounts").catch(() => []);

  const searchInput = el("input", { 
    class: "ac-search-input", 
    placeholder: "Search vendors by name...", 
    value: vendorSearchQuery,
    oninput: (e) => {
      vendorSearchQuery = e.target.value;
      renderVendorList();
    }
  });

  const searchIconSpan = el("span", { class: "ac-search-icon" });
  searchIconSpan.innerHTML = ICONS.search;

  const header = el("div", { class: "ac-card-header-row" }, [
    el("div", { class: "ac-search-wrapper" }, [
      searchIconSpan,
      searchInput
    ]),
    el("button", { 
      class: "ac-btn-primary", 
      onclick: () => openVendorModal(content, root) 
    }, [createIconSpan(ICONS.plus), el("span", {}, "Register Vendor")]),
  ]);

  const tableWrapper = el("div", { class: "ac-fade-in" });

  function renderVendorList() {
    const query = vendorSearchQuery.toLowerCase().trim();
    const filteredVendors = vendors.filter(v => 
      v.name.toLowerCase().includes(query) || 
      v.contact.toLowerCase().includes(query)
    );

    const table = dataTable(
      [
        { header: "Vendor Name", render: (v) => el("span", { style: "font-weight: 600; color: var(--pine-900);" }, v.name) },
        { header: "Contact Person", render: (v) => v.contact },
        { header: "Phone", render: (v) => v.phone },
        { header: "Email", render: (v) => el("span", { class: "muted small" }, v.email) },
        {
          header: "",
          render: (v) => el("button", { 
            class: "ac-btn-secondary btn-sm", 
            onclick: () => payVendorBillModal(v, accounts) 
          }, "Pay Invoice")
        }
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

function openVendorModal(content, root) {
  openModal("Register New Vendor", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const nameInput = el("input", { placeholder: "Company Name", required: true });
    const contactInput = el("input", { placeholder: "Primary Contact Account Manager" });
    const phoneInput = el("input", { placeholder: "+256..." });
    const emailInput = el("input", { type: "email", placeholder: "billing@company.com" });

    const form = el("form", { class: "ac-form" }, [
      el("div", { class: "ac-field" }, [el("label", {}, "Vendor / Supplier Name"), nameInput]),
      el("div", { class: "field-row" }, [
        el("div", { class: "ac-field" }, [el("label", {}, "Contact Person"), contactInput]),
        el("div", { class: "ac-field" }, [el("label", {}, "Phone Number"), phoneInput])
      ]),
      el("div", { class: "ac-field" }, [el("label", {}, "Email Address"), emailInput]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Register Vendor")
      ])
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const list = JSON.parse(localStorage.getItem("sacco_vendors") || "[]");
      list.push({
        id: Date.now().toString(),
        name: nameInput.value,
        contact: contactInput.value || "—",
        phone: phoneInput.value || "—",
        email: emailInput.value || "—"
      });
      localStorage.setItem("sacco_vendors", JSON.stringify(list));
      showToast("Vendor successfully registered.", "success");
      
      await renderVendorsTab(content, root);
      closeFn();
    });

    return [form];
  });
}

function payVendorBillModal(vendor, accounts) {
  openModal(`Payout Invoice — ${vendor.name}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const amountInput = el("input", { type: "number", required: true, min: "1", placeholder: "UGX Amount" });
    const invoiceInput = el("input", { placeholder: "Invoice identifier string" });

    const assetAccounts = (accounts || []).filter(
      a => a.account_type && a.account_type.toLowerCase() === "asset"
    );
    const expenseAccounts = (accounts || []).filter(
      a => a.account_type && a.account_type.toLowerCase() === "expense"
    );

    if (assetAccounts.length === 0 || expenseAccounts.length === 0) {
      return [
        el("div", { class: "ac-card ac-empty-state" }, [
          el("p", { style: "color: var(--rose-600); font-weight: 600;" }, "Configuration Error"),
          el("p", { class: "muted small" }, "You must register at least one Asset account and one Expense account in your Chart of Accounts first."),
          el("button", { type: "button", class: "btn btn-secondary", style: "margin-top: 10px;", onclick: closeFn }, "Close")
        ])
      ];
    }

    const assetSelect = el("select", { class: "ac-input" }, assetAccounts.map(a => el("option", { value: a.id }, `${a.code} — ${a.name}`)));
    const expenseSelect = el("select", { class: "ac-input" }, expenseAccounts.map(a => el("option", { value: a.id }, `${a.code} — ${a.name}`)));

    const form = el("form", { class: "ac-form" }, [
      el("div", { class: "field-row" }, [
        el("div", { class: "ac-field" }, [el("label", {}, "Expense Account (Dr.)"), expenseSelect]),
        el("div", { class: "ac-field" }, [el("label", {}, "Asset/Clearing Account (Cr.)"), assetSelect])
      ]),
      el("div", { class: "field-row" }, [
        el("div", { class: "ac-field" }, [el("label", {}, "Amount"), amountInput]),
        el("div", { class: "ac-field" }, [el("label", {}, "Invoice / Bill Number"), invoiceInput])
      ]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Post Payment Ledger")
      ])
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;

      if (!expenseSelect.value || !assetSelect.value) {
        errorEl.textContent = "Please select both an Expense and an Asset account.";
        errorEl.hidden = false;
        return;
      }
      // Submit logic here...
    });

    return [form];
  });
}