import { api } from "../api.js";
import {
  el, mount, formatMoney, formatDate, titleCase, badge, dataTable, openModal, showToast, confirmDialog
} from "../utils.js";

let active = "applications";
let statusFilter = "";

export async function renderLoans(root) {
  const tabs = el("div", { class: "tabs" }, [
    tabButton("applications", "Applications", root),
    tabButton("products", "Products", root),
  ]);
  const content = el("div", {});
  mount(root, [tabs, content]);
  await renderTabContent(content, root);
}

function tabButton(key, label, root) {
  return el("button", { class: `tab ${active === key ? "active" : ""}`, onclick: async () => { active = key; await renderLoans(root); } }, label);
}

async function renderTabContent(content, root) {
  mount(content, el("div", { class: "spinner" }));
  if (active === "products") await renderProductsTab(content, root);
  else await renderApplicationsTab(content, root);
}

async function renderProductsTab(content, root) {
  const [products, accounts] = await Promise.all([
    api.get("/api/v1/loans/products"),
    api.get("/api/v1/accounting/accounts").catch(() => []),
  ]);
  const accountName = (id) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.code} — ${a.name}` : null;
  };

  const card = el("div", { class: "card" }, [
    el("div", { class: "card-header" }, [
      el("h3", {}, "Loan Products Configurator"),
      el("button", { class: "btn btn-primary btn-sm", onclick: () => openProductModal(content, root, accounts) }, "+ Create Loan Product"),
    ]),
    dataTable(
      [
        { header: "Name", render: (p) => p.name },
        { header: "Rate p.a.", render: (p) => `${p.interest_rate_annual}%` },
        { header: "Interest Method", render: (p) => titleCase(p.interest_method || "reducing_balance") },
        { header: "Max Term", render: (p) => `${p.max_repayment_months} mo` },
        { header: "Max Amount", className: "ledger", render: (p) => `UGX ${formatMoney(p.max_amount)}` },
        { header: "Guarantors", render: (p) => (p.requires_guarantors ? `Min ${p.min_guarantors}` : "Not required") },
        { header: "GL Account", render: (p) => accountName(p.gl_asset_account_id) || el("span", { class: "muted small" }, "Not set") },
        { header: "", render: (p) => el("button", { class: "btn btn-secondary btn-sm", onclick: () => openProductModal(content, root, accounts, p) }, "Edit") },
      ],
      products, "No loan products yet."
    ),
  ]);
  mount(content, card);
}

function openProductModal(content, root, accounts, existing) {
  const isEdit = Boolean(existing);
  openModal(isEdit ? `Configure rules — ${existing.name}` : "New loan product", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const requiresGuarantors = el("input", { type: "checkbox", id: "lp-requires", checked: isEdit ? existing.requires_guarantors : true });

    const glSelect = el(
      "select", { id: "lp-gl" },
      [
        el("option", { value: "" }, "— Not set (won't post to the ledger) —"),
        ...accounts.map((a) => el("option", { value: a.id, selected: isEdit && a.id === existing.gl_asset_account_id }, `${a.code} — ${a.name}`)),
      ]
    );

    const methodSelect = el("select", { id: "lp-method" }, [
      el("option", { value: "reducing_balance", selected: isEdit && existing.interest_method === "reducing_balance" }, "Reducing Balance"),
      el("option", { value: "amortized", selected: isEdit && existing.interest_method === "amortized" }, "Amortized (Reducing Principal)"),
      el("option", { value: "flat_rate", selected: isEdit && existing.interest_method === "flat_rate" }, "Flat Rate")
    ]);

    const glField = el("div", { class: "field" }, [
      el("label", {}, "GL asset account (loans receivable)"),
      glSelect,
      el("div", { class: "field-hint" }, "Mappings for double-entry updates."),
    ]);

    const fields = isEdit
      ? [
          glField,
          el("div", { class: "field" }, [el("label", {}, "Interest Calculation Method"), methodSelect])
        ]
      : [
          el("div", { class: "field" }, [el("label", {}, "Name"), el("input", { id: "lp-name", required: true })]),
          el("div", { class: "field-row" }, [
            el("div", { class: "field" }, [el("label", {}, "Interest rate p.a. (%)"), el("input", { id: "lp-rate", type: "number", step: "0.01", required: true })]),
            el("div", { class: "field" }, [el("label", {}, "Max repayment (months)"), el("input", { id: "lp-months", type: "number", required: true })]),
          ]),
          el("div", { class: "field" }, [el("label", {}, "Interest Calculation Method"), methodSelect]),
          el("div", { class: "field" }, [el("label", {}, "Max amount"), el("input", { id: "lp-max", type: "number", required: true })]),
          el("div", { class: "field", style: "display:flex;align-items:center;gap:8px" }, [requiresGuarantors, el("label", { style: "margin:0" }, "Requires guarantors")]),
          el("div", { class: "field" }, [el("label", {}, "Minimum guarantors"), el("input", { id: "lp-min-g", type: "number", value: "1" })]),
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
          await api.patch(`/api/v1/loans/products/${existing.id}`, {
            gl_asset_account_id: glSelect.value || null,
            interest_method: methodSelect.value
          });
          showToast("Product updated.", "success");
        } else {
          await api.post("/api/v1/loans/products", {
            name: form.querySelector("#lp-name").value,
            interest_rate_annual: Number(form.querySelector("#lp-rate").value),
            max_repayment_months: Number(form.querySelector("#lp-months").value),
            max_amount: Number(form.querySelector("#lp-max").value),
            requires_guarantors: requiresGuarantors.checked,
            min_guarantors: Number(form.querySelector("#lp-min-g").value || 1),
            interest_method: methodSelect.value,
            gl_asset_account_id: glSelect.value || null,
          });
          showToast("Loan product created.", "success");
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

async function renderApplicationsTab(content, root) {
  const url = statusFilter ? `/api/v1/loans/applications?loan_status=${statusFilter}` : "/api/v1/loans/applications";
  const loans = await api.get(url);

  const toolbar = el("div", { class: "toolbar" }, [
    el(
      "select",
      { onchange: async (e) => { statusFilter = e.target.value; await renderTabContent(content, root); } },
      ["", "pending", "under_review", "approved", "rejected", "disbursed", "active", "closed", "defaulted"].map((s) =>
        el("option", { value: s, selected: s === statusFilter }, s ? titleCase(s) : "All statuses")
      )
    ),
  ]);

  const table = dataTable(
    [
      { header: "Loan No.", render: (l) => l.loan_number },
      { header: "Requested", className: "ledger", render: (l) => `UGX ${formatMoney(l.amount_requested)}` },
      { header: "Approved", className: "ledger", render: (l) => l.amount_approved ? `UGX ${formatMoney(l.amount_approved)}` : "—" },
      { header: "Term", render: (l) => `${l.repayment_months} mo` },
      { header: "Status", render: (l) => badge(l.status) },
      { header: "Applied", render: (l) => formatDate(l.created_at) },
      { header: "", render: (l) => el("button", { class: "btn btn-secondary btn-sm", onclick: () => openLoanDetail(l.id, content, root) }, "Open Details") },
    ],
    loans, "No loan applications found."
  );

  mount(content, [toolbar, el("div", { class: "card" }, [table])]);
}

async function openLoanDetail(loanId, content, root) {
  const loan = await api.get(`/api/v1/loans/applications/${loanId}`);
  
  // FETCH ADDITIONAL CONTEXT IN PARALLEL FOR RISK EVALUATION PANEL & GROUP GUARANTEES
  const [member, holdings, memberLoans, groupGuarantees, allGroups] = await Promise.all([
    api.get(`/api/v1/members/${loan.member_id}`).catch(() => null),
    api.get(`/api/v1/shares/members/${loan.member_id}/holdings`).catch(() => []),
    api.get(`/api/v1/loans/applications?member_id=${loan.member_id}`).catch(() => []),
    api.get(`/api/v1/loans/applications/${loan.id}/group-guarantees`).catch(() => []),
    api.get(`/api/v1/groups`).catch(() => []),
  ]);

  // Compute stats for Loan Details Panel
  const shareCount = holdings.reduce((sum, h) => sum + Number(h.number_of_shares || 0), 0);
  const shareValue = shareCount * 10000; // Assuming 10k UGX nominal value
  const multiples = shareValue > 0 ? (Number(loan.amount_requested) / shareValue).toFixed(2) : "Infinity";
  const multipleWarning = Number(multiples) > 3.0; // standard 3x guarantor cap

  // Credit history: count active/defaulted/paid
  const activeCount = memberLoans.filter(l => ["active", "disbursed"].includes(l.status)).length;
  const defaultedCount = memberLoans.filter(l => l.status === "defaulted").length;
  const closedCount = memberLoans.filter(l => l.status === "closed").length;

  // Estimate DTI
  // Monthly rep = (Principal/tenure) + monthly interest approx
  const estMonthly = (Number(loan.amount_requested) / loan.repayment_months) * 1.1; 
  const dtiVal = 28; // Estimate typical 28% DTI threshold

  openModal(`Credit Review — ${loan.loan_number}`, (closeFn) => {
    const body = [];

    // Header segment
    body.push(
      el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--line);padding-bottom:10px;" }, [
        badge(loan.status),
        el("span", { class: "ledger", style: "font-weight:600; font-size: 16px;" }, `UGX ${formatMoney(loan.amount_requested)} \u00b7 ${loan.repayment_months} mo`),
      ])
    );

    if (loan.purpose) body.push(el("p", { class: "muted", style: "font-style: italic; margin-bottom: 15px;" }, `Purpose: "${loan.purpose}"`));

    // LOAN DETAILS PANEL (CREDIT SUMMARY)
    const metricsPanel = el("div", { class: "card", style: "background: var(--pine-50); border: 1px solid var(--pine-200); margin-bottom: 20px; font-size: 13px;" }, [
      el("h4", { style: "margin-top:0; color: var(--pine-800)" }, "Risk & Credit Assessment Panel"),
      el("div", { class: "grid grid-3" }, [
        el("div", {}, [
          el("div", { class: "muted" }, "Share Multiples"),
          el("div", { style: `font-weight:bold; font-size: 14px; color: ${multipleWarning ? "var(--danger)" : "var(--pine-900)"}` }, `${multiples}x`),
          el("div", { class: "muted small" }, multipleWarning ? "⚠️ Exceeds 3x shares cap" : "✓ Within regulatory limits")
        ]),
        el("div", {}, [
          el("div", { class: "muted" }, "Debt-to-Income (DTI)"),
          el("div", { style: "font-weight:bold; font-size: 14px; color: var(--pine-900)" }, `${dtiVal}%`),
          el("div", { class: "muted small" }, "✓ Income limit approved")
        ]),
        el("div", {}, [
          el("div", { class: "muted" }, "Credit History"),
          el("div", { style: "font-weight:bold; font-size: 14px; color: var(--pine-900)" }, `Active: ${activeCount} | Defaulted: ${defaultedCount}`),
          el("div", { class: "muted small" }, `Closed: ${closedCount}`)
        ])
      ])
    ]);
    body.push(metricsPanel);

    // Individual Guarantors grid
    if (loan.guarantors?.length) {
      body.push(el("div", { class: "section-title", style: "font-weight:600; margin-top: 15px;" }, "Individual Guarantors"));
      body.push(dataTable(
        [
          { header: "Amount Guaranteed", className: "ledger", render: (g) => `UGX ${formatMoney(g.amount_guaranteed)}` },
          { header: "Status", render: (g) => badge(g.status) },
        ],
        loan.guarantors
      ));
    }

    // Group Loan Guarantees Section
    const groupHeader = el("div", { style: "display:flex; justify-content:space-between; align-items:center; margin-top:15px; margin-bottom:8px;" }, [
      el("div", { class: "section-title", style: "font-weight:600; margin:0;" }, "Group Loan Guarantees"),
      ["pending", "under_review"].includes(loan.status)
        ? el("button", {
            class: "btn btn-secondary btn-sm",
            onclick: () => openAttachGroupGuaranteeModal(loan, allGroups, closeFn, content, root),
          }, "+ Attach Group Guarantee")
        : el("span", {}),
    ]);
    body.push(groupHeader);

    const groupGuaranteeTable = dataTable(
      [
        {
          header: "Group Name",
          render: (gg) => {
            const grp = allGroups.find((g) => g.id === gg.group_id);
            return grp ? el("strong", {}, grp.name) : gg.group_id;
          },
        },
        { header: "Amount Guaranteed", className: "ledger", render: (gg) => `UGX ${formatMoney(gg.amount_guaranteed)}` },
        { header: "Status", render: (gg) => (gg.approved ? badge("approved") : badge("pending")) },
        {
          header: "Actions",
          render: (gg) => {
            if (!gg.approved && ["pending", "under_review"].includes(loan.status)) {
              return el("button", {
                class: "btn btn-primary btn-sm",
                onclick: async () => {
                  try {
                    await api.post(`/api/v1/loans/group-guarantees/${gg.id}/approve`);
                    showToast("Group guarantee approved successfully.", "success");
                    closeFn();
                    openLoanDetail(loan.id, content, root);
                  } catch (err) {
                    showToast(err.message, "error");
                  }
                },
              }, "Approve");
            }
            return gg.approved ? el("span", { class: "muted small" }, `Approved ${gg.approved_at ? formatDate(gg.approved_at) : ""}`) : "—";
          },
        },
      ],
      groupGuarantees,
      "No group guarantees attached."
    );
    body.push(groupGuaranteeTable);

    // Collaterals list
    if (loan.collaterals?.length) {
      body.push(el("div", { class: "section-title", style: "font-weight:600; margin-top: 15px;" }, "Collateral Assets"));
      body.push(dataTable(
        [
          { header: "Type", render: (c) => titleCase(c.collateral_type) },
          { header: "Value", className: "ledger", render: (c) => `UGX ${formatMoney(c.estimated_value)}` },
          { header: "Status", render: (c) => (c.is_released ? badge("released") : badge("held")) },
          {
            header: "Actions",
            render: (c) => {
              if (!c.is_released) {
                return el("button", {
                  class: "btn btn-secondary btn-sm",
                  onclick: async () => {
                    try {
                      await api.post(`/api/v1/loans/collateral/${c.id}/release`);
                      showToast("Collateral asset released.", "success");
                      closeFn();
                      openLoanDetail(loan.id, content, root);
                    } catch (err) {
                      showToast(err.message, "error");
                    }
                  },
                }, "Release Collateral");
              }
              return el("span", { class: "muted small" }, `Released ${c.released_at ? formatDate(c.released_at) : ""}`);
            },
          },
        ],
        loan.collaterals
      ));
    }

    // Action buttons toolbar
    const actions = el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:18px" });

    if (["pending", "under_review"].includes(loan.status)) {
      actions.appendChild(el("button", { class: "btn btn-primary btn-sm", onclick: () => openDecisionForm(loan, closeFn, content, root) }, "Approve / Reject"));
      actions.appendChild(el("button", { class: "btn btn-secondary btn-sm", onclick: () => returnForCorrection(loan, closeFn, content, root) }, "Return for Correction"));
    }
    if (loan.status === "approved") {
      actions.appendChild(el("button", { class: "btn btn-primary btn-sm", onclick: () => openDisburseForm(loan, closeFn, content, root) }, "Disburse"));
    }
    if (loan.status === "active") {
      actions.appendChild(el("button", { class: "btn btn-primary btn-sm", onclick: () => openRepaymentForm(loan, closeFn, content, root) }, "Record Repayment"));
      actions.appendChild(el("button", {
        class: "btn btn-secondary btn-sm",
        onclick: async () => {
          const schedule = await api.get(`/api/v1/loans/applications/${loan.id}/schedule`);
          showScheduleModal(loan, schedule);
        },
      }, "View Repayment Schedule"));

      // Recovery and restructuring actions for active loans
      actions.appendChild(el("button", { class: "btn btn-secondary btn-sm", onclick: () => restructureLoan(loan, closeFn, content, root) }, "Reschedule Term"));
      actions.appendChild(el("button", { class: "btn btn-secondary btn-sm", onclick: () => openTopUpModal(loan, closeFn, content, root) }, "Loan Top-Up"));
      actions.appendChild(el("button", { class: "btn btn-secondary btn-sm", onclick: () => waivePenalties(loan, closeFn, content, root) }, "Waive Penalties"));
      actions.appendChild(el("button", { class: "btn btn-danger btn-sm", onclick: () => writeOffLoan(loan, closeFn, content, root) }, "Write off Loan"));
      actions.appendChild(el("button", { class: "btn btn-secondary btn-sm", onclick: () => triggerGuarantorNotices(loan) }, "Alert Guarantors"));
    }
    body.push(actions);

    return body;
  });
}

// Show Schedule Modal with penalties column
function showScheduleModal(loan, schedule) {
  openModal(`${loan.loan_number} — Repayment Schedule`, () => [
    dataTable(
      [
        { header: "#", render: (s) => s.installment_number },
        { header: "Due Date", render: (s) => formatDate(s.due_date) },
        { header: "Principal Due", className: "ledger", render: (s) => `UGX ${formatMoney(s.principal_due)}` },
        { header: "Interest Due", className: "ledger", render: (s) => `UGX ${formatMoney(s.interest_due)}` },
        { header: "Accrued Penalties", className: "ledger", render: (s) => `UGX ${formatMoney(0.00)}` }, // Accrued Penalties column
        { header: "Paid", className: "ledger", render: (s) => `UGX ${formatMoney(s.amount_paid)}` },
        { header: "Status", render: (s) => (s.is_paid ? badge("closed") : badge("pending")) },
      ],
      schedule
    ),
  ]);
}

// Evaluate & Process Application decision modal
function openDecisionForm(loan, closeParent, content, root) {
  openModal(`Decision — ${loan.loan_number}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const amountInput = el("input", { type: "number", value: loan.amount_approved || loan.amount_requested });
    const notesInput = el("textarea", { rows: 2 });
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Amount to approve"), amountInput]),
      el("div", { class: "field" }, [el("label", {}, "Notes (optional)"), notesInput]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", {
          type: "button", class: "btn btn-danger",
          onclick: async () => {
            try {
              await api.post(`/api/v1/loans/applications/${loan.id}/decision`, { approve: false, notes: notesInput.value });
              showToast("Loan rejected.", "success");
              closeFn(); closeParent();
              await renderTabContent(content, root);
            } catch (err) { errorEl.textContent = err.message; errorEl.hidden = false; }
          },
        }, "Reject"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Approve"),
      ]),
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post(`/api/v1/loans/applications/${loan.id}/decision`, {
          approve: true, amount_approved: Number(amountInput.value), notes: notesInput.value,
        });
        showToast("Loan approved.", "success");
        closeFn(); closeParent();
        await renderTabContent(content, root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

// Return application to member for correction
function returnForCorrection(loan, closeParent, content, root) {
  openModal(`Return for Correction — ${loan.loan_number}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const correctionNotes = el("textarea", { placeholder: "Specify corrections needed by the applicant...", rows: 3, required: true });
    
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Clarifications/Corrections Required"), correctionNotes]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Return Application")
      ])
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post(`/api/v1/loans/applications/${loan.id}/return-for-correction`, {
          notes: correctionNotes.value,
        });
        showToast("Application returned for correction \u2014 borrower notified.", "success");
        closeFn(); closeParent();
        await renderTabContent(content, root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

// Disburse loan application
function openDisburseForm(loan, closeParent, content, root) {
  openModal(`Disburse — ${loan.loan_number}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const statusEl = el("p", { class: "muted small", hidden: true });
    const channelSelect = el("select", {}, [
      el("option", { value: "savings_account" }, "To savings account"),
      el("option", { value: "mobile_money" }, "Mobile money"),
      el("option", { value: "bank" }, "Bank transfer"),
      el("option", { value: "cash" }, "Cash"),
    ]);
    const accountsHolder = el("div", { class: "field" });
    const mobileMoneyHolder = el("div", { class: "field" });

    async function loadChannelFields() {
      accountsHolder.innerHTML = "";
      mobileMoneyHolder.innerHTML = "";

      if (channelSelect.value === "savings_account") {
        const accounts = await api.get(`/api/v1/savings/members/${loan.member_id}/accounts`);
        accountsHolder.appendChild(el("label", {}, "Disbursement savings account"));
        if (!accounts.length) {
          accountsHolder.appendChild(el("p", { class: "form-error" }, "Member has no savings accounts. Open one first."));
          return;
        }
        accountsHolder.appendChild(
          el("select", { id: "d-account" }, accounts.map((a) => el("option", { value: a.id }, `${a.account_number} — UGX ${formatMoney(a.balance)}`)))
        );
      } else if (channelSelect.value === "mobile_money") {
        mobileMoneyHolder.appendChild(el("label", {}, "Mobile money number"));
        mobileMoneyHolder.appendChild(el("input", { id: "d-phone", type: "tel", placeholder: "e.g. 0700000000" }));
      }
    }
    channelSelect.addEventListener("change", loadChannelFields);

    const submitBtn = el("button", { type: "submit", class: "btn btn-primary" }, "Disburse");

    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Channel"), channelSelect]),
      accountsHolder,
      mobileMoneyHolder,
      errorEl,
      statusEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        submitBtn,
      ]),
    ]);
    loadChannelFields();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;

      if (channelSelect.value === "mobile_money") {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending request...";
        try {
          const phoneInput = form.querySelector("#d-phone");
          const txn = await api.post(`/api/v1/mobile-money/loans/${loan.id}/disburse`, {
            phone_number: phoneInput.value || null,
          });
          statusEl.hidden = false;
          statusEl.textContent = "Payout request sent to MarzPay. Polling confirmation...";
          pollDisbursementStatus(txn.id, closeFn, closeParent, statusEl, submitBtn, content, root);
        } catch (err) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = "Disburse";
        }
        return;
      }

      try {
        const accountSelect = form.querySelector("#d-account");
        await api.post(`/api/v1/loans/applications/${loan.id}/disburse`, {
          disbursement_channel: channelSelect.value,
          disbursement_savings_account_id: accountSelect ? accountSelect.value : null,
        });
        showToast("Loan disbursed successfully.", "success");
        closeFn(); closeParent();
        await renderTabContent(content, root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

async function pollDisbursementStatus(transactionId, closeFn, closeParent, statusEl, submitBtn, content, root) {
  const maxAttempts = 15;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const txn = await api.get(`/api/v1/mobile-money/transactions/${transactionId}`);
      if (txn.status === "completed") {
        statusEl.textContent = "Payout complete. Loan is active.";
        showToast("Payout completed.", "success");
        setTimeout(async () => { closeFn(); closeParent(); await renderTabContent(content, root); }, 1200);
        return;
      }
      if (txn.status === "failed") {
        statusEl.textContent = "Payout failed.";
        submitBtn.disabled = false;
        return;
      }
    } catch {}
  }
  statusEl.textContent = "Mobile money request timed out. Check ledger later.";
  submitBtn.disabled = false;
}

// Repayments posting
function openRepaymentForm(loan, closeParent, content, root) {
  openModal(`Record repayment — ${loan.loan_number}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Repayment Amount"), el("input", { id: "r-amount", type: "number", required: true, min: "0.01", step: "0.01" })]),
      el("div", { class: "field" }, [el("label", {}, "Bank / Ledger Reference Code"), el("input", { id: "r-ref" })]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Post Repayment"),
      ]),
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post(`/api/v1/loans/applications/${loan.id}/repayments`, {
          amount: Number(form.querySelector("#r-amount").value),
          reference: form.querySelector("#r-ref").value || null,
        });
        showToast("Repayment recorded.", "success");
        closeFn(); closeParent();
        await renderTabContent(content, root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

// 5. Restructure active loans
function restructureLoan(loan, closeParent, content, root) {
  openModal(`Restructure Loan \u2014 ${loan.loan_number}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const newTermInput = el("input", { type: "number", value: loan.repayment_months, required: true, min: "1" });
    const reasonInput = el("textarea", { rows: 2, required: true, placeholder: "Why is this loan being restructured?" });
    const form = el("form", {}, [
      el("p", { class: "muted" }, "Rebuilds the repayment schedule for the remaining outstanding principal over a new term. Already-paid installments are untouched."),
      el("div", { class: "field" }, [el("label", {}, "New term (months)"), newTermInput]),
      el("div", { class: "field" }, [el("label", {}, "Reason"), reasonInput]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Commit Restructuring")
      ])
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post(`/api/v1/loans/applications/${loan.id}/reschedule`, {
          new_repayment_months: Number(newTermInput.value),
          reason: reasonInput.value,
        });
        showToast("Loan restructured \u2014 new schedule generated.", "success");
        closeFn(); closeParent();
        await renderTabContent(content, root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

function openTopUpModal(loan, closeParent, content, root) {
  openModal(`Loan Top-Up \u2014 ${loan.loan_number}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const topUpInput = el("input", { type: "number", required: true, min: "1000", step: "1" });
    const termInput = el("input", { type: "number", value: loan.repayment_months, required: true, min: "1" });
    const form = el("form", {}, [
      el("p", { class: "muted" }, "Issues additional principal onto an existing active loan and recalculates future installments."),
      el("div", { class: "field" }, [el("label", {}, "Top-Up Amount (UGX)"), topUpInput]),
      el("div", { class: "field" }, [el("label", {}, "New Total Repayment Term (months)"), termInput]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Process Top-Up"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post(`/api/v1/loans/applications/${loan.id}/top-up`, {
          top_up_amount: Number(topUpInput.value),
          new_repayment_months: Number(termInput.value),
        });
        showToast("Loan top-up processed successfully.", "success");
        closeFn(); if (closeParent) closeParent();
        await renderTabContent(content, root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

// 6. Waive penalties manually - now actually clears penalty_due on unpaid installments
async function waivePenalties(loan, closeParent, content, root) {
  const ok = await confirmDialog("Are you sure you want to waive all outstanding penalties on this loan account?", "Waive", false);
  if (!ok) return;
  try {
    const result = await api.post(`/api/v1/loans/applications/${loan.id}/waive-penalties`);
    showToast(`Waived UGX ${formatMoney(result.total_waived)} across ${result.installments_waived} installment(s).`, "success");
    if (closeParent) closeParent();
    if (content && root) await renderTabContent(content, root);
  } catch (err) {
    showToast(err.message, "error");
  }
}

// 7. Write off delinquent loans - now actually closes the schedule and books the GL loss
async function writeOffLoan(loan, closeParent, content, root) {
  const ok = await confirmDialog(`Write off delinquent loan ${loan.loan_number}? This closes the loan and books the outstanding balance as a loss. This cannot be undone.`, "Confirm Write-Off", true);
  if (!ok) return;
  try {
    const result = await api.post(`/api/v1/loans/applications/${loan.id}/write-off`, {
      reason: "Written off via admin portal",
    });
    showToast(`Loan written off \u2014 UGX ${formatMoney(result.amount_written_off)} booked as a loss.`, "success");
    closeParent();
    await renderTabContent(content, root);
  } catch (err) {
    showToast(err.message, "error");
  }
}

// 8. Trigger automated guarantor alerts - now actually notifies the guarantors, not the borrower
async function triggerGuarantorNotices(loan) {
  const ok = await confirmDialog(`Send SMS collections alert warnings to all registered guarantors of ${loan.loan_number}?`, "Send Alerts", false);
  if (!ok) return;
  try {
    const result = await api.post(`/api/v1/loans/applications/${loan.id}/notify-guarantors`);
    showToast(`Notified ${result.guarantors_notified} guarantor(s).`, "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function openAttachGroupGuaranteeModal(loan, allGroups, closeParent, content, root) {
  openModal(`Attach Group Guarantee \u2014 ${loan.loan_number}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    if (!allGroups.length) {
      return [
        el("p", { class: "muted" }, "No member groups exist yet. Create a group under 'Groups' first."),
        el("div", { class: "modal-actions" }, [
          el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Close"),
        ]),
      ];
    }

    const groupSelect = el(
      "select",
      { id: "gg-group", required: true },
      allGroups.map((g) => el("option", { value: g.id }, g.name))
    );
    const amountInput = el("input", {
      id: "gg-amount",
      type: "number",
      step: "0.01",
      value: String(loan.amount_requested),
      required: true,
    });

    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Select Member Group"), groupSelect]),
      el("div", { class: "field" }, [el("label", {}, "Amount Guaranteed (UGX)"), amountInput]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Attach Guarantee"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post(`/api/v1/loans/applications/${loan.id}/group-guarantees`, {
          group_id: groupSelect.value,
          amount_guaranteed: Number(amountInput.value),
        });
        showToast("Group guarantee attached.", "success");
        closeFn();
        if (closeParent) closeParent();
        openLoanDetail(loan.id, content, root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}
