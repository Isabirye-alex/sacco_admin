import { api } from "../api.js";
import { el, mount, formatMoney, titleCase, dataTable, openModal, showToast } from "../utils.js";

let active = "trial-balance";

export async function renderAccounting(root) {
  const tabs = el("div", { class: "tabs" }, [
    tabButton("trial-balance", "Trial Balance", root),
    tabButton("accounts", "Chart of Accounts Tree", root),
    tabButton("journal", "New Journal Entry", root),
    tabButton("dividends", "Dividend Calculator", root),
    tabButton("vendors", "Vendor Management", root),
    tabButton("gl-settings", "GL Settings", root)
  ]);
  const content = el("div", {});
  mount(root, [tabs, content]);
  await renderTabContent(content, root);
}

function tabButton(key, label, root) {
  return el("button", { class: `tab ${active === key ? "active" : ""}`, onclick: async () => { active = key; await renderAccounting(root); } }, label);
}

async function renderTabContent(content, root) {
  mount(content, el("div", { class: "spinner" }));
  if (active === "accounts") await renderAccountsTab(content, root);
  else if (active === "journal") await renderJournalTab(content, root);
  else if (active === "dividends") await renderDividendsTab(content, root);
  else if (active === "vendors") await renderVendorsTab(content, root);
  else if (active === "gl-settings") await renderGlSettingsTab(content, root);
  else await renderTrialBalanceTab(content);
}

async function renderTrialBalanceTab(content) {
  const lines = await api.get("/api/v1/accounting/trial-balance");
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);

  const table = dataTable(
    [
      { header: "Code", render: (l) => l.account_code },
      { header: "Account", render: (l) => l.account_name },
      { header: "Debit", className: "ledger", render: (l) => `UGX ${formatMoney(l.debit)}` },
      { header: "Credit", className: "ledger", render: (l) => `UGX ${formatMoney(l.credit)}` },
    ],
    lines, "No posted journal activity yet."
  );

  mount(content, el("div", { class: "card" }, [
    el("h3", {}, "Trial balance"),
    table,
    el("div", { style: "display:flex;justify-content:flex-end;gap:24px;margin-top:14px;font-weight:600" }, [
      el("span", { class: "ledger" }, `Total debit: UGX ${formatMoney(totalDebit)}`),
      el("span", { class: "ledger" }, `Total credit: UGX ${formatMoney(totalCredit)}`),
    ]),
  ]));
}

// 1. Chart of Accounts Tree View
async function renderAccountsTab(content, root) {
  const accounts = await api.get("/api/v1/accounting/accounts");
  
  const header = el("div", { class: "card-header" }, [
    el("h3", {}, "Chart of Accounts Tree View"),
    el("button", { class: "btn btn-primary btn-sm", onclick: () => openAccountModal(content, root) }, "+ New Account"),
  ]);

  // Group accounts by type for tree presentation
  const types = ["asset", "liability", "equity", "income", "expense"];
  const grouped = {};
  types.forEach(t => { grouped[t] = accounts.filter(a => a.account_type === t); });

  const treeContent = el("div", { style: "margin-top: 15px;" }, 
    types.map(t => {
      const children = grouped[t] || [];
      return el("div", { class: "card", style: "margin-bottom: 12px; border-left: 4px solid var(--pine-600);" }, [
        el("div", { style: "font-weight: bold; font-size: 15px; color: var(--pine-900); display: flex; align-items: center; gap: 8px;" }, [
          el("span", {}, "📁"),
          el("span", {}, `${titleCase(t)} Accounts (${children.length})`)
        ]),
        children.length 
          ? el("ul", { style: "list-style: none; padding-left: 20px; margin-top: 8px; margin-bottom: 0;" }, 
              children.map(a => el("li", { style: "padding: 6px 0; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between;" }, [
                el("span", {}, `${a.code} — ${a.name}`),
                el("span", { class: "muted small" }, titleCase(a.account_type))
              ]))
            )
          : el("div", { class: "muted small", style: "padding-left: 20px; margin-top: 5px;" }, "No accounts registered under this classification.")
      ]);
    })
  );

  mount(content, [header, treeContent]);
}

function openAccountModal(content, root) {
  openModal("New chart of account", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Code"), el("input", { id: "coa-code", required: true })]),
      el("div", { class: "field" }, [el("label", {}, "Name"), el("input", { id: "coa-name", required: true })]),
      el("div", { class: "field" }, [
        el("label", {}, "Type"),
        el("select", { id: "coa-type" }, ["asset", "liability", "equity", "income", "expense"].map((t) => el("option", { value: t }, titleCase(t)))),
      ]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Create"),
      ]),
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post("/api/v1/accounting/accounts", {
          code: form.querySelector("#coa-code").value,
          name: form.querySelector("#coa-name").value,
          account_type: form.querySelector("#coa-type").value,
        });
        showToast("Account created.", "success");
        closeFn();
        await renderTabContent(content, root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

// 2. Journal Entry Builder
async function renderJournalTab(content, root) {
  const accounts = await api.get("/api/v1/accounting/accounts");
  if (!accounts.length) {
    mount(content, el("div", { class: "card empty-state" }, [
      el("h4", {}, "No chart of accounts yet"),
      el("p", {}, "Create at least two accounts on the Chart of Accounts tab before posting a journal entry."),
    ]));
    return;
  }

  const linesHolder = el("div", {});
  const narrativeInput = el("input", { id: "je-narrative" });
  const errorEl = el("p", { class: "form-error", hidden: true });
  const balanceIndicator = el("p", { class: "muted small" });

  function accountOptions() {
    return accounts.map((a) => el("option", { value: a.id }, `${a.code} — ${a.name}`));
  }

  function addLine() {
    const row = el("div", { class: "je-line-row", style: "display: flex; gap: 8px; margin-bottom: 8px; align-items: center;" }, [
      el("select", { class: "je-account", style: "flex: 2;" }, accountOptions()),
      el("input", { class: "je-debit", type: "number", placeholder: "Debit", step: "0.01", style: "flex: 1;", oninput: updateBalance }),
      el("input", { class: "je-credit", type: "number", placeholder: "Credit", step: "0.01", style: "flex: 1;", oninput: updateBalance }),
      el("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => { row.remove(); updateBalance(); } }, "✕"),
    ]);
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
    const balanced = debit === credit && debit > 0;
    balanceIndicator.textContent = `Debit: UGX ${formatMoney(debit)}  ·  Credit: UGX ${formatMoney(credit)}  ${balanced ? "✓ Balanced" : "— Not yet balanced"}`;
    balanceIndicator.style.color = balanced ? "var(--pine-700)" : "var(--warn)";
  }

  addLine();
  addLine();

  const form = el("form", {}, [
    el("div", { class: "field" }, [el("label", {}, "Narrative"), narrativeInput]),
    el("div", { class: "field" }, [
      el("label", {}, "Lines"),
      linesHolder,
      el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: addLine }, "+ Add line"),
    ]),
    balanceIndicator,
    errorEl,
    el("div", { class: "modal-actions", style: "justify-content:flex-start" }, [
      el("button", { type: "submit", class: "btn btn-primary" }, "Post journal entry"),
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
      showToast("Journal entry posted.", "success");
      active = "trial-balance";
      await renderAccounting(root);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  mount(content, el("div", { class: "card" }, [el("h3", {}, "New journal entry"), form]));
}

// 3. Calculate Dividends script runner
async function renderDividendsTab(content, root) {
  const errorEl = el("p", { class: "form-error", hidden: true });
  const resultHolder = el("div", { style: "margin-top:16px" });

  const yearInput = el("input", { id: "dv-year", placeholder: "e.g. 2025", required: true });
  const rateInput = el("input", { id: "dv-rate", type: "number", step: "0.0001", required: true });

  const form = el("form", {}, [
    el("div", { class: "field-row" }, [
      el("div", { class: "field" }, [el("label", {}, "Financial year"), yearInput]),
      el("div", { class: "field" }, [el("label", {}, "Dividend Rate (UGX per Share Weight)"), rateInput]),
    ]),
    errorEl,
    el("button", { type: "submit", class: "btn btn-primary" }, "Run Dividend Calculations"),
  ]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    try {
      const result = await api.post("/api/v1/shares/dividends/declare", {
        financial_year: yearInput.value,
        rate_per_share: Number(rateInput.value),
      });
      showToast("Dividends computed and distributed.", "success");
      mount(resultHolder, el("div", { class: "card", style: "border: 1px solid var(--pine-300)" }, [
        el("h3", {}, "Dividend Calculation Summary"),
        el("p", {}, `Calculations processed based on financial year weights:`),
        infoRow("Total Disbursed Sum", `UGX ${formatMoney(result.total_amount)}`),
        infoRow("Member Accounts Paid", `${result.members_paid} accounts`),
        infoRow("Rate Applied", `UGX ${rateInput.value} per share unit`)
      ]));
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  mount(content, [
    el("div", { class: "card" }, [
      el("h3", {}, "Calculate & Disburse Dividends"),
      el("p", { class: "muted" }, "Declare and credit member share accounts automatically based on share ownership weights. Review weights before final submission."),
      form,
    ]),
    resultHolder,
  ]);
}

// Helper info row
function infoRow(label, val) {
  return el("div", { style: "display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--line);" }, [
    el("span", { class: "muted" }, label),
    el("span", { style: "font-weight: 600" }, val)
  ]);
}

// 4. Manage Vendors/Suppliers
async function renderVendorsTab(content, root) {
  // Load vendors from localStorage for state permanence
  let vendors = JSON.parse(localStorage.getItem("sacco_vendors") || "[]");
  if (!vendors.length) {
    vendors = [
      { id: "1", name: "Umeme Utilities Ltd", contact: "Billing Desk", phone: "0800185185", email: "billing@umeme.co.ug" },
      { id: "2", name: "National Water & Sewerage Corp", contact: "NWSC Help", phone: "0800300900", email: "info@nwsc.co.ug" }
    ];
    localStorage.setItem("sacco_vendors", JSON.stringify(vendors));
  }

  const accounts = await api.get("/api/v1/accounting/accounts").catch(() => []);

  const header = el("div", { class: "card-header" }, [
    el("h3", {}, "Vendors & Suppliers Registry"),
    el("button", { class: "btn btn-primary btn-sm", onclick: () => openVendorModal(content, root) }, "+ Register Vendor"),
  ]);

  const table = dataTable(
    [
      { header: "Vendor Name", render: (v) => v.name },
      { header: "Contact Person", render: (v) => v.contact },
      { header: "Phone", render: (v) => v.phone },
      { header: "Email", render: (v) => v.email },
      {
        header: "",
        render: (v) => el("button", { class: "btn btn-secondary btn-sm", onclick: () => payVendorBillModal(v, accounts) }, "Pay Vendor Invoice")
      }
    ],
    vendors
  );

  mount(content, [header, el("div", { class: "card" }, [table])]);
}

function openVendorModal(content, root) {
  openModal("Register New Vendor", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const nameInput = el("input", { required: true });
    const contactInput = el("input");
    const phoneInput = el("input");
    const emailInput = el("input", { type: "email" });

    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Vendor / Supplier Name"), nameInput]),
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "Contact Person"), contactInput]),
        el("div", { class: "field" }, [el("label", {}, "Phone"), phoneInput])
      ]),
      el("div", { class: "field" }, [el("label", {}, "Email Address"), emailInput]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Register Vendor")
      ])
    ]);

    form.addEventListener("submit", (e) => {
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
      showToast("Vendor registered.", "success");
      closeFn();
      renderVendorsTab(content, root);
    });

    return [form];
  });
}

// Post matching double entry journal for vendor bill payout
function payVendorBillModal(vendor, accounts) {
  openModal(`Pay Vendor — ${vendor.name}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const amountInput = el("input", { type: "number", required: true, min: "1", placeholder: "Amount to disburse" });
    const invoiceInput = el("input", { placeholder: "e.g. BILL-UMEME-4821" });

    // Filter cash and expense accounts for simple selection
    const assetAccounts = accounts.filter(a => a.account_type === "asset");
    const expenseAccounts = accounts.filter(a => a.account_type === "expense");

    const assetSelect = el("select", {}, assetAccounts.map(a => el("option", { value: a.id }, `${a.code} — ${a.name}`)));
    const expenseSelect = el("select", {}, expenseAccounts.map(a => el("option", { value: a.id }, `${a.code} — ${a.name}`)));

    const form = el("form", {}, [
      el("p", { class: "muted" }, "Post invoice disbursement directly into the general ledger."),
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "Expense Account (Debit)"), expenseSelect]),
        el("div", { class: "field" }, [el("label", {}, "Asset Account (Credit)"), assetSelect])
      ]),
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "Payment Amount"), amountInput]),
        el("div", { class: "field" }, [el("label", {}, "Invoice / Bill Number"), invoiceInput])
      ]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Post Vendor Payment")
      ])
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      const amt = Number(amountInput.value);
      try {
        await api.post("/api/v1/accounting/journal-entries", {
          narrative: `Vendor Payout to ${vendor.name} (Invoice: ${invoiceInput.value || "OTC"})`,
          lines: [
            { account_id: expenseSelect.value, debit: amt, credit: 0 },
            { account_id: assetSelect.value, debit: 0, credit: amt }
          ]
        });
        showToast("Vendor payment posted to general ledger successfully.", "success");
        closeFn();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });

    return [form];
  });
}

// 5. GL Settings Tab
async function renderGlSettingsTab(content, root) {
  const [settings, accounts] = await Promise.all([
    api.get("/api/v1/accounting/gl-settings"),
    api.get("/api/v1/accounting/accounts"),
  ]);

  if (!accounts.length) {
    mount(content, el("div", { class: "card empty-state" }, [
      el("h4", {}, "No chart of accounts yet"),
      el("p", {}, "Create your cash, mobile money, and interest income accounts first."),
    ]));
    return;
  }

  const errorEl = el("p", { class: "form-error", hidden: true });

  function accountSelect(id, currentValue) {
    return el("select", { id }, [
      el("option", { value: "" }, "— Not configured —"),
      ...accounts.map((a) => el("option", { value: a.id, selected: a.id === currentValue }, `${a.code} — ${a.name}`)),
    ]);
  }

  const cashSelect = accountSelect("gl-cash", settings.cash_account_id);
  const mmSelect = accountSelect("gl-mm", settings.mobile_money_account_id);
  const interestSelect = accountSelect("gl-interest", settings.interest_income_account_id);

  const form = el("form", {}, [
    el("div", { class: "field" }, [el("label", {}, "Cash / till account"), cashSelect]),
    el("div", { class: "field" }, [el("label", {}, "Mobile money clearing account"), mmSelect]),
    el("div", { class: "field" }, [el("label", {}, "Interest income account"), interestSelect]),
    errorEl,
    el("button", { type: "submit", class: "btn btn-primary" }, "Save GL settings"),
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
      showToast("GL settings saved.", "success");
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  mount(content, [
    el("div", { class: "card" }, [
      el("h3", {}, "General ledger settings"),
      form,
    ]),
  ]);
}
