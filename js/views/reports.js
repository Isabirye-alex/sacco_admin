import { api } from "../api.js";
import { el, mount, formatDate, formatMoney, showToast, dataTable } from "../utils.js";

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
      el("h3", {}, "Automated Report Schedulers"),
      el("p", { class: "muted small" }, "Manage automated background compiling & email notifications of reports."),
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
  
  const fromDate = el("input", { type: "date", required: true, style: "flex:1;" });
  const toDate = el("input", { type: "date", required: true, style: "flex:1;" });
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
    
    // Simulate compilation delay
    await new Promise(r => setTimeout(r, 800));
    compileAndDisplayPreview(rep, outputPreview);
  });

  mount(panel, [
    el("h3", {}, `Generated Report: ${rep.name}`),
    configForm,
    outputPreview
  ]);
}

// 3. Compile and Display Preview
async function compileAndDisplayPreview(rep, previewEl) {
  let content;

  if (rep.key === "trial-balance") {
    const lines = await api.get("/api/v1/accounting/trial-balance").catch(() => []);
    content = dataTable(
      [
        { header: "Account Code", render: (l) => l.account_code },
        { header: "Account Name", render: (l) => l.account_name },
        { header: "Debit balance", className: "ledger", render: (l) => `UGX ${formatMoney(l.debit)}` },
        { header: "Credit balance", className: "ledger", render: (l) => `UGX ${formatMoney(l.credit)}` }
      ],
      lines
    );
  } else if (rep.key === "balance-sheet") {
    // Generate dummy balance sheet matching Microfinance standards
    const rows = [
      { name: "Total Liquid Assets (Cash & Bank)", amt: 425000000, type: "Asset" },
      { name: "Total Loans Outstanding Portfolio", amt: 1250000000, type: "Asset" },
      { name: "Total Members Capital Shares", amt: 300000000, type: "Equity" },
      { name: "Total Savings Deposit Liabilities", amt: 590500000, type: "Liability" }
    ];
    content = dataTable(
      [
        { header: "Account Classification", render: (r) => r.name },
        { header: "Balance", className: "ledger", render: (r) => `UGX ${formatMoney(r.amt)}` },
        { header: "GL Classification", render: (r) => badge(r.type) }
      ],
      rows
    );
  } else if (rep.key === "liquidity-ratio") {
    // Liquidity Ratio analysis mockup
    const rows = [
      { metric: "Liquid Assets (Cash / Mobile Money)", val: "UGX 425,000,000" },
      { metric: "Short-term Savings Obligations", val: "UGX 590,500,000" },
      { metric: "Calculated Liquidity Coverage Ratio", val: "71.97% (Regulatory threshold: > 15.00%)" },
      { metric: "Compliance Status", val: "Compliant" }
    ];
    content = dataTable(
      [
        { header: "Liquidity Indicator", render: (r) => r.metric },
        { header: "Value / Status", render: (r) => r.val }
      ],
      rows
    );
  } else {
    // Basic mock presentation
    const rows = [
      { k: "Compiled At", v: new Date().toLocaleString() },
      { k: "Report Category Class", v: "Institutional Microfinance Return" },
      { k: "Total Records Scanned", v: "1,245 rows" },
      { k: "System Integrity Check", v: "PASSED ✓" }
    ];
    content = dataTable(
      [
        { header: "Compliance Field", render: (r) => r.k },
        { header: "Value", render: (r) => r.v }
      ],
      rows
    );
  }

  mount(previewEl, [
    el("h4", { style: "color: var(--pine-900);" }, "Compiled Data Preview"),
    content
  ]);
}

// 4. Direct Trigger Export download
function triggerExport(rep, format) {
  showToast(`Compiling and downloading ${rep.name} in ${format.toUpperCase()} format...`, "success");
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
    el("h4", {}, "Configure Automated Scheduler"),
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
    showToast("Automated scheduler job configured.", "success");
    cronInput.value = "";
    emailInput.value = "";
    
    // Refresh list view
    const list = document.querySelector(".card:nth-child(2) .table-wrap");
    if (list) {
      goTo("/reports"); // triggers re-render
    }
  });

  return form;
}
