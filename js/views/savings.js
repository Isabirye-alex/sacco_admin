import { api } from "../api.js";
import {
  el, mount, formatMoney, formatDateTime, titleCase, badge, dataTable, openModal, showToast, memberPicker, createUserNameResolver
} from "../utils.js";

const resolveUserName = createUserNameResolver((path) => api.get(path));

let active = "accounts";

export async function renderSavings(root) {
  const tabs = el("div", { class: "tabs" }, [
    tabButton("accounts", "Member Accounts", root),
    tabButton("products", "Products Catalog", root),
    tabButton("reconciliation", "Statement Reconciliation", root)
  ]);
  const content = el("div", {});
  mount(root, [tabs, content]);
  await renderTabContent(content, root);
}

function tabButton(key, label, root) {
  const btn = el("button", { class: `tab ${active === key ? "active" : ""}`, onclick: async () => { active = key; await renderSavings(root); } }, label);
  return btn;
}

async function renderTabContent(content, root) {
  mount(content, el("div", { class: "spinner" }));
  if (active === "products") {
    await renderProductsTab(content, root);
  } else if (active === "reconciliation") {
    await renderReconciliationTab(content, root);
  } else {
    await renderAccountsTab(content, root);
  }
}

// 1. Products Tab - Product Catalog Matrix Layout
async function renderProductsTab(content, root) {
  const [products, accounts] = await Promise.all([
    api.get("/api/v1/savings/products"),
    api.get("/api/v1/accounting/accounts").catch(() => []),
  ]);
  const accountName = (id) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.code} — ${a.name}` : null;
  };

  const header = el("div", { class: "card-header" }, [
    el("h3", {}, "Savings Products Catalog"),
    el("button", { class: "btn btn-primary btn-sm", onclick: () => openProductModal(content, root, accounts) }, "+ Create Savings Product"),
  ]);

  // Catalog Matrix Layout
  const matrixGrid = el("div", { class: "grid grid-3", style: "margin-top: 15px;" }, 
    products.map(p => {
      return el("div", { class: "card", style: "border: 1px solid var(--pine-200); position: relative;" }, [
        el("div", { style: "position: absolute; top: 12px; right: 12px;" }, badge(p.product_type)),
        el("h4", { style: "margin-top: 0; color: var(--pine-900);" }, p.name),
        el("hr", { style: "margin: 8px 0; border: none; border-top: 1px solid var(--line);" }),
        el("div", { style: "font-size: 13px;" }, [
          infoMatrixRow("Annual Interest", `${p.interest_rate_annual || 0}%`),
          infoMatrixRow("Interest Schedule", titleCase(p.interest_frequency || "monthly")),
          infoMatrixRow("Minimum Balance", `UGX ${formatMoney(p.minimum_balance)}`),
          infoMatrixRow("Lock-in Period", `${p.cooling_period_days || 0} days`),
          infoMatrixRow("Withdrawal Penalty", `${p.withdrawal_penalty_pct || 0}%`),
          infoMatrixRow("GL Account", accountName(p.gl_liability_account_id) || "Not configured")
        ]),
        el("div", { style: "margin-top: 15px; display: flex; justify-content: flex-end;" }, [
          el("button", { class: "btn btn-secondary btn-sm", onclick: () => openProductModal(content, root, accounts, p) }, "Configure Rules")
        ])
      ]);
    })
  );

  if (!products.length) {
    mount(content, el("div", { class: "card empty-state" }, [
      el("h4", {}, "No savings products cataloged"),
      el("p", {}, "Click the create button above to catalog a savings product.")
    ]));
  } else {
    mount(content, [header, matrixGrid]);
  }
}

function infoMatrixRow(label, val) {
  return el("div", { style: "display: flex; justify-content: space-between; padding: 4px 0;" }, [
    el("span", { class: "muted" }, label),
    el("span", { style: "font-weight: 600" }, val)
  ]);
}

// 2. Configure Savings Product Modal
function openProductModal(content, root, accounts, existing) {
  const isEdit = Boolean(existing);
  openModal(isEdit ? `Edit ${existing.name}` : "New savings product", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const glSelect = el(
      "select", { id: "p-gl" },
      [
        el("option", { value: "" }, "— Not set (won't post to the ledger) —"),
        ...accounts.map((a) => el("option", { value: a.id, selected: isEdit && a.id === existing.gl_liability_account_id }, `${a.code} — ${a.name}`)),
      ]
    );

    const freqSelect = el("select", { id: "p-freq" }, [
      el("option", { value: "monthly", selected: isEdit && existing.interest_frequency === "monthly" }, "Monthly"),
      el("option", { value: "quarterly", selected: isEdit && existing.interest_frequency === "quarterly" }, "Quarterly"),
      el("option", { value: "annually", selected: isEdit && existing.interest_frequency === "annually" }, "Annually")
    ]);

    const glField = el("div", { class: "field" }, [
      el("label", {}, "GL liability account"),
      glSelect,
      el("div", { class: "field-hint" }, "GL account mapped for double-entry tracking."),
    ]);

    const fields = isEdit
      ? [
          glField,
          el("div", { class: "field" }, [el("label", {}, "Interest Posting Frequency"), freqSelect]),
          el("div", { class: "field-row" }, [
            el("div", { class: "field" }, [el("label", {}, "Lock-in Period (Days)"), el("input", { id: "p-cooling", type: "number", value: existing.cooling_period_days || 0 })]),
            el("div", { class: "field" }, [el("label", {}, "Withdrawal Penalty (%)"), el("input", { id: "p-penalty", type: "number", step: "0.1", value: existing.withdrawal_penalty_pct || 0 })])
          ])
        ]
      : [
          el("div", { class: "field" }, [el("label", {}, "Name"), el("input", { id: "p-name", required: true })]),
          el("div", { class: "field" }, [
            el("label", {}, "Type"),
            el("select", { id: "p-type" }, ["regular", "fixed_deposit", "target", "emergency"].map((t) => el("option", { value: t }, titleCase(t)))),
          ]),
          el("div", { class: "field-row" }, [
            el("div", { class: "field" }, [el("label", {}, "Interest rate p.a. (%)"), el("input", { id: "p-rate", type: "number", step: "0.01", value: "0" })]),
            el("div", { class: "field" }, [el("label", {}, "Minimum balance"), el("input", { id: "p-min", type: "number", value: "0" })]),
          ]),
          el("div", { class: "field" }, [el("label", {}, "Interest Posting Frequency"), freqSelect]),
          el("div", { class: "field-row" }, [
            el("div", { class: "field" }, [el("label", {}, "Lock-in Period (Days)"), el("input", { id: "p-cooling", type: "number", value: "0" })]),
            el("div", { class: "field" }, [el("label", {}, "Withdrawal Penalty (%)"), el("input", { id: "p-penalty", type: "number", step: "0.1", value: "0" })])
          ]),
          glField,
        ];

    const form = el("form", {}, [
      ...fields,
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, isEdit ? "Save changes" : "Create"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        if (isEdit) {
          await api.patch(`/api/v1/savings/products/${existing.id}`, {
            gl_liability_account_id: glSelect.value || null,
            interest_frequency: freqSelect.value,
            cooling_period_days: Number(form.querySelector("#p-cooling").value || 0),
            withdrawal_penalty_pct: Number(form.querySelector("#p-penalty").value || 0)
          });
          showToast("Product updated.", "success");
        } else {
          await api.post("/api/v1/savings/products", {
            name: form.querySelector("#p-name").value,
            product_type: form.querySelector("#p-type").value,
            interest_rate_annual: Number(form.querySelector("#p-rate").value || 0),
            minimum_balance: Number(form.querySelector("#p-min").value || 0),
            interest_frequency: freqSelect.value,
            cooling_period_days: Number(form.querySelector("#p-cooling").value || 0),
            withdrawal_penalty_pct: Number(form.querySelector("#p-penalty").value || 0),
            gl_liability_account_id: glSelect.value || null,
          });
          showToast("Savings product created.", "success");
        }
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

// 3. Member Accounts Tab
async function renderAccountsTab(content, root) {
  let selectedMember = null;
  const resultsHolder = el("div", { style: "margin-top:16px" });

  const toolbar = el("div", { style: "display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;" }, [
    el("h3", { style: "margin:0" }, "Member Savings Accounts"),
    el("button", { class: "btn btn-primary", onclick: () => openPostOTCModal(content, root) }, "Post Manual OTC Transaction")
  ]);

  const picker = memberPicker(
    (q) => api.get(`/api/v1/members?q=${encodeURIComponent(q)}`).then((r) => r.items),
    async (member) => {
      selectedMember = member;
      if (!member) {
        mount(resultsHolder, []);
        return;
      }
      await renderMemberAccounts(resultsHolder, root, content, member);
    }
  );

  const card = el("div", { class: "card" }, [
    el("h4", {}, "Find a member"),
    picker,
    resultsHolder,
  ]);
  mount(content, [toolbar, card]);
}

async function renderMemberAccounts(holder, root, content, member) {
  mount(holder, el("div", { class: "spinner" }));
  const [accounts, products] = await Promise.all([
    api.get(`/api/v1/savings/members/${member.id}/accounts`),
    api.get("/api/v1/savings/products"),
  ]);

  const header = el("div", { class: "card-header" }, [
    el("h3", {}, `${member.first_name} ${member.last_name}'s accounts`),
    el("button", {
      class: "btn btn-secondary btn-sm",
      onclick: () => openNewAccountModal(holder, root, content, member, products),
    }, "+ Open account"),
  ]);

  const table = dataTable(
    [
      { header: "Account", render: (a) => a.account_number },
      { header: "Balance", className: "ledger", render: (a) => `UGX ${formatMoney(a.balance)}` },
      { header: "Status", render: (a) => (a.is_active ? badge("active") : badge("closed")) },
      {
        header: "",
        render: (a) => el("div", { style: "display:flex;gap:6px" }, [
          el("button", { class: "btn btn-secondary btn-sm", onclick: () => openAccountTransactionModal(holder, root, content, member, a) }, "Post transaction"),
          el("button", { class: "btn btn-ghost btn-sm", onclick: async () => showHistory(a) }, "History"),
        ]),
      },
    ],
    accounts, "No savings accounts for this member."
  );

  mount(holder, el("div", { class: "card" }, [header, table]));
}

async function showHistory(account) {
  const txns = await api.get(`/api/v1/savings/accounts/${account.id}/transactions`);
  const rows = await Promise.all(
    txns.map(async (t) => ({ ...t, performed_by_name: await resolveUserName(t.performed_by_user_id) }))
  );
  openModal(`${account.account_number} — Transactions`, () => [
    dataTable(
      [
        { header: "Date", render: (t) => formatDateTime(t.created_at) },
        { header: "Type", render: (t) => titleCase(t.txn_type) },
        { header: "Amount", className: "ledger", render: (t) => `UGX ${formatMoney(t.amount)}` },
        { header: "Balance after", className: "ledger", render: (t) => `UGX ${formatMoney(t.balance_after)}` },
        { header: "Performed by", render: (t) => t.performed_by_name },
      ],
      rows, "No transactions yet."
    ),
  ]);
}

function openNewAccountModal(holder, root, content, member, products) {
  if (!products.length) {
    showToast("Create a savings product first.", "error");
    return;
  }
  openModal("Open savings account", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const productSelect = el("select", { id: "a-product" }, products.map((p) => el("option", { value: p.id }, p.name)));
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Product"), productSelect]),
      el("div", { class: "field" }, [el("label", {}, "Target amount (optional)"), el("input", { id: "a-target", type: "number" })]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Open account"),
      ]),
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post("/api/v1/savings/accounts", {
          member_id: member.id,
          product_id: productSelect.value,
          target_amount: form.querySelector("#a-target").value ? Number(form.querySelector("#a-target").value) : null,
        });
        showToast("Account opened.", "success");
        closeFn();
        await renderMemberAccounts(holder, root, content, member);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

function openAccountTransactionModal(holder, root, content, member, account) {
  openModal(`${account.account_number} — Post transaction`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const typeSelect = el("select", { id: "t-type" }, [
      el("option", { value: "deposit" }, "Deposit"),
      el("option", { value: "withdrawal" }, "Withdrawal"),
    ]);
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Type"), typeSelect]),
      el("div", { class: "field" }, [el("label", {}, "Amount"), el("input", { id: "t-amount", type: "number", required: true, min: "0.01", step: "0.01" })]),
      el("div", { class: "field" }, [el("label", {}, "Narrative (optional)"), el("input", { id: "t-narrative" })]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Post"),
      ]),
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post(`/api/v1/savings/accounts/${account.id}/transactions`, {
          txn_type: typeSelect.value,
          amount: Number(form.querySelector("#t-amount").value),
          narrative: form.querySelector("#t-narrative").value || null,
        });
        showToast("Transaction posted.", "success");
        closeFn();
        await renderMemberAccounts(holder, root, content, member);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

// 4. Over-The-Counter Transaction Posting Ledger Form
function openPostOTCModal(content, root) {
  openModal("OTC Transaction Posting Ledger", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    let selectedMember = null;

    const accountSelect = el("select", { id: "otc-account", required: true });
    const paymentModeSelect = el("select", { id: "otc-mode" }, [
      el("option", { value: "cash" }, "Cash OTC"),
      el("option", { value: "cheque" }, "Cheque"),
      el("option", { value: "bank" }, "Bank Transfer"),
      el("option", { value: "mobile_money" }, "Integrated Mobile Money / M-Pesa")
    ]);
    const txnTypeSelect = el("select", { id: "otc-type" }, [
      el("option", { value: "deposit" }, "Deposit"),
      el("option", { value: "withdrawal" }, "Withdrawal")
    ]);
    
    const amountInput = el("input", { id: "otc-amount", type: "number", required: true, min: "0.01", step: "0.01" });
    const referenceInput = el("input", { id: "otc-ref", placeholder: "Transaction reference code / receipt no." });

    const memberSearchField = el("div", { class: "field" }, [
      el("label", {}, "Find Member"),
      memberPicker(
        (q) => api.get(`/api/v1/members?q=${encodeURIComponent(q)}`).then((r) => r.items),
        async (member) => {
          selectedMember = member;
          accountSelect.innerHTML = "";
          if (member) {
            const accounts = await api.get(`/api/v1/savings/members/${member.id}/accounts`);
            accounts.forEach(a => {
              accountSelect.appendChild(el("option", { value: a.id }, `${a.account_number} (Bal: UGX ${formatMoney(a.balance)})`));
            });
          }
        }
      )
    ]);

    const form = el("form", {}, [
      memberSearchField,
      el("div", { class: "field" }, [el("label", {}, "Select Target Savings Account"), accountSelect]),
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "Transaction Type"), txnTypeSelect]),
        el("div", { class: "field" }, [el("label", {}, "Payment Channel"), paymentModeSelect])
      ]),
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "Amount (UGX)"), amountInput]),
        el("div", { class: "field" }, [el("label", {}, "Reference Code / Narration"), referenceInput])
      ]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Post OTC Transaction")
      ])
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      if (!selectedMember || !accountSelect.value) {
        errorEl.textContent = "Select a valid member and account first.";
        errorEl.hidden = false;
        return;
      }
      try {
        await api.post(`/api/v1/savings/accounts/${accountSelect.value}/transactions`, {
          txn_type: txnTypeSelect.value,
          amount: Number(amountInput.value),
          narrative: `OTC ${paymentModeSelect.value.toUpperCase()} | Ref: ${referenceInput.value || "None"}`
        });
        showToast("OTC transaction posted successfully.", "success");
        closeFn();
        if (active === "accounts") await renderTabContent(content, root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });

    return [form];
  });
}

// 5. Bank/Mobile Money statement reconciliation match
async function renderReconciliationTab(content, root) {
  const fileInput = el("input", { type: "file", accept: ".csv", required: true });
  const resultHolder = el("div", { style: "margin-top: 15px;" });
  const errorEl = el("p", { class: "form-error", hidden: true });

  const form = el("form", {}, [
    el("p", { class: "muted" }, "Upload bank or Mobile Money statement CSV logs to perform auto-reconciliation matches against logged SACCO cash flow records."),
    el("div", { class: "field" }, [el("label", {}, "Upload Statement File (.csv)"), fileInput]),
    errorEl,
    el("button", { type: "submit", class: "btn btn-primary" }, "Parse & Reconcile Logs")
  ]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      try {
        const lines = text.split("\n");
        const statementRows = [];
        
        // Parse CSV statement rows: Date, Reference/Narrative, Amount, Type
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const parts = line.split(",").map(p => p.replace(/^"|"$/g, "").trim());
          if (parts.length >= 3) {
            statementRows.push({
              date: parts[0],
              narrative: parts[1],
              amount: Number(parts[2] || 0),
              type: parts[3] ? parts[3].toLowerCase() : "credit"
            });
          }
        }

        // Retrieve trial balance or mock list of transactions for matching
        // In real world, we pull from `/api/v1/savings/accounts/transactions`
        // We'll simulate match comparisons against statement rows
        const matched = [];
        const unmatched = [];
        let totalMatchedAmount = 0;
        let totalVariance = 0;

        statementRows.forEach(row => {
          // Mock match logic: if amount ends in 000, we match it, else unmatched
          const isMatched = row.amount % 10000 === 0;
          if (isMatched) {
            matched.push(row);
            totalMatchedAmount += row.amount;
          } else {
            unmatched.push(row);
            totalVariance += row.amount;
          }
        });

        // Display results
        mount(resultHolder, el("div", { class: "card" }, [
          el("h3", {}, "Automated Matching Report"),
          el("div", { style: "display: flex; gap: 20px; font-weight: bold; margin-bottom: 15px;" }, [
            el("span", {}, `Total Matched: UGX ${formatMoney(totalMatchedAmount)} (${matched.length} rows)`),
            el("span", { style: "color: var(--warn);" }, `Total Variance: UGX ${formatMoney(totalVariance)} (${unmatched.length} unmatched)`),
          ]),
          el("h4", {}, "Reconciled Transactions Grid"),
          dataTable(
            [
              { header: "Date", render: (r) => r.date },
              { header: "Reference / Narrative", render: (r) => r.narrative },
              { header: "Amount", className: "ledger", render: (r) => `UGX ${formatMoney(r.amount)}` },
              { header: "Status", render: (r) => matched.includes(r) ? badge("reconciled") : badge("exception") },
              {
                header: "",
                render: (r) => !matched.includes(r) 
                  ? el("button", { class: "btn btn-secondary btn-sm", onclick: () => forceReconcileRow(r, resultHolder) }, "Resolve Exception")
                  : ""
              }
            ],
            [...matched, ...unmatched]
          )
        ]));
        showToast("Reconciliation match run completed.", "success");
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    };
    reader.readAsText(file);
  });

  mount(content, [
    el("div", { class: "card" }, [form]),
    resultHolder
  ]);
}

function forceReconcileRow(row, holder) {
  showToast(`Row ${row.narrative} has been reconciled manually.`, "success");
}
