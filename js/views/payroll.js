import { api } from "../api.js";
import { el, mount, formatMoney, titleCase, badge, dataTable, openModal, showToast, memberPicker } from "../utils.js";

let active = "files";

export async function renderPayroll(root) {
  const tabs = el("div", { class: "tabs" }, [
    tabButton("files", "Deduction Files", root),
    tabButton("employers", "Employers", root),
  ]);
  const content = el("div", {});
  mount(root, [tabs, content]);
  await renderTabContent(content, root);
}

function tabButton(key, label, root) {
  return el("button", { class: `tab ${active === key ? "active" : ""}`, onclick: async () => { active = key; await renderPayroll(root); } }, label);
}

async function renderTabContent(content, root) {
  mount(content, el("div", { class: "spinner" }));
  if (active === "employers") await renderEmployersTab(content, root);
  else await renderFilesTab(content, root);
}

async function renderEmployersTab(content, root) {
  const employers = await api.get("/api/v1/payroll/employers");
  const card = el("div", { class: "card" }, [
    el("div", { class: "card-header" }, [
      el("h3", {}, "Employers"),
      el("button", { class: "btn btn-primary btn-sm", onclick: () => openEmployerModal(content, root) }, "+ New employer"),
    ]),
    dataTable(
      [
        { header: "Name", render: (e) => e.name },
        { header: "Contact", render: (e) => e.contact_person || "\u2014" },
        { header: "Phone", render: (e) => e.phone_number || "\u2014" },
      ],
      employers, "No employers yet."
    ),
  ]);
  mount(content, card);
}

function openEmployerModal(content, root) {
  openModal("New employer", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Name"), el("input", { id: "emp-name", required: true })]),
      el("div", { class: "field" }, [el("label", {}, "Contact person"), el("input", { id: "emp-contact" })]),
      el("div", { class: "field" }, [el("label", {}, "Phone"), el("input", { id: "emp-phone" })]),
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
        await api.post("/api/v1/payroll/employers", {
          name: form.querySelector("#emp-name").value,
          contact_person: form.querySelector("#emp-contact").value || null,
          phone_number: form.querySelector("#emp-phone").value || null,
        });
        showToast("Employer created.", "success");
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

async function renderFilesTab(content, root) {
  const employers = await api.get("/api/v1/payroll/employers");
  if (!employers.length) {
    mount(content, el("div", { class: "card empty-state" }, [
      el("h4", {}, "No employers yet"),
      el("p", {}, "Add an employer on the \u201cEmployers\u201d tab first."),
    ]));
    return;
  }

  const employerSelect = el("select", {}, employers.map((e) => el("option", { value: e.id }, e.name)));
  const periodInput = el("input", { placeholder: "e.g. 2026-06", required: true });
  const linesHolder = el("div", {});
  const resultHolder = el("div", { style: "margin-top:18px" });
  const errorEl = el("p", { class: "form-error", hidden: true });

  function addLine() {
    let picked = null;
    const picker = memberPicker(
      (q) => api.get(`/api/v1/members?q=${encodeURIComponent(q)}`).then((r) => r.items),
      (m) => { picked = m; }
    );
    const targetType = el("select", { class: "pf-target-type" }, [
      el("option", { value: "loan" }, "Loan repayment"),
      el("option", { value: "savings" }, "Savings deposit"),
    ]);
    const targetIdInput = el("input", { class: "pf-target-id", placeholder: "Loan or savings account ID" });
    const amountInput = el("input", { type: "number", placeholder: "Amount", step: "0.01" });

    const row = el("div", { class: "card", style: "margin-bottom:10px" }, [
      el("div", { class: "field-row" }, [
        el("div", { class: "field", style: "flex:2" }, [el("label", {}, "Member"), picker]),
        el("div", { class: "field" }, [el("label", {}, "Amount"), amountInput]),
      ]),
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "Applies to"), targetType]),
        el("div", { class: "field" }, [el("label", {}, "Target ID"), targetIdInput]),
      ]),
      el("div", { class: "field-hint" }, "Find the loan or savings account ID on the member's detail page in Members."),
      el("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => row.remove() }, "Remove line"),
    ]);
    row.getLine = () => ({
      member: picked,
      amount: Number(amountInput.value || 0),
      targetType: targetType.value,
      targetId: targetIdInput.value.trim(),
    });
    linesHolder.appendChild(row);
  }
  addLine();

  const form = el("form", {}, [
    el("div", { class: "field-row" }, [
      el("div", { class: "field" }, [el("label", {}, "Employer"), employerSelect]),
      el("div", { class: "field" }, [el("label", {}, "Period"), periodInput]),
    ]),
    el("div", { class: "field" }, [
      el("label", {}, "Deduction lines"),
      linesHolder,
      el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: addLine }, "+ Add line"),
    ]),
    errorEl,
    el("div", { class: "modal-actions", style: "justify-content:flex-start" }, [
      el("button", { type: "submit", class: "btn btn-primary" }, "Upload & reconcile"),
    ]),
  ]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const rows = [...linesHolder.children].map((r) => r.getLine());
    const deductions = [];
    for (const r of rows) {
      if (!r.member) { errorEl.textContent = "Every line needs a member selected."; errorEl.hidden = false; return; }
      if (!r.amount) { errorEl.textContent = "Every line needs an amount."; errorEl.hidden = false; return; }
      const line = { member_id: r.member.id, amount: r.amount };
      if (r.targetType === "loan") line.loan_id = r.targetId || null;
      else line.savings_account_id = r.targetId || null;
      deductions.push(line);
    }

    try {
      const result = await api.post("/api/v1/payroll/files", {
        employer_id: employerSelect.value,
        period: periodInput.value,
        deductions,
      });
      showToast("Payroll file processed.", "success");
      showResult(result);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  function showResult(file) {
    mount(resultHolder, el("div", { class: "card" }, [
      el("h3", {}, `Reconciliation result \u2014 ${file.period}`),
      el("p", { class: "muted" }, `Total: UGX ${formatMoney(file.total_amount)}`),
      dataTable(
        [
          { header: "Amount", className: "ledger", render: (d) => formatMoney(d.amount) },
          { header: "Status", render: (d) => badge(d.status) },
          { header: "Note", render: (d) => d.exception_reason || "\u2014" },
        ],
        file.deductions
      ),
    ]));
  }

  mount(content, [el("div", { class: "card" }, [el("h3", {}, "Upload payroll deduction file"), form]), resultHolder]);
}
