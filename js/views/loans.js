import { api } from "../api.js";
import {
  el, mount, formatMoney, formatDate, titleCase, badge, dataTable, openModal, showToast,
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
    return a ? `${a.code} \u2014 ${a.name}` : null;
  };

  const card = el("div", { class: "card" }, [
    el("div", { class: "card-header" }, [
      el("h3", {}, "Loan products"),
      el("button", { class: "btn btn-primary btn-sm", onclick: () => openProductModal(content, root, accounts) }, "+ New product"),
    ]),
    dataTable(
      [
        { header: "Name", render: (p) => p.name },
        { header: "Rate p.a.", render: (p) => `${p.interest_rate_annual}%` },
        { header: "Max term", render: (p) => `${p.max_repayment_months} mo` },
        { header: "Max amount", className: "ledger", render: (p) => formatMoney(p.max_amount) },
        { header: "Guarantors", render: (p) => (p.requires_guarantors ? `Min ${p.min_guarantors}` : "Not required") },
        { header: "GL account", render: (p) => accountName(p.gl_asset_account_id) || el("span", { class: "muted small" }, "Not set") },
        { header: "", render: (p) => el("button", { class: "btn btn-secondary btn-sm", onclick: () => openProductModal(content, root, accounts, p) }, "Edit") },
      ],
      products, "No loan products yet."
    ),
  ]);
  mount(content, card);
}

function openProductModal(content, root, accounts, existing) {
  const isEdit = Boolean(existing);
  openModal(isEdit ? `Edit ${existing.name}` : "New loan product", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const requiresGuarantors = el("input", { type: "checkbox", id: "lp-requires", checked: isEdit ? undefined : true });

    const glSelect = el(
      "select", { id: "lp-gl" },
      [
        el("option", { value: "" }, "\u2014 Not set (won't post to the ledger) \u2014"),
        ...accounts.map((a) => el("option", { value: a.id, selected: isEdit && a.id === existing.gl_asset_account_id }, `${a.code} \u2014 ${a.name}`)),
      ]
    );
    const glField = el("div", { class: "field" }, [
      el("label", {}, "GL asset account (loans receivable)"),
      glSelect,
      el("div", { class: "field-hint" }, "What members owe the SACCO on this product. Required for disbursements/repayments to post to the ledger."),
    ]);

    const fields = isEdit
      ? [glField]
      : [
          el("div", { class: "field" }, [el("label", {}, "Name"), el("input", { id: "lp-name", required: true })]),
          el("div", { class: "field-row" }, [
            el("div", { class: "field" }, [el("label", {}, "Interest rate p.a. (%)"), el("input", { id: "lp-rate", type: "number", step: "0.01", required: true })]),
            el("div", { class: "field" }, [el("label", {}, "Max repayment (months)"), el("input", { id: "lp-months", type: "number", required: true })]),
          ]),
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
      { header: "Requested", className: "ledger", render: (l) => formatMoney(l.amount_requested) },
      { header: "Term", render: (l) => `${l.repayment_months} mo` },
      { header: "Status", render: (l) => badge(l.status) },
      { header: "Applied", render: (l) => formatDate(l.created_at) },
      { header: "", render: (l) => el("button", { class: "btn btn-secondary btn-sm", onclick: () => openLoanDetail(l.id, content, root) }, "Open") },
    ],
    loans, "No loan applications found."
  );

  mount(content, [toolbar, el("div", { class: "card" }, [table])]);
}

async function openLoanDetail(loanId, content, root) {
  const loan = await api.get(`/api/v1/loans/applications/${loanId}`);

  openModal(`${loan.loan_number}`, (closeFn) => {
    const body = [];

    body.push(
      el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:14px" }, [
        badge(loan.status),
        el("span", { class: "ledger", style: "font-weight:600" }, `UGX ${formatMoney(loan.amount_requested)} \u00b7 ${loan.repayment_months} mo`),
      ])
    );

    if (loan.purpose) body.push(el("p", { class: "muted" }, loan.purpose));

    if (loan.guarantors?.length) {
      body.push(el("div", { class: "section-title" }, "Guarantors"));
      body.push(dataTable(
        [
          { header: "Amount", className: "ledger", render: (g) => formatMoney(g.amount_guaranteed) },
          { header: "Status", render: (g) => badge(g.status) },
        ],
        loan.guarantors
      ));
    }

    if (loan.collaterals?.length) {
      body.push(el("div", { class: "section-title" }, "Collateral"));
      body.push(dataTable(
        [
          { header: "Type", render: (c) => titleCase(c.collateral_type) },
          { header: "Value", className: "ledger", render: (c) => formatMoney(c.estimated_value) },
        ],
        loan.collaterals
      ));
    }

    const actions = el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:18px" });

    if (["pending", "under_review"].includes(loan.status)) {
      actions.appendChild(el("button", { class: "btn btn-primary btn-sm", onclick: () => openDecisionForm(loan, closeFn, content, root) }, "Approve / Reject"));
    }
    if (loan.status === "approved") {
      actions.appendChild(el("button", { class: "btn btn-primary btn-sm", onclick: () => openDisburseForm(loan, closeFn, content, root) }, "Disburse"));
    }
    if (loan.status === "active") {
      actions.appendChild(el("button", { class: "btn btn-primary btn-sm", onclick: () => openRepaymentForm(loan, closeFn, content, root) }, "Record repayment"));
      actions.appendChild(el("button", {
        class: "btn btn-secondary btn-sm",
        onclick: async () => {
          const schedule = await api.get(`/api/v1/loans/applications/${loan.id}/schedule`);
          showScheduleModal(loan, schedule);
        },
      }, "View schedule"));
    }
    body.push(actions);

    return body;
  });
}

function showScheduleModal(loan, schedule) {
  openModal(`${loan.loan_number} \u2014 Schedule`, () => [
    dataTable(
      [
        { header: "#", render: (s) => s.installment_number },
        { header: "Due", render: (s) => formatDate(s.due_date) },
        { header: "Principal", className: "ledger", render: (s) => formatMoney(s.principal_due) },
        { header: "Interest", className: "ledger", render: (s) => formatMoney(s.interest_due) },
        { header: "Paid", className: "ledger", render: (s) => formatMoney(s.amount_paid) },
        { header: "Status", render: (s) => (s.is_paid ? badge("closed") : badge("pending")) },
      ],
      schedule
    ),
  ]);
}

function openDecisionForm(loan, closeParent, content, root) {
  openModal(`Decision \u2014 ${loan.loan_number}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const amountInput = el("input", { type: "number", value: loan.amount_requested });
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

function openDisburseForm(loan, closeParent, content, root) {
  openModal(`Disburse \u2014 ${loan.loan_number}`, (closeFn) => {
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
          accountsHolder.appendChild(el("p", { class: "form-error" }, "This member has no savings accounts. Open one first, or choose a different channel."));
          return;
        }
        accountsHolder.appendChild(
          el("select", { id: "d-account" }, accounts.map((a) => el("option", { value: a.id }, `${a.account_number} \u2014 UGX ${formatMoney(a.balance)}`)))
        );
      } else if (channelSelect.value === "mobile_money") {
        mobileMoneyHolder.appendChild(el("label", {}, "Mobile money number (optional \u2014 defaults to the member's number on file)"));
        mobileMoneyHolder.appendChild(el("input", { id: "d-phone", type: "tel", placeholder: "e.g. 0700000000" }));
        mobileMoneyHolder.appendChild(el("div", { class: "field-hint" }, "The loan stays \u201capproved\u201d until MarzPay confirms the payout succeeded \u2014 it won't show as active immediately."));
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
        submitBtn.textContent = "Sending request\u2026";
        try {
          const phoneInput = form.querySelector("#d-phone");
          const txn = await api.post(`/api/v1/mobile-money/loans/${loan.id}/disburse`, {
            phone_number: phoneInput.value || null,
          });
          statusEl.hidden = false;
          statusEl.textContent = "Disbursement request sent to MarzPay \u2014 waiting for confirmation\u2026";
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
        showToast("Loan disbursed.", "success");
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
  const maxAttempts = 20; // ~2 minutes at 6s intervals
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    try {
      const txn = await api.get(`/api/v1/mobile-money/transactions/${transactionId}`);
      if (txn.status === "completed") {
        statusEl.textContent = "Confirmed \u2014 the loan is now active.";
        showToast("Mobile money disbursement completed.", "success");
        setTimeout(async () => { closeFn(); closeParent(); await renderTabContent(content, root); }, 1200);
        return;
      }
      if (txn.status === "failed" || txn.status === "cancelled") {
        statusEl.textContent = `Disbursement ${txn.status}: ${txn.failure_reason || "please try again."}`;
        submitBtn.disabled = false;
        submitBtn.textContent = "Try again";
        return;
      }
    } catch {
      // transient network issue while polling - keep trying silently
    }
  }
  statusEl.textContent = "Still waiting on confirmation. You can close this and check back on this loan shortly.";
  submitBtn.disabled = false;
  submitBtn.textContent = "Close and check later";
}

function openRepaymentForm(loan, closeParent, content, root) {
  openModal(`Record repayment \u2014 ${loan.loan_number}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Amount"), el("input", { id: "r-amount", type: "number", required: true, min: "0.01", step: "0.01" })]),
      el("div", { class: "field" }, [el("label", {}, "Reference (optional)"), el("input", { id: "r-ref" })]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Record"),
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
