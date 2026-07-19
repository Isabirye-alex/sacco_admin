import { api } from "../api.js";
import { el, mount, formatMoney, titleCase, badge, dataTable, openModal, confirmDialog, showToast } from "../utils.js";

let statusFilter = "";

export async function renderRisk(root) {
  mount(root, el("div", { class: "spinner" }));

  const [parResult, flags] = await Promise.all([
    api.get("/api/v1/risk/portfolio-at-risk").catch(() => null),
    api.get(`/api/v1/risk/flags${statusFilter ? `?flag_status=${statusFilter}` : ""}`).catch(() => []),
  ]);

  const parCard = parResult
    ? el("div", { class: "card stat-card" }, [
        el("div", { class: "label" }, "Portfolio at Risk"),
        el("div", { class: "value ledger" }, `${Number(parResult.portfolio_at_risk_pct).toFixed(2)}%`),
        el("div", { class: "sub" }, `UGX ${formatMoney(parResult.overdue_outstanding)} overdue of UGX ${formatMoney(parResult.total_outstanding)} outstanding`),
      ])
    : null;

  const dormancyCard = el("div", { class: "card" }, [
    el("h3", {}, "Dormancy sweep"),
    el("p", { class: "muted" }, "Runs automatically every 24 hours. Trigger it manually to flag inactive members right now."),
    el("button", {
      class: "btn btn-secondary btn-sm",
      onclick: async () => {
        const ok = await confirmDialog("Run the dormancy sweep now? Members inactive beyond the threshold will be marked dormant.", "Run sweep", false);
        if (!ok) return;
        try {
          const result = await api.post("/api/v1/risk/dormancy-sweep");
          showToast(`${result.members_flagged_dormant} member(s) flagged dormant.`, "success");
        } catch (err) {
          showToast(err.message, "error");
        }
      },
    }, "Run dormancy sweep now"),
  ]);

  const penaltyCard = el("div", { class: "card" }, [
    el("h3", {}, "Overdue loan penalties"),
    el("p", { class: "muted" }, "Runs automatically every 24 hours. Applies a one-time penalty to overdue, unpaid installments - already-penalized installments are skipped, so this is safe to run more than once."),
    el("button", {
      class: "btn btn-secondary btn-sm",
      onclick: async () => {
        const ok = await confirmDialog("Apply penalties to overdue installments now?", "Apply penalties", false);
        if (!ok) return;
        try {
          const result = await api.post("/api/v1/risk/apply-penalties");
          showToast(`Penalized ${result.installments_penalized} installment(s) across ${result.loans_affected} loan(s), total UGX ${formatMoney(result.total_penalty)}.`, "success");
        } catch (err) {
          showToast(err.message, "error");
        }
      },
    }, "Apply overdue penalties now"),
  ]);

  const toolbar = el("div", { class: "toolbar" }, [
    el(
      "select",
      { onchange: async (e) => { statusFilter = e.target.value; await renderRisk(root); } },
      ["", "open", "under_review", "resolved", "escalated"].map((s) => el("option", { value: s, selected: s === statusFilter }, s ? titleCase(s) : "All statuses")),
    ),
    el("button", { class: "btn btn-primary btn-sm", onclick: () => openRaiseFlagModal(root) }, "+ Raise flag"),
  ]);

  const flagsCard = el("div", { class: "card" }, [
    el("h3", {}, "Risk flags"),
    dataTable(
      [
        { header: "Type", render: (f) => titleCase(f.flag_type) },
        { header: "Description", render: (f) => f.description },
        { header: "Status", render: (f) => badge(f.status) },
        {
          header: "",
          render: (f) => (f.status === "open" || f.status === "under_review"
            ? el("button", { class: "btn btn-secondary btn-sm", onclick: () => openResolveModal(root, f) }, "Resolve")
            : ""),
        },
      ],
      flags, "No risk flags match this filter."
    ),
  ]);

  mount(root, [
    el("div", { class: "grid grid-3" }, [parCard, dormancyCard, penaltyCard].filter(Boolean)),
    toolbar,
    flagsCard,
  ]);
}

function openRaiseFlagModal(root) {
  openModal("Raise a risk flag", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const typeSelect = el("select", {}, [
      "aml_suspicious_deposit", "duplicate_id", "multiple_loans", "ghost_member", "loan_default_risk",
    ].map((t) => el("option", { value: t }, titleCase(t))));
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Flag type"), typeSelect]),
      el("div", { class: "field" }, [el("label", {}, "Description"), el("textarea", { id: "rf-desc", rows: 3, required: true })]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Raise flag"),
      ]),
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post("/api/v1/risk/flags", { flag_type: typeSelect.value, description: form.querySelector("#rf-desc").value });
        showToast("Risk flag raised.", "success");
        closeFn();
        await renderRisk(root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

function openResolveModal(root, flag) {
  openModal("Resolve risk flag", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const notesInput = el("textarea", { rows: 3, required: true });
    const form = el("form", {}, [
      el("p", { class: "muted" }, flag.description),
      el("div", { class: "field" }, [el("label", {}, "Resolution notes"), notesInput]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Mark resolved"),
      ]),
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post(`/api/v1/risk/flags/${flag.id}/resolve`, { resolution_notes: notesInput.value });
        showToast("Risk flag resolved.", "success");
        closeFn();
        await renderRisk(root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}
