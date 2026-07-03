import { api } from "../api.js";
import { el, mount, formatDateTime, titleCase, dataTable, openModal, showToast, memberPicker } from "../utils.js";

let active = "users";

const ROLES = ["admin", "manager", "loan_officer", "accountant", "hr_officer", "teller", "auditor", "member"];

export async function renderUsers(root) {
  const tabs = el("div", { class: "tabs" }, [
    tabButton("users", "Users", root),
    tabButton("audit", "Audit Log", root),
  ]);
  const content = el("div", {});
  mount(root, [tabs, content]);
  await renderTabContent(content, root);
}

function tabButton(key, label, root) {
  return el("button", { class: `tab ${active === key ? "active" : ""}`, onclick: async () => { active = key; await renderUsers(root); } }, label);
}

async function renderTabContent(content, root) {
  mount(content, el("div", { class: "spinner" }));
  if (active === "audit") await renderAuditTab(content);
  else await renderUsersTab(content, root);
}

async function renderUsersTab(content, root) {
  const users = await api.get("/api/v1/admin/users");
  const card = el("div", { class: "card" }, [
    el("div", { class: "card-header" }, [
      el("h3", {}, "Platform users"),
      el("button", { class: "btn btn-primary btn-sm", onclick: () => openCreateUserModal(content, root) }, "+ New user"),
    ]),
    dataTable(
      [
        { header: "Name", render: (u) => u.full_name },
        { header: "Email", render: (u) => u.email },
        { header: "Role", render: (u) => el("span", { class: "role-pill" }, titleCase(u.role)) },
        { header: "Active", render: (u) => (u.is_active ? "Yes" : "No") },
        { header: "Linked member", render: (u) => (u.member_id ? "Yes" : "\u2014") },
        { header: "", render: (u) => el("button", { class: "btn btn-secondary btn-sm", onclick: () => openEditUserModal(content, root, u) }, "Edit") },
      ],
      users, "No users found."
    ),
  ]);
  mount(content, card);
}

function openCreateUserModal(content, root) {
  openModal("New user", (closeFn) => {
    let linkedMember = null;
    const errorEl = el("p", { class: "form-error", hidden: true });
    const roleSelect = el("select", {}, ROLES.map((r) => el("option", { value: r, selected: r === "member" }, titleCase(r))));
    const picker = memberPicker(
      (q) => api.get(`/api/v1/members?q=${encodeURIComponent(q)}`).then((r) => r.items),
      (m) => { linkedMember = m; }
    );
    const form = el("form", {}, [
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "Full name"), el("input", { id: "u-name", required: true })]),
        el("div", { class: "field" }, [el("label", {}, "Email"), el("input", { id: "u-email", type: "email", required: true })]),
      ]),
      el("div", { class: "field" }, [el("label", {}, "Temporary password"), el("input", { id: "u-password", type: "password", required: true, minlength: 8 })]),
      el("div", { class: "field" }, [el("label", {}, "Role"), roleSelect]),
      el("div", { class: "field" }, [el("label", {}, "Link to member profile (optional)"), picker]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Create user"),
      ]),
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post("/api/v1/auth/register", {
          full_name: form.querySelector("#u-name").value,
          email: form.querySelector("#u-email").value,
          password: form.querySelector("#u-password").value,
          role: roleSelect.value,
          member_id: linkedMember ? linkedMember.id : null,
        });
        showToast("User created.", "success");
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

function openEditUserModal(content, root, user) {
  openModal(`Edit ${user.full_name}`, (closeFn) => {
    let linkedMember = null;
    const errorEl = el("p", { class: "form-error", hidden: true });
    const roleSelect = el("select", {}, ROLES.map((r) => el("option", { value: r, selected: r === user.role }, titleCase(r))));
    const activeToggle = el("input", { type: "checkbox", checked: user.is_active });
    const picker = memberPicker(
      (q) => api.get(`/api/v1/members?q=${encodeURIComponent(q)}`).then((r) => r.items),
      (m) => { linkedMember = m; }
    );

    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Role"), roleSelect]),
      el("div", { class: "field", style: "display:flex;align-items:center;gap:8px" }, [activeToggle, el("label", { style: "margin:0" }, "Account active")]),
      el("div", { class: "field" }, [
        el("label", {}, user.member_id ? "Re-link member profile (optional \u2014 leave blank to keep current link)" : "Link to member profile (optional)"),
        picker,
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
        const payload = { role: roleSelect.value, is_active: activeToggle.checked };
        if (linkedMember) payload.member_id = linkedMember.id;
        await api.patch(`/api/v1/admin/users/${user.id}`, payload);
        showToast("User updated.", "success");
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

async function renderAuditTab(content) {
  const logs = await api.get("/api/v1/admin/audit-logs");
  const card = el("div", { class: "card" }, [
    el("h3", {}, "Audit log"),
    dataTable(
      [
        { header: "Date", render: (l) => formatDateTime(l.created_at) },
        { header: "Action", render: (l) => l.action },
        { header: "Entity", render: (l) => `${l.entity_type}${l.entity_id ? ` #${l.entity_id.slice(0, 8)}` : ""}` },
        { header: "Details", render: (l) => l.details || "\u2014" },
      ],
      logs, "No audit log entries yet."
    ),
  ]);
  mount(content, card);
}
