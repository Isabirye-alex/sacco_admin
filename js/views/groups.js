import { api } from "../api.js";
import { el, mount, formatMoney, formatDate, titleCase, dataTable, openModal, showToast, memberPicker } from "../utils.js";

const state = { selectedId: null };

export async function renderGroups(root) {
  mount(root, el("div", { class: "spinner" }));
  if (state.selectedId) await renderGroupDetail(root, state.selectedId);
  else await renderGroupList(root);
}

async function renderGroupList(root) {
  const groups = await api.get("/api/v1/groups");
  const card = el("div", { class: "card" }, [
    el("div", { class: "card-header" }, [
      el("h3", {}, "Groups"),
      el("button", { class: "btn btn-primary btn-sm", onclick: () => openCreateGroupModal(root) }, "+ New group"),
    ]),
    dataTable(
      [
        { header: "Name", render: (g) => g.name },
        { header: "Description", render: (g) => g.description || "\u2014" },
        { header: "", render: (g) => el("button", { class: "btn btn-secondary btn-sm", onclick: () => { state.selectedId = g.id; renderGroups(root); } }, "Open") },
      ],
      groups, "No groups yet."
    ),
  ]);
  mount(root, card);
}

function openCreateGroupModal(root) {
  openModal("New group", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Name"), el("input", { id: "g-name", required: true })]),
      el("div", { class: "field" }, [el("label", {}, "Description"), el("textarea", { id: "g-desc", rows: 2 })]),
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
        await api.post("/api/v1/groups", { name: form.querySelector("#g-name").value, description: form.querySelector("#g-desc").value || null });
        showToast("Group created.", "success");
        closeFn();
        await renderGroups(root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

async function renderGroupDetail(root, groupId) {
  const [groups, contributions, groupGuarantees, loans] = await Promise.all([
    api.get("/api/v1/groups"),
    api.get(`/api/v1/groups/${groupId}/contributions`),
    api.get(`/api/v1/loans/groups/${groupId}/guarantees`).catch(() => []),
    api.get("/api/v1/loans/applications").catch(() => []),
  ]);
  const group = groups.find((g) => g.id === groupId);

  const backBtn = el("button", { class: "detail-back", onclick: () => { state.selectedId = null; renderGroups(root); } }, "\u2190 Back to groups");

  const header = el("div", { class: "detail-header" }, [
    el("div", {}, [el("h2", {}, group ? group.name : "Group"), el("p", { class: "muted" }, group?.description || "")]),
    el("button", { class: "btn btn-primary btn-sm", onclick: () => openAddMemberModal(root, groupId) }, "+ Add member"),
  ]);

  const contribCard = el("div", { class: "card", style: "margin-bottom: 20px;" }, [
    el("div", { class: "card-header" }, [
      el("h3", {}, "Contributions"),
      el("button", { class: "btn btn-secondary btn-sm", onclick: () => openContributionModal(root, groupId) }, "+ Record contribution"),
    ]),
    dataTable(
      [
        { header: "Date", render: (c) => formatDate(c.contribution_date) },
        { header: "Amount", className: "ledger", render: (c) => formatMoney(c.amount) },
      ],
      contributions, "No contributions recorded yet."
    ),
  ]);

  const guaranteeCard = el("div", { class: "card" }, [
    el("div", { class: "card-header" }, [
      el("h3", {}, "Guaranteed Member Loans"),
    ]),
    dataTable(
      [
        {
          header: "Loan Application",
          render: (gg) => {
            const loan = loans.find((l) => l.id === gg.loan_id);
            return loan ? el("strong", {}, loan.loan_number) : gg.loan_id;
          },
        },
        { header: "Amount Guaranteed", className: "ledger", render: (gg) => `UGX ${formatMoney(gg.amount_guaranteed)}` },
        { header: "Status", render: (gg) => (gg.approved ? badge("approved") : badge("pending")) },
        {
          header: "Actions",
          render: (gg) => {
            if (!gg.approved) {
              return el("button", {
                class: "btn btn-primary btn-sm",
                onclick: async () => {
                  try {
                    await api.post(`/api/v1/loans/group-guarantees/${gg.id}/approve`);
                    showToast("Group guarantee approved successfully.", "success");
                    await renderGroupDetail(root, groupId);
                  } catch (err) {
                    showToast(err.message, "error");
                  }
                },
              }, "Approve");
            }
            return el("span", { class: "muted small" }, `Approved ${gg.approved_at ? formatDate(gg.approved_at) : ""}`);
          },
        },
      ],
      groupGuarantees,
      "This group has not guaranteed any member loans."
    ),
  ]);

  mount(root, [backBtn, header, contribCard, guaranteeCard]);
}

function openAddMemberModal(root, groupId) {
  openModal("Add member to group", (closeFn) => {
    let selected = null;
    const errorEl = el("p", { class: "form-error", hidden: true });
    const picker = memberPicker(
      (q) => api.get(`/api/v1/members?q=${encodeURIComponent(q)}`).then((r) => r.items),
      (m) => { selected = m; }
    );
    const roleSelect = el("select", {}, ["member", "chair", "secretary", "treasurer"].map((r) => el("option", { value: r }, titleCase(r))));
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Member"), picker]),
      el("div", { class: "field" }, [el("label", {}, "Role in group"), roleSelect]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Add"),
      ]),
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      if (!selected) { errorEl.textContent = "Select a member first."; errorEl.hidden = false; return; }
      try {
        await api.post(`/api/v1/groups/${groupId}/members`, { member_id: selected.id, role: roleSelect.value });
        showToast("Member added to group.", "success");
        closeFn();
        await renderGroups(root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

function openContributionModal(root, groupId) {
  openModal("Record contribution", (closeFn) => {
    let selected = null;
    const errorEl = el("p", { class: "form-error", hidden: true });
    const picker = memberPicker(
      (q) => api.get(`/api/v1/members?q=${encodeURIComponent(q)}`).then((r) => r.items),
      (m) => { selected = m; }
    );
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Member"), picker]),
      el("div", { class: "field" }, [el("label", {}, "Amount"), el("input", { id: "c-amount", type: "number", required: true })]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Record"),
      ]),
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      if (!selected) { errorEl.textContent = "Select a member first."; errorEl.hidden = false; return; }
      try {
        await api.post(`/api/v1/groups/${groupId}/contributions`, { member_id: selected.id, amount: Number(form.querySelector("#c-amount").value) });
        showToast("Contribution recorded.", "success");
        closeFn();
        await renderGroups(root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}
