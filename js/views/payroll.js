import { api } from "../api.js";
import {
  el,
  mount,
  formatMoney,
  formatDate,
  formatDateTime,
  titleCase,
  badge,
  dataTable,
  openModal,
  showToast,
  memberPicker,
  confirmDialog,
} from "../utils.js";

let active = "employees";

export async function renderPayroll(root) {
  const tabs = el("div", { class: "tabs" }, [
    tabButton("employees", "Staff Employees", root),
    tabButton("runs", "Payroll Runs", root),
    tabButton("files", "Deduction Files", root),
    tabButton("employers", "External Employers", root),
  ]);
  const content = el("div", {});
  mount(root, [tabs, content]);
  await renderTabContent(content, root);
}

function tabButton(key, label, root) {
  return el(
    "button",
    {
      class: `tab ${active === key ? "active" : ""}`,
      onclick: async () => {
        active = key;
        await renderPayroll(root);
      },
    },
    label
  );
}

async function renderTabContent(content, root) {
  mount(content, el("div", { class: "spinner" }));
  if (active === "employees") await renderEmployeesTab(content, root);
  else if (active === "runs") await renderPayrollRunsTab(content, root);
  else if (active === "employers") await renderEmployersTab(content, root);
  else await renderFilesTab(content, root);
}

/* ==========================================================================
   1. STAFF EMPLOYEES TAB
   ========================================================================== */
async function renderEmployeesTab(content, root) {
  const employees = await api.get("/api/v1/hr-payroll/employees").catch(() => []);

  const totalEmployees = employees.length;
  const totalPayroll = employees.reduce((sum, e) => sum + (Number(e.basic_salary) || 0) + (Number(e.allowances) || 0), 0);

  const stats = el("div", { class: "grid grid-2", style: "margin-bottom: 20px;" }, [
    el("div", { class: "card stat-card" }, [
      el("div", { class: "stat-label" }, "Active Employees"),
      el("div", { class: "stat-value" }, String(totalEmployees)),
    ]),
    el("div", { class: "card stat-card" }, [
      el("div", { class: "stat-label" }, "Total Estimated Monthly Gross Payroll"),
      el("div", { class: "stat-value", style: "color: var(--pine-600);" }, `UGX ${formatMoney(totalPayroll)}`),
    ]),
  ]);

  const card = el("div", { class: "card" }, [
    el("div", { class: "card-header" }, [
      el("h3", {}, "Staff Directory"),
      el("button", { class: "btn btn-primary btn-sm", onclick: () => openEmployeeModal(content, root) }, "+ Add Employee"),
    ]),
    dataTable(
      [
        { header: "Emp No.", render: (e) => el("strong", {}, e.employee_number) },
        { header: "Full Name", render: (e) => e.full_name },
        { header: "Position", render: (e) => e.position },
        { header: "Department", render: (e) => e.department || "—" },
        { header: "Basic Salary", className: "ledger", render: (e) => `UGX ${formatMoney(e.basic_salary)}` },
        { header: "Allowances", className: "ledger", render: (e) => `UGX ${formatMoney(e.allowances)}` },
        { header: "Gross Pay", className: "ledger", render: (e) => `UGX ${formatMoney(Number(e.basic_salary) + Number(e.allowances))}` },
        { header: "NSSF / TIN", render: (e) => `NSSF: ${e.nssf_number || "—"} | TIN: ${e.tin || "—"}` },
        { header: "Status", render: (e) => (e.is_active ? badge("active") : badge("inactive")) },
        {
          header: "",
          render: (e) => el("button", { class: "btn btn-secondary btn-sm", onclick: () => openEmployeeModal(content, root, e) }, "Edit"),
        },
      ],
      employees,
      "No staff employees added yet. Click '+ Add Employee' to create a staff record."
    ),
  ]);

  mount(content, [stats, card]);
}

function openEmployeeModal(content, root, existing = null) {
  const isEdit = Boolean(existing);
  openModal(isEdit ? `Edit Staff — ${existing.employee_number}` : "Add New Staff Employee", (closeFn) => {
    let linkedMember = null;
    const errorEl = el("p", { class: "form-error", hidden: true });
    const picker = memberPicker(
      (q) => api.get(`/api/v1/members?q=${encodeURIComponent(q)}`).then((r) => r.items),
      (m) => { linkedMember = m; }
    );
    const activeToggle = el("input", { type: "checkbox", checked: isEdit ? existing.is_active : true });

    const form = el("form", {}, [
      !isEdit
        ? el("div", { class: "field-row" }, [
            el("div", { class: "field" }, [el("label", {}, "Full Name"), el("input", { id: "emp-name", required: true })]),
            el("div", { class: "field" }, [el("label", {}, "National ID"), el("input", { id: "emp-nin", required: true })]),
          ])
        : el("span", {}),
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "Phone Number"), el("input", { id: "emp-phone", value: existing?.phone_number || "", required: true })]),
        el("div", { class: "field" }, [el("label", {}, "Email"), el("input", { id: "emp-email", type: "email", value: existing?.email || "" })]),
      ]),
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "Position / Title"), el("input", { id: "emp-pos", value: existing?.position || "", required: true })]),
        el("div", { class: "field" }, [el("label", {}, "Department"), el("input", { id: "emp-dept", value: existing?.department || "" })]),
      ]),
      !isEdit
        ? el("div", { class: "field" }, [el("label", {}, "Employment Date"), el("input", { id: "emp-date", type: "date", required: true, value: new Date().toISOString().split("T")[0] })])
        : el("span", {}),
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "Basic Salary (UGX)"), el("input", { id: "emp-salary", type: "number", step: "0.01", value: existing?.basic_salary || "", required: true })]),
        el("div", { class: "field" }, [el("label", {}, "Allowances (UGX)"), el("input", { id: "emp-allow", type: "number", step: "0.01", value: existing?.allowances || "0" })]),
      ]),
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "NSSF Number"), el("input", { id: "emp-nssf", value: existing?.nssf_number || "" })]),
        el("div", { class: "field" }, [el("label", {}, "TIN Number"), el("input", { id: "emp-tin", value: existing?.tin || "" })]),
      ]),
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "Mobile Money Number"), el("input", { id: "emp-momo", value: existing?.mobile_money_number || "" })]),
        el("div", { class: "field" }, [el("label", {}, "Bank Account Number"), el("input", { id: "emp-bank", value: existing?.bank_account_number || "" })]),
      ]),
      !isEdit
        ? el("div", { class: "field" }, [el("label", {}, "Link to SACCO Member Profile (for automatic loan deductions)"), picker])
        : el("span", {}),
      isEdit
        ? el("div", { class: "field", style: "display:flex;align-items:center;gap:8px" }, [activeToggle, el("label", { style: "margin:0" }, "Employee Active")])
        : el("span", {}),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, isEdit ? "Save Changes" : "Create Employee"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        if (isEdit) {
          await api.patch(`/api/v1/hr-payroll/employees/${existing.id}`, {
            basic_salary: Number(form.querySelector("#emp-salary").value),
            allowances: Number(form.querySelector("#emp-allow").value || 0),
            position: form.querySelector("#emp-pos").value.trim(),
            department: form.querySelector("#emp-dept").value.trim() || null,
            phone_number: form.querySelector("#emp-phone").value.trim(),
            email: form.querySelector("#emp-email").value.trim() || null,
            mobile_money_number: form.querySelector("#emp-momo").value.trim() || null,
            bank_account_number: form.querySelector("#emp-bank").value.trim() || null,
            is_active: activeToggle.checked,
          });
          showToast("Employee record updated.", "success");
        } else {
          await api.post("/api/v1/hr-payroll/employees", {
            full_name: form.querySelector("#emp-name").value.trim(),
            national_id: form.querySelector("#emp-nin").value.trim(),
            phone_number: form.querySelector("#emp-phone").value.trim(),
            email: form.querySelector("#emp-email").value.trim() || null,
            position: form.querySelector("#emp-pos").value.trim(),
            department: form.querySelector("#emp-dept").value.trim() || null,
            employment_date: form.querySelector("#emp-date").value,
            basic_salary: Number(form.querySelector("#emp-salary").value),
            allowances: Number(form.querySelector("#emp-allow").value || 0),
            tin: form.querySelector("#emp-tin").value.trim() || null,
            nssf_number: form.querySelector("#emp-nssf").value.trim() || null,
            mobile_money_number: form.querySelector("#emp-momo").value.trim() || null,
            bank_account_number: form.querySelector("#emp-bank").value.trim() || null,
            member_id: linkedMember ? linkedMember.id : null,
          });
          showToast("Employee created successfully.", "success");
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

/* ==========================================================================
   2. PAYROLL RUNS TAB
   ========================================================================== */
async function renderPayrollRunsTab(content, root) {
  const runs = await api.get("/api/v1/hr-payroll/runs").catch(() => []);

  const card = el("div", { class: "card" }, [
    el("div", { class: "card-header" }, [
      el("h3", {}, "Staff Payroll Runs"),
      el("button", { class: "btn btn-primary btn-sm", onclick: () => openCreatePayrollRunModal(content, root) }, "+ Create Payroll Run"),
    ]),
    dataTable(
      [
        { header: "Period", render: (r) => el("strong", {}, r.period) },
        { header: "Status", render: (r) => (r.status === "processed" ? badge("approved") : badge("pending")) },
        { header: "Total Gross", className: "ledger", render: (r) => `UGX ${formatMoney(r.total_gross)}` },
        { header: "PAYE Tax", className: "ledger", render: (r) => `UGX ${formatMoney(r.total_paye)}` },
        { header: "NSSF (Emp/Empr)", className: "ledger", render: (r) => `UGX ${formatMoney(Number(r.total_nssf_employee) + Number(r.total_nssf_employer))}` },
        { header: "Loan Deductions", className: "ledger", render: (r) => `UGX ${formatMoney(r.total_loan_deductions)}` },
        { header: "Total Net Pay", className: "ledger", render: (r) => el("strong", {}, `UGX ${formatMoney(r.total_net)}`) },
        { header: "Created Date", render: (r) => formatDate(r.created_at) },
        {
          header: "",
          render: (r) => el("button", { class: "btn btn-secondary btn-sm", onclick: () => openPayrollRunDetailModal(r.id, content, root) }, "View Payslips"),
        },
      ],
      runs,
      "No payroll runs recorded yet. Click '+ Create Payroll Run' to run monthly payroll."
    ),
  ]);

  mount(content, card);
}

function openCreatePayrollRunModal(content, root) {
  openModal("New Monthly Payroll Run", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const employeesHolder = el("div", { style: "max-height: 250px; overflow-y: auto; border: 1px solid var(--line); border-radius: 6px; padding: 10px; margin-top: 6px;" });
    const todayPeriod = new Date().toISOString().slice(0, 7); // e.g. 2026-07

    // Fetch active employees
    api.get("/api/v1/hr-payroll/employees")
      .then((employees) => {
        if (!employees.length) {
          employeesHolder.innerHTML = "<p class='muted small'>No active employees found. Please add staff employees first.</p>";
          return;
        }

        const selectAllCheckbox = el("input", { type: "checkbox", checked: true });
        const headerRow = el("div", { style: "display:flex; align-items:center; gap:8px; border-bottom:1px solid var(--line); padding-bottom:6px; margin-bottom:8px; font-weight:600;" }, [
          selectAllCheckbox,
          el("span", {}, "Select All Active Employees"),
        ]);

        const empRows = employees.map((emp) => {
          const cb = el("input", { type: "checkbox", value: emp.id, checked: true, class: "emp-select-cb" });
          return el("div", { style: "display:flex; align-items:center; justify-space-between; padding: 4px 0;" }, [
            el("label", { style: "display:flex; align-items:center; gap:8px; font-weight:normal; margin:0; cursor:pointer;" }, [
              cb,
              el("span", {}, `${emp.employee_number} — ${emp.full_name} (${emp.position})`),
            ]),
            el("span", { class: "ledger small muted" }, `Gross: UGX ${formatMoney(Number(emp.basic_salary) + Number(emp.allowances))}`),
          ]);
        });

        selectAllCheckbox.addEventListener("change", (e) => {
          empRows.forEach((r) => {
            const cb = r.querySelector(".emp-select-cb");
            if (cb) cb.checked = e.target.checked;
          });
        });

        mount(employeesHolder, [headerRow, ...empRows]);
      })
      .catch((err) => {
        employeesHolder.innerHTML = `<p class='form-error'>Failed to load employees: ${err.message}</p>`;
      });

    const form = el("form", {}, [
      el("div", { class: "field" }, [
        el("label", {}, "Payroll Period (YYYY-MM)"),
        el("input", { id: "pr-period", value: todayPeriod, placeholder: "2026-07", required: true }),
      ]),
      el("div", { class: "field" }, [
        el("label", {}, "Include Staff Employees"),
        employeesHolder,
      ]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Generate Draft Run"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;

      const checkedCbs = [...employeesHolder.querySelectorAll(".emp-select-cb:checked")];
      if (!checkedCbs.length) {
        errorEl.textContent = "Select at least one staff employee for this payroll run.";
        errorEl.hidden = false;
        return;
      }

      try {
        const run = await api.post("/api/v1/hr-payroll/runs", {
          period: form.querySelector("#pr-period").value.trim(),
          employee_ids: checkedCbs.map((cb) => cb.value),
        });
        showToast(`Draft payroll run created for period ${run.period}.`, "success");
        closeFn();
        openPayrollRunDetailModal(run.id, content, root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

async function openPayrollRunDetailModal(runId, content, root) {
  const [run, employees] = await Promise.all([
    api.get(`/api/v1/hr-payroll/runs/${runId}`),
    api.get("/api/v1/hr-payroll/employees").catch(() => []),
  ]);

  const empMap = new Map(employees.map((e) => [e.id, e]));

  openModal(`Payroll Run — ${run.period}`, (closeFn) => {
    const isProcessed = run.status === "processed";

    // Summary metrics panel
    const summaryCard = el("div", { class: "card", style: "background: var(--pine-50); border: 1px solid var(--pine-200); margin-bottom: 20px; font-size: 13px;" }, [
      el("div", { style: "display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;" }, [
        el("h4", { style: "margin:0; color: var(--pine-900);" }, `Payroll Period: ${run.period}`),
        badge(isProcessed ? "approved" : "pending"),
      ]),
      el("div", { class: "grid grid-3", style: "gap: 12px;" }, [
        el("div", {}, [el("div", { class: "muted" }, "Total Gross Payroll"), el("div", { style: "font-weight:bold; font-size: 14px;" }, `UGX ${formatMoney(run.total_gross)}`)]),
        el("div", {}, [el("div", { class: "muted" }, "PAYE Tax"), el("div", { style: "font-weight:bold; font-size: 14px;" }, `UGX ${formatMoney(run.total_paye)}`)]),
        el("div", {}, [el("div", { class: "muted" }, "NSSF (Emp + Empr)"), el("div", { style: "font-weight:bold; font-size: 14px;" }, `UGX ${formatMoney(Number(run.total_nssf_employee) + Number(run.total_nssf_employer))}`)]),
        el("div", {}, [el("div", { class: "muted" }, "Loan Deductions"), el("div", { style: "font-weight:bold; font-size: 14px;" }, `UGX ${formatMoney(run.total_loan_deductions)}`)]),
        el("div", {}, [el("div", { class: "muted" }, "Total Net Salary"), el("div", { style: "font-weight:bold; font-size: 15px; color: var(--pine-700);" }, `UGX ${formatMoney(run.total_net)}`)]),
        el("div", {}, [el("div", { class: "muted" }, "Processed Date"), el("div", { style: "font-weight:600;" }, run.processed_at ? formatDateTime(run.processed_at) : "Draft / Unprocessed")]),
      ]),
    ]);

    // Overrides inputs state for draft run
    const overrideInputs = new Map();

    const payslipTable = dataTable(
      [
        {
          header: "Employee",
          render: (ps) => {
            const emp = empMap.get(ps.employee_id);
            return emp ? el("strong", {}, `${emp.full_name} (${emp.employee_number})`) : ps.employee_id;
          },
        },
        { header: "Basic Salary", className: "ledger", render: (ps) => `UGX ${formatMoney(ps.basic_salary)}` },
        { header: "Allowances", className: "ledger", render: (ps) => `UGX ${formatMoney(ps.allowances)}` },
        { header: "Gross Pay", className: "ledger", render: (ps) => `UGX ${formatMoney(ps.gross_pay)}` },
        { header: "PAYE Tax", className: "ledger", render: (ps) => `UGX ${formatMoney(ps.paye_amount)}` },
        { header: "NSSF Emp", className: "ledger", render: (ps) => `UGX ${formatMoney(ps.nssf_employee_amount)}` },
        {
          header: "Loan Deduction",
          className: "ledger",
          render: (ps) => {
            if (!isProcessed) {
              const input = el("input", {
                type: "number",
                step: "0.01",
                value: ps.loan_deduction_amount ? String(ps.loan_deduction_amount) : "",
                placeholder: "0.00",
                style: "width: 110px; text-align: right; padding: 4px;",
              });
              overrideInputs.set(ps.employee_id, input);
              return input;
            }
            return `UGX ${formatMoney(ps.loan_deduction_amount)}`;
          },
        },
        { header: "Net Salary", className: "ledger", render: (ps) => el("strong", {}, `UGX ${formatMoney(ps.net_pay)}`) },
        {
          header: "Payment",
          render: (ps) => {
            if (!isProcessed) return el("span", { class: "muted small" }, "Pending Process");
            if (ps.payment_status === "paid") {
              return badge("paid");
            }
            return el("button", {
              class: "btn btn-primary btn-sm",
              onclick: async () => {
                try {
                  await api.post(`/api/v1/hr-payroll/payslips/${ps.id}/pay`);
                  showToast("Payslip marked as paid.", "success");
                  closeFn();
                  openPayrollRunDetailModal(run.id, content, root);
                } catch (err) {
                  showToast(err.message, "error");
                }
              },
            }, "Mark Paid");
          },
        },
      ],
      run.payslips || [],
      "No payslips in this run."
    );

    const actionsHolder = el("div", { style: "display:flex; justify-content:flex-end; gap:10px; margin-top:20px;" }, [
      el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Close"),
      !isProcessed
        ? el(
            "button",
            {
              type: "button",
              class: "btn btn-primary",
              onclick: async () => {
                const confirmProcess = await confirmDialog(
                  `Are you sure you want to process payroll for ${run.period}? This will compute PAYE & NSSF taxes, post double-entry ledger postings to accounting, and lock this run as processed.`,
                  "Confirm & Process Payroll",
                  false
                );
                if (!confirmProcess) return;

                const overrides = [];
                for (const [empId, inputEl] of overrideInputs.entries()) {
                  const val = inputEl.value.trim();
                  if (val !== "") {
                    overrides.push({ employee_id: empId, loan_deduction_amount: Number(val) });
                  }
                }

                try {
                  await api.post(`/api/v1/hr-payroll/runs/${run.id}/process`, { overrides });
                  showToast(`Payroll run ${run.period} successfully processed and posted to GL!`, "success");
                  closeFn();
                  await renderTabContent(content, root);
                } catch (err) {
                  showToast(err.message, "error");
                }
              },
            },
            "⚡ Process & Post Payroll GL"
          )
        : el("span", {}),
    ]);

    return [summaryCard, el("h4", { style: "margin-top:15px; margin-bottom:8px;" }, "Payslips Breakdown"), payslipTable, actionsHolder];
  });
}

/* ==========================================================================
   3. EXTERNAL EMPLOYERS TAB (RETAINED)
   ========================================================================== */
async function renderEmployersTab(content, root) {
  const employers = await api.get("/api/v1/payroll/employers").catch(() => []);
  const card = el("div", { class: "card" }, [
    el("div", { class: "card-header" }, [
      el("h3", {}, "External Employers"),
      el("button", { class: "btn btn-primary btn-sm", onclick: () => openEmployerModal(content, root) }, "+ New employer"),
    ]),
    dataTable(
      [
        { header: "Name", render: (e) => e.name },
        { header: "Contact", render: (e) => e.contact_person || "—" },
        { header: "Phone", render: (e) => e.phone_number || "—" },
      ],
      employers,
      "No external employers yet."
    ),
  ]);
  mount(content, card);
}

function openEmployerModal(content, root) {
  openModal("New external employer", (closeFn) => {
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

/* ==========================================================================
   4. DEDUCTION FILES TAB (RETAINED)
   ========================================================================== */
async function renderFilesTab(content, root) {
  const employers = await api.get("/api/v1/payroll/employers").catch(() => []);
  if (!employers.length) {
    mount(
      content,
      el("div", { class: "card empty-state" }, [
        el("h4", {}, "No external employers yet"),
        el("p", {}, "Add an employer on the “External Employers” tab first."),
      ])
    );
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
      (m) => {
        picked = m;
      }
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
      if (!r.member) {
        errorEl.textContent = "Every line needs a member selected.";
        errorEl.hidden = false;
        return;
      }
      if (!r.amount) {
        errorEl.textContent = "Every line needs an amount.";
        errorEl.hidden = false;
        return;
      }
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
    mount(
      resultHolder,
      el("div", { class: "card" }, [
        el("h3", {}, `Reconciliation result — ${file.period}`),
        el("p", { class: "muted" }, `Total: UGX ${formatMoney(file.total_amount)}`),
        dataTable(
          [
            { header: "Amount", className: "ledger", render: (d) => formatMoney(d.amount) },
            { header: "Status", render: (d) => badge(d.status) },
            { header: "Note", render: (d) => d.exception_reason || "—" },
          ],
          file.deductions
        ),
      ])
    );
  }

  mount(content, [el("div", { class: "card" }, [el("h3", {}, "Upload external payroll deduction file"), form]), resultHolder]);
}
