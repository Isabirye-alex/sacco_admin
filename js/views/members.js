import { api } from "../api.js";
import {
  el, mount, formatMoney, formatDate, titleCase, badge, dataTable, paginationBar,
  openModal, confirmDialog, showToast,
} from "../utils.js";

const state = { page: 1, pageSize: 15, q: "", status: "", selectedId: null };

export async function renderMembers(root) {
  mount(root, el("div", { class: "spinner" }));
  if (state.selectedId) {
    await renderDetail(root, state.selectedId);
  } else {
    await renderList(root);
  }
}

async function renderList(root) {
  const params = new URLSearchParams({ page: state.page, page_size: state.pageSize });
  if (state.q) params.set("q", state.q);
  if (state.status) params.set("status", state.status);

  const data = await api.get(`/api/v1/members?${params.toString()}`);

  const toolbar = el("div", { class: "toolbar" }, [
    el("input", {
      class: "search-input", type: "text", placeholder: "Search name, member number, national ID\u2026",
      value: state.q,
      oninput: debounce((e) => { state.q = e.target.value; state.page = 1; renderMembers(root); }, 350),
    }),
    el(
      "select",
      { onchange: (e) => { state.status = e.target.value; state.page = 1; renderMembers(root); } },
      ["", "active", "dormant", "suspended", "exited"].map((s) =>
        el("option", { value: s, selected: s === state.status }, s ? titleCase(s) : "All statuses")
      )
    ),
    el("button", { class: "btn btn-primary", onclick: () => openCreateMemberModal(root) }, "+ Add member"),
  ]);

  const table = dataTable(
    [
      { header: "Member No.", render: (m) => m.member_number },
      { header: "Name", render: (m) => `${m.first_name} ${m.last_name}` },
      { header: "Phone", render: (m) => m.phone_number },
      { header: "Status", render: (m) => badge(m.status) },
      { header: "Joined", render: (m) => formatDate(m.date_joined) },
      {
        header: "",
        render: (m) => el("button", { class: "btn btn-secondary btn-sm", onclick: () => { state.selectedId = m.id; renderMembers(root); } }, "View"),
      },
    ],
    data.items,
    "No members match your search."
  );

  const card = el("div", { class: "card" }, [table]);
  mount(root, [toolbar, card, paginationBar(data.page, data.page_size, data.total, (p) => { state.page = p; renderMembers(root); })]);
}

async function renderDetail(root, memberId) {
  const [member, accounts, loans, holdings] = await Promise.all([
    api.get(`/api/v1/members/${memberId}`),
    api.get(`/api/v1/savings/members/${memberId}/accounts`).catch(() => []),
    api.get(`/api/v1/loans/applications?member_id=${memberId}`).catch(() => []),
    api.get(`/api/v1/shares/members/${memberId}/holdings`).catch(() => []),
  ]);

  const backBtn = el("button", { class: "detail-back", onclick: () => { state.selectedId = null; renderMembers(root); } }, "\u2190 Back to members");

  const header = el("div", { class: "detail-header" }, [
    el("div", {}, [
      el("h2", {}, `${member.first_name} ${member.last_name}`),
      el("p", { class: "muted" }, `${member.member_number} \u00b7 ${member.national_id} \u00b7 Joined ${formatDate(member.date_joined)}`),
    ]),
    el("div", { style: "display:flex;gap:8px;align-items:center" }, [
      badge(member.status),
      el("button", { class: "btn btn-secondary btn-sm", onclick: () => openEditMemberModal(root, member) }, "Edit"),
      member.status !== "exited"
        ? el("button", {
            class: "btn btn-danger btn-sm",
            onclick: async () => {
              const ok = await confirmDialog(`Mark ${member.first_name} ${member.last_name} as exited? This cannot be undone.`, "Exit member");
              if (!ok) return;
              try {
                await api.del(`/api/v1/members/${member.id}`);
                showToast("Member exited.", "success");
                renderMembers(root);
              } catch (err) {
                showToast(err.message, "error");
              }
            },
          }, "Exit member")
        : null,
    ]),
  ]);

  const contactCard = el("div", { class: "card" }, [
    el("h3", {}, "Contact"),
    infoRow("Phone", member.phone_number),
    infoRow("Email", member.email || "\u2014"),
    infoRow("Address", member.physical_address || "\u2014"),
    infoRow("Occupation", member.occupation || "\u2014"),
  ]);

  const kinCard = el("div", { class: "card" }, [
    el("h3", {}, "Next of kin"),
    member.next_of_kin?.length
      ? el("div", {}, member.next_of_kin.map((k) => el("div", { style: "padding:6px 0;border-bottom:1px solid var(--line)" }, [
          el("div", { style: "font-weight:600" }, k.full_name),
          el("div", { class: "muted small" }, `${titleCase(k.relationship_type)} \u00b7 ${k.phone_number}`),
        ])))
      : el("p", { class: "muted" }, "None recorded."),
  ]);

  const savingsCard = el("div", { class: "card" }, [
    el("h3", {}, "Savings accounts"),
    dataTable(
      [
        { header: "Account", render: (a) => a.account_number },
        { header: "Balance", className: "ledger", render: (a) => formatMoney(a.balance) },
        { header: "Status", render: (a) => (a.is_active ? badge("active") : badge("closed")) },
      ],
      accounts, "No savings accounts."
    ),
  ]);

  const loansCard = el("div", { class: "card" }, [
    el("h3", {}, "Loans"),
    dataTable(
      [
        { header: "Loan No.", render: (l) => l.loan_number },
        { header: "Requested", className: "ledger", render: (l) => formatMoney(l.amount_requested) },
        { header: "Status", render: (l) => badge(l.status) },
      ],
      loans, "No loan applications."
    ),
  ]);

  const sharesCard = el("div", { class: "card" }, [
    el("h3", {}, "Share holdings"),
    dataTable(
      [{ header: "Shares", render: (h) => `${h.number_of_shares}` }],
      holdings, "No share holdings."
    ),
  ]);

  mount(root, [backBtn, header, el("div", { class: "grid grid-2" }, [contactCard, kinCard]), savingsCard, loansCard, sharesCard]);
}

function infoRow(label, value) {
  return el("div", { style: "display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)" }, [
    el("span", { class: "muted" }, label),
    el("span", { style: "font-weight:600" }, value),
  ]);
}

function openCreateMemberModal(root) {
  openModal("Add member", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const form = el("form", {}, [
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "First name"), el("input", { id: "m-first", required: true })]),
        el("div", { class: "field" }, [el("label", {}, "Last name"), el("input", { id: "m-last", required: true })]),
      ]),
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "National ID"), el("input", { id: "m-nid", required: true })]),
        el("div", { class: "field" }, [el("label", {}, "Phone number"), el("input", { id: "m-phone", required: true })]),
      ]),
      el("div", { class: "field" }, [el("label", {}, "Email (optional)"), el("input", { id: "m-email", type: "email" })]),
      el("div", { class: "field" }, [el("label", {}, "Address (optional)"), el("input", { id: "m-address" })]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Create member"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post("/api/v1/members", {
          first_name: form.querySelector("#m-first").value,
          last_name: form.querySelector("#m-last").value,
          national_id: form.querySelector("#m-nid").value,
          phone_number: form.querySelector("#m-phone").value,
          email: form.querySelector("#m-email").value || null,
          physical_address: form.querySelector("#m-address").value || null,
        });
        showToast("Member created.", "success");
        closeFn();
        renderMembers(root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });

    return [form];
  });
}

function openEditMemberModal(root, member) {
  openModal(`Edit ${member.first_name} ${member.last_name}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Phone number"), el("input", { id: "e-phone", value: member.phone_number })]),
      el("div", { class: "field" }, [el("label", {}, "Email"), el("input", { id: "e-email", type: "email", value: member.email || "" })]),
      el("div", { class: "field" }, [el("label", {}, "Address"), el("input", { id: "e-address", value: member.physical_address || "" })]),
      el("div", { class: "field" }, [
        el("label", {}, "Status"),
        el(
          "select", { id: "e-status" },
          ["active", "dormant", "suspended", "exited"].map((s) => el("option", { value: s, selected: s === member.status }, titleCase(s)))
        ),
      ]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Save changes"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.patch(`/api/v1/members/${member.id}`, {
          phone_number: form.querySelector("#e-phone").value,
          email: form.querySelector("#e-email").value || null,
          physical_address: form.querySelector("#e-address").value || null,
          status: form.querySelector("#e-status").value,
        });
        showToast("Member updated.", "success");
        closeFn();
        renderMembers(root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });

    return [form];
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
