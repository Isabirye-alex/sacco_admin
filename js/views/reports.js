import { api } from "../api.js";
import { el, mount, formatDate, formatMoney, showToast, dataTable, badge } from "../utils.js";
import { goTo, refreshCurrentRoute } from "../router.js";
import { exportToCsv, exportToJson } from "../ui.js";

// Schedulers list saved in localStorage
let schedules = JSON.parse(localStorage.getItem("sacco_report_schedules") || "[]");

export async function renderReports(root) {
  const container = el("div", { class: "grid grid-2", style: "gap: 20px;" });
  
  const leftCol = el("div", {}, [
    el("div", { class: "card" }, [
      el("h3", {}, "Reports Library"),
      el("p", { class: "muted small" }, "Select an institutional template to configure parameters and generate sheets."),
      renderReportAccordion()
    ]),
    el("div", { class: "card", style: "margin-top: 20px;" }, [
      el("h3", {}, "Report Reminders"),
      el("p", { class: "muted small" }, "Saved locally in this browser as a to-do list \u2014 these don't actually run on a server or send email yet. Treat them as personal reminders, not automated delivery."),
      renderSchedulerList(),
      renderScheduleForm()
    ])
  ]);

  const rightCol = el("div", { class: "card", id: "report-view-panel" }, [
    el("h3", {}, "Report Viewer / Preview"),
    el("div", { class: "table-empty" }, "No report generated yet. Select a template on the left and click 'Generate'.")
  ]);

  mount(container, [leftCol, rightCol]);
  mount(root, container);
}

// 1. Report Library Accordion layout
function renderReportAccordion() {
  const library = [
    {
      category: "Financial Statements",
      reports: [
        { name: "Balance Sheet", key: "balance-sheet", desc: "Summarizes Assets, Liabilities, and Equity balances." },
        { name: "Trial Balance", key: "trial-balance", desc: "Double-entry check of debits vs. credits across all accounts." },
        { name: "Income Statement", key: "income-statement", desc: "Covers revenue, expenses, and net profit margins over time." }
      ]
    },
    {
      category: "Regulatory & Compliance Reports",
      reports: [
        { name: "Microfinance Regulatory Authority Return", key: "mra-return", desc: "Standard statutory compliance report for cooperative credit unions." },
        { name: "Liquidity Ratio Report", key: "liquidity-ratio", desc: "Validates liquid assets vs. short-term liabilities (Required > 15%)." },
        { name: "Capital Adequacy Return", key: "capital-adequacy", desc: "Evaluates net capital relative to risk-adjusted assets." }
      ]
    },
    {
      category: "Performance & Growth Reports",
      reports: [
        { name: "Member Acquisition & Growth", key: "member-growth", desc: "Tracks member registrations and activity trends." },
        { name: "Loan Disbursement vs. Recovery", key: "loan-recovery-perf", desc: "Measures credit turnover and collection efficiency." }
      ]
    }
  ];

  const accordion = el("div", { class: "accordion", style: "margin-top: 15px;" });

  library.forEach(cat => {
    const listHolder = el("div", { style: "display: none; padding-left: 10px; margin-top: 10px;" });
    const header = el("div", {
      class: "accordion-header",
      style: "font-weight: bold; padding: 10px; background: var(--pine-50); margin-bottom: 8px; border-radius: 6px; cursor: pointer; border: 1px solid var(--pine-100); display:flex; justify-content:space-between;"
    }, [
      el("span", {}, cat.category),
      el("span", {}, "▼")
    ]);

    header.addEventListener("click", () => {
      const open = listHolder.style.display === "block";
      listHolder.style.display = open ? "none" : "block";
      header.querySelector("span:last-child").textContent = open ? "▼" : "▲";
    });

    cat.reports.forEach(rep => {
      const row = el("div", {
        style: "padding: 10px; border-bottom: 1px solid var(--line); cursor: pointer; transition: background 0.2s;",
        class: "report-item-row"
      }, [
        el("div", { style: "font-weight: 600; color: var(--pine-800);" }, rep.name),
        el("div", { class: "muted small" }, rep.desc)
      ]);
      row.addEventListener("click", () => openReportGeneratorPanel(rep));
      listHolder.appendChild(row);
    });

    accordion.appendChild(header);
    accordion.appendChild(listHolder);
  });

  return accordion;
}

// 2. Open generator parameters and preview panel
function openReportGeneratorPanel(rep) {
  const panel = document.getElementById("report-view-panel");
  
  const fromDate = el("input", { type: "date", style: "flex:1;" });
  const toDate = el("input", { type: "date", style: "flex:1;" });
  const formatSelect = el("select", { class: "select-sm" }, [
    el("option", { value: "pdf" }, "PDF Document"),
    el("option", { value: "csv" }, "CSV Spreadsheet"),
    el("option", { value: "excel" }, "Excel Workbook")
  ]);

  const configForm = el("form", { style: "margin-top: 15px; background: var(--pine-50); padding: 15px; border-radius: 8px; border: 1px solid var(--pine-200);" }, [
    el("h4", { style: "margin-top:0; color: var(--pine-900);" }, `Parameters: ${rep.name}`),
    el("div", { class: "field-row" }, [
      el("div", { class: "field", style: "flex:1" }, [el("label", {}, "From Date"), fromDate]),
      el("div", { class: "field", style: "flex:1" }, [el("label", {}, "To Date"), toDate])
    ]),
    el("div", { class: "field" }, [el("label", {}, "Target Export Format"), formatSelect]),
    el("div", { style: "display:flex; gap:10px; margin-top:15px;" }, [
      el("button", { type: "submit", class: "btn btn-primary btn-sm" }, "Compile & Display"),
      el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => triggerExport(rep, formatSelect.value) }, "Direct Download / Export")
    ])
  ]);

  const outputPreview = el("div", { style: "margin-top: 20px;", id: "compiled-output-preview" });

  configForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    mount(outputPreview, el("div", { class: "spinner" }));
    compileAndDisplayPreview(rep, outputPreview, fromDate.value, toDate.value);
  });

  mount(panel, [
    el("h3", {}, `Generated Report: ${rep.name}`),
    configForm,
    outputPreview
  ]);
}

// 3. Compile and Display Preview - pulls REAL data from the backend for
// every report. (Previously most of these were hardcoded dummy numbers -
// only Trial Balance ever called the real API.)
async function compileAndDisplayPreview(rep, previewEl, fromDate, toDate) {
  let content;
  const asOf = toDate || undefined;

  try {
    if (rep.key === "trial-balance") {
      const lines = await api.get("/api/v1/accounting/trial-balance");
      content = dataTable(
        [
          { header: "Account Code", render: (l) => l.account_code },
          { header: "Account Name", render: (l) => l.account_name },
          { header: "Debit balance", className: "ledger", render: (l) => `UGX ${formatMoney(l.debit)}` },
          { header: "Credit balance", className: "ledger", render: (l) => `UGX ${formatMoney(l.credit)}` },
        ],
        lines, "No posted journal activity yet."
      );
    } else if (rep.key === "balance-sheet") {
      const data = await api.get(`/api/v1/reports/balance-sheet${asOf ? `?as_of=${asOf}` : ""}`);
      const rows = [
        ...data.assets.map((a) => ({ ...a, type: "Asset" })),
        ...data.liabilities.map((a) => ({ ...a, type: "Liability" })),
        ...data.equity.map((a) => ({ ...a, type: "Equity" })),
      ];
      content = el("div", {}, [
        dataTable(
          [
            { header: "Account", render: (r) => `${r.code} \u2014 ${r.name}` },
            { header: "Balance", className: "ledger", render: (r) => `UGX ${formatMoney(r.balance)}` },
            { header: "Classification", render: (r) => badge(r.type) },
          ],
          rows, "No account balances yet - post some transactions first."
        ),
        el("p", { class: "muted small", style: "margin-top:10px" },
          `Total assets UGX ${formatMoney(data.total_assets)} \u2014 Total liabilities + equity UGX ${formatMoney(Number(data.total_liabilities) + Number(data.total_equity))} ${data.balances ? "\u2713 Balanced" : "\u26a0 Does not balance - check your journal entries"}`
        ),
      ]);
    } else if (rep.key === "income-statement") {
      if (!fromDate || !toDate) throw new Error("Select both a From and To date for the Income Statement.");
      const data = await api.get(`/api/v1/reports/income-statement?start_date=${fromDate}&end_date=${toDate}`);
      const rows = [
        ...data.income.map((r) => ({ ...r, type: "Income" })),
        ...data.expenses.map((r) => ({ ...r, type: "Expense" })),
      ];
      content = el("div", {}, [
        dataTable(
          [
            { header: "Account", render: (r) => `${r.code} \u2014 ${r.name}` },
            { header: "Amount", className: "ledger", render: (r) => `UGX ${formatMoney(r.amount)}` },
            { header: "Type", render: (r) => badge(r.type) },
          ],
          rows, "No income/expense activity in this period."
        ),
        el("p", { class: "muted small", style: "margin-top:10px" },
          `Total income UGX ${formatMoney(data.total_income)} \u2014 Total expenses UGX ${formatMoney(data.total_expenses)} \u2014 Net surplus UGX ${formatMoney(data.net_surplus)}`
        ),
      ]);
    } else if (rep.key === "liquidity-ratio") {
      const data = await api.get(`/api/v1/reports/liquidity-ratio${asOf ? `?as_of=${asOf}` : ""}`);
      content = el("div", {}, [
        dataTable(
          [
            { header: "Liquidity Indicator", render: (r) => r.metric },
            { header: "Value", render: (r) => r.val },
          ],
          [
            { metric: "Liquid assets (cash + mobile money)", val: `UGX ${formatMoney(data.liquid_assets)}` },
            { metric: "Total deposit liabilities", val: `UGX ${formatMoney(data.total_deposit_liabilities)}` },
            { metric: "Liquidity ratio", val: `${data.liquidity_ratio_pct}%` },
          ]
        ),
        el("p", { class: "form-error", style: "margin-top:10px" },
          "This is a simplified internal proxy (liquid assets \u00f7 deposit liabilities), not an official SASRA-verified formula. Confirm against current regulatory guidance before using this for an actual filing."
        ),
      ]);
    } else if (rep.key === "capital-adequacy") {
      const data = await api.get(`/api/v1/reports/capital-adequacy${asOf ? `?as_of=${asOf}` : ""}`);
      content = el("div", {}, [
        dataTable(
          [
            { header: "Indicator", render: (r) => r.metric },
            { header: "Value", render: (r) => r.val },
          ],
          [
            { metric: "Total equity", val: `UGX ${formatMoney(data.total_equity)}` },
            { metric: "Total assets", val: `UGX ${formatMoney(data.total_assets)}` },
            { metric: "Capital adequacy ratio", val: `${data.capital_adequacy_ratio_pct}%` },
          ]
        ),
        el("p", { class: "form-error", style: "margin-top:10px" },
          "This is a simplified proxy (equity \u00f7 total assets), not SASRA's official tiered-capital / risk-weighted-assets formula. Confirm against current regulatory guidance before using this for an actual filing."
        ),
      ]);
    } else if (rep.key === "member-growth") {
      const data = await api.get("/api/v1/reports/member-growth?months=12");
      content = el("div", {}, [
        dataTable(
          [{ header: "Month", render: (r) => r.month }, { header: "New members", render: (r) => r.new_members }],
          data.monthly_new_members, "No new members in this window."
        ),
        el("p", { class: "muted small", style: "margin-top:10px" },
          `Total members: ${data.total_members} \u2014 ` +
          Object.entries(data.by_status).map(([s, c]) => `${s}: ${c}`).join(", ")
        ),
      ]);
    } else if (rep.key === "loan-recovery-perf") {
      if (!fromDate || !toDate) throw new Error("Select both a From and To date for this report.");
      const data = await api.get(`/api/v1/reports/loan-disbursement-recovery?start_date=${fromDate}&end_date=${toDate}`);
      content = dataTable(
        [{ header: "Metric", render: (r) => r.metric }, { header: "Value", render: (r) => r.val }],
        [
          { metric: "Loans disbursed (count)", val: data.loans_disbursed_count },
          { metric: "Total disbursed", val: `UGX ${formatMoney(data.total_disbursed)}` },
          { metric: "Total repaid in period", val: `UGX ${formatMoney(data.total_repaid_in_period)}` },
          { metric: "Active loans", val: data.active_loans },
          { metric: "Closed loans", val: data.closed_loans },
          { metric: "Defaulted loans", val: data.defaulted_loans },
        ]
      );
    } else if (rep.key === "mra-return") {
      content = await buildComplianceReportPanel();
    } else {
      content = el("p", { class: "muted" }, "Unknown report type.");
    }
  } catch (err) {
    content = el("p", { class: "form-error" }, err.message || "Failed to generate this report.");
  }

  mount(previewEl, [
    el("h4", { style: "color: var(--pine-900);" }, "Compiled Data Preview"),
    content,
  ]);
}

// MRA/regulatory return: logs a real ComplianceReport record (this system
// tracks report metadata + submission status - it doesn't author the
// actual regulatory filing document for you).
async function buildComplianceReportPanel() {
  const reports = await api.get("/api/v1/risk/compliance-reports").catch(() => []);
  const holder = el("div", {});

  const logForm = el("form", { style: "margin-bottom:16px;background:var(--pine-50);padding:12px;border-radius:8px" }, [
    el("div", { class: "field-row" }, [
      el("div", { class: "field" }, [el("label", {}, "Report type"), el("input", { id: "cr-type", value: "sasra_quarterly", required: true })]),
      el("div", { class: "field" }, [el("label", {}, "Period"), el("input", { id: "cr-period", placeholder: "e.g. 2026-Q2", required: true })]),
    ]),
    el("div", { class: "field" }, [el("label", {}, "File reference (optional)"), el("input", { id: "cr-file" })]),
    el("div", { class: "field" }, [el("label", {}, "Summary (optional)"), el("textarea", { id: "cr-summary", rows: 2 })]),
    el("button", { type: "submit", class: "btn btn-primary btn-sm" }, "Log this report"),
  ]);
  logForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/v1/risk/compliance-reports", {
        report_type: logForm.querySelector("#cr-type").value,
        period: logForm.querySelector("#cr-period").value,
        file_reference: logForm.querySelector("#cr-file").value || null,
        summary: logForm.querySelector("#cr-summary").value || null,
      });
      showToast("Compliance report logged.", "success");
      refreshCurrentRoute();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  const table = dataTable(
    [
      { header: "Type", render: (r) => r.report_type },
      { header: "Period", render: (r) => r.period },
      { header: "Status", render: (r) => badge(r.submitted ? "submitted" : "pending") },
      {
        header: "",
        render: (r) => (!r.submitted
          ? el("button", {
              class: "btn btn-secondary btn-sm",
              onclick: async () => {
                await api.post(`/api/v1/risk/compliance-reports/${r.id}/submit`);
                showToast("Marked submitted.", "success");
                refreshCurrentRoute();
              },
            }, "Mark submitted")
          : ""),
      },
    ],
    reports, "No compliance reports logged yet."
  );

  mount(holder, [logForm, table]);
  return holder;
}

// 4. Direct Trigger Export download
function triggerExport(rep, format) {
  const preview = document.getElementById("compiled-output-preview");
  const table = preview?.querySelector(".table-wrap table");
  if (!table) {
    showToast("Generate and display the report first, then click export.", "error");
    return;
  }

  const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent.trim());
  const rows = Array.from(table.querySelectorAll("tbody tr")).map((tr) =>
    Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim())
  );

  const baseName = `${rep.key}-${new Date().toISOString().slice(0, 10)}`;

  if (format === "csv") {
    exportToCsv(`${baseName}.csv`, headers, rows);
  } else if (format === "json") {
    const objects = rows.map((r) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });
    exportToJson(`${baseName}.json`, objects);
  } else {
    showToast(`${format.toUpperCase()} export uses JSON fallback.`, "info");
    const fallback = rows.length
      ? headers.reduce((o, h, i) => (o[h] = rows.map((r) => r[i]), o), {})
      : [];
    exportToJson(`${baseName}.json`, fallback);
  }
}

// 5. Automated Schedulers List
function renderSchedulerList() {
  const holder = el("div", { style: "margin-top: 15px;" });
  
  function refreshList() {
    holder.innerHTML = "";
    if (!schedules.length) {
      holder.appendChild(el("div", { class: "table-empty" }, "No automated report schedules configured."));
      return;
    }

    const table = dataTable(
      [
        { header: "Report Title", render: (s) => s.reportName },
        { header: "Frequency", render: (s) => s.cronString },
        { header: "Recipient Manager", render: (s) => s.recipient },
        {
          header: "",
          render: (s) => el("button", { class: "btn btn-ghost btn-sm", onclick: () => removeSchedule(s.id) }, "Delete")
        }
      ],
      schedules
    );
    holder.appendChild(table);
  }

  function removeSchedule(id) {
    schedules = schedules.filter(s => s.id !== id);
    localStorage.setItem("sacco_report_schedules", JSON.stringify(schedules));
    showToast("Schedule disabled.", "success");
    refreshList();
  }

  refreshList();
  holder.refreshList = refreshList;
  return holder;
}

// 6. Schedule creation form
function renderScheduleForm() {
  const errorEl = el("p", { class: "form-error", hidden: true });
  const selectReport = el("select", {}, [
    el("option", { value: "Trial Balance" }, "Trial Balance"),
    el("option", { value: "Balance Sheet" }, "Balance Sheet"),
    el("option", { value: "Liquidity Ratio" }, "Liquidity Ratio")
  ]);
  const cronInput = el("input", { placeholder: "e.g. Every Friday at 5:00 PM", required: true });
  const emailInput = el("input", { type: "email", placeholder: "manager@sacco.co.ug", required: true });

  const form = el("form", { style: "margin-top: 20px; border-top: 1px solid var(--line); padding-top: 15px;" }, [
    el("h4", {}, "Add a Reminder"),
    el("div", { class: "field" }, [el("label", {}, "Report Title"), selectReport]),
    el("div", { class: "field-row" }, [
      el("div", { class: "field" }, [el("label", {}, "Frequency / Timing"), cronInput]),
      el("div", { class: "field" }, [el("label", {}, "Recipient Email"), emailInput])
    ]),
    errorEl,
    el("button", { type: "submit", class: "btn btn-secondary btn-sm" }, "Add Schedule Job")
  ]);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const newJob = {
      id: Date.now().toString(),
      reportName: selectReport.value,
      cronString: cronInput.value,
      recipient: emailInput.value
    };
    schedules.push(newJob);
    localStorage.setItem("sacco_report_schedules", JSON.stringify(schedules));
    showToast("Reminder saved.", "success");
    cronInput.value = "";
    emailInput.value = "";
    refreshCurrentRoute();
  });

  return form;
}
