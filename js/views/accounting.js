import { api } from "../api.js";
import { el, mount, formatMoney, titleCase, dataTable, openModal, showToast } from "../utils.js";

let active = "trial-balance";

export async function renderAccounting(root) {
  const tabs = el("div", { class: "tabs" }, [
    tabButton("trial-balance", "Trial Balance", root),
    tabButton("accounts", "Chart of Accounts", root),
    tabButton("journal", "New Journal Entry", root),
    tabButton("gl-settings", "GL Settings", root),
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
      { header: "Debit", className: "ledger", render: (l) => formatMoney(l.debit) },
      { header: "Credit", className: "ledger", render: (l) => formatMoney(l.credit) },
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

async function renderAccountsTab(content, root) {
  const accounts = await api.get("/api/v1/accounting/accounts");
  const card = el("div", { class: "card" }, [
    el("div", { class: "card-header" }, [
      el("h3", {}, "Chart of accounts"),
      el("button", { class: "btn btn-primary btn-sm", onclick: () => openAccountModal(content, root) }, "+ New account"),
    ]),
    dataTable(
      [
        { header: "Code", render: (a) => a.code },
        { header: "Name", render: (a) => a.name },
        { header: "Type", render: (a) => titleCase(a.account_type) },
      ],
      accounts, "No accounts defined yet."
    ),
  ]);
  mount(content, card);
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

async function renderJournalTab(content, root) {
  const accounts = await api.get("/api/v1/accounting/accounts");
  if (!accounts.length) {
    mount(content, el("div", { class: "card empty-state" }, [
      el("h4", {}, "No chart of accounts yet"),
      el("p", {}, "Create at least two accounts on the \u201cChart of Accounts\u201d tab before posting a journal entry."),
    ]));
    return;
  }

  const linesHolder = el("div", {});
  const narrativeInput = el("input", { id: "je-narrative" });
  const errorEl = el("p", { class: "form-error", hidden: true });
  const balanceIndicator = el("p", { class: "muted small" });

  function accountOptions() {
    return accounts.map((a) => el("option", { value: a.id }, `${a.code} \u2014 ${a.name}`));
  }

  function addLine() {
    const row = el("div", { class: "je-line-row" }, [
      el("select", { class: "je-account" }, accountOptions()),
      el("input", { class: "je-debit", type: "number", placeholder: "Debit", step: "0.01", oninput: updateBalance }),
      el("input", { class: "je-credit", type: "number", placeholder: "Credit", step: "0.01", oninput: updateBalance }),
      el("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => { row.remove(); updateBalance(); } }, "\u2715"),
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
    balanceIndicator.textContent = `Debit: UGX ${formatMoney(debit)}  \u00b7  Credit: UGX ${formatMoney(credit)}  ${balanced ? "\u2713 Balanced" : "\u2014 Not yet balanced"}`;
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

async function renderGlSettingsTab(content, root) {
  const [settings, accounts] = await Promise.all([
    api.get("/api/v1/accounting/gl-settings"),
    api.get("/api/v1/accounting/accounts"),
  ]);

  if (!accounts.length) {
    mount(content, el("div", { class: "card empty-state" }, [
      el("h4", {}, "No chart of accounts yet"),
      el("p", {}, "Create your cash, mobile money, and interest income accounts on the \u201cChart of Accounts\u201d tab first, then come back here to wire them up."),
    ]));
    return;
  }

  const errorEl = el("p", { class: "form-error", hidden: true });

  function accountSelect(id, currentValue) {
    return el("select", { id }, [
      el("option", { value: "" }, "\u2014 Not configured \u2014"),
      ...accounts.map((a) => el("option", { value: a.id, selected: a.id === currentValue }, `${a.code} \u2014 ${a.name}`)),
    ]);
  }

  const cashSelect = accountSelect("gl-cash", settings.cash_account_id);
  const mmSelect = accountSelect("gl-mm", settings.mobile_money_account_id);
  const interestSelect = accountSelect("gl-interest", settings.interest_income_account_id);

  const form = el("form", {}, [
    el("div", { class: "field" }, [el("label", {}, "Cash / till account"), cashSelect,
      el("div", { class: "field-hint" }, "Used for over-the-counter deposits, withdrawals, and cash loan disbursements/repayments.")]),
    el("div", { class: "field" }, [el("label", {}, "Mobile money clearing account"), mmSelect,
      el("div", { class: "field-hint" }, "Used for any transaction that moved through MarzPay.")]),
    el("div", { class: "field" }, [el("label", {}, "Interest income account"), interestSelect,
      el("div", { class: "field-hint" }, "Where loan interest is recognized as income when a repayment is applied.")]),
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
      el("p", { class: "muted" }, "These are the shared accounts every automatic posting uses on the \u201cother side\u201d of a deposit, withdrawal, disbursement, or repayment. Each savings/loan product also needs its own liability/asset account set on the product itself (Savings \u2192 Products, Loans \u2192 Products)."),
      form,
    ]),
  ]);
}
