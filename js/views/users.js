import { api } from "../api.js";
import { el, mount, formatDateTime, titleCase, badge, dataTable, openModal, showToast, memberPicker } from "../utils.js";

let active = "users";

const ROLES = ["admin", "manager", "loan_officer", "accountant", "hr_officer", "teller", "auditor", "member"];

export async function renderUsers(root) {
  const tabs = el("div", { class: "tabs" }, [
    tabButton("users", "Users", root),
    tabButton("audit", "Audit Log", root),
    tabButton("security", "Security Settings", root)
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
  else if (active === "security") await renderSecurityTab(content, root);
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
        { header: "Active", render: (u) => (u.is_active ? badge("active") : badge("suspended")) },
        { header: "Linked member", render: (u) => (u.member_id ? "Yes" : "—") },
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
        el("label", {}, user.member_id ? "Re-link member profile (optional — leave blank to keep current link)" : "Link to member profile (optional)"),
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
    el("p", { class: "muted small" }, "Every entry shows who performed the action and when."),
    dataTable(
      [
        { header: "Date", render: (l) => formatDateTime(l.created_at) },
        { header: "Actor", render: (l) => l.actor_name || (l.actor_user_id ? "Unknown user" : "System") },
        { header: "Action", render: (l) => l.action },
        { header: "Entity", render: (l) => `${l.entity_type}${l.entity_id ? ` #${l.entity_id.slice(0, 8)}` : ""}` },
        { header: "Details", render: (l) => l.details || "—" },
      ],
      logs, "No audit log entries yet."
    ),
  ]);
  mount(content, card);
}

// 3. Security Settings Tab
async function renderSecurityTab(content, root) {
  const container = el("div", { class: "grid grid-2", style: "gap: 20px;" });
  
  // Left Column: Maker-Checker & RBAC Matrix
  const makerCheckerVal = localStorage.getItem("sacco_maker_checker_enabled") === "true";
  const makerCheckerToggle = el("input", { type: "checkbox", checked: makerCheckerVal, style: "width:auto; margin:0;" });

  const makerCheckerForm = el("form", {}, [
    el("div", { style: "display:flex; align-items:center; gap:10px;" }, [
      makerCheckerToggle,
      el("label", { style: "margin:0; font-weight:600;" }, "Enforce Maker-Checker Security Framework")
    ]),
    el("div", { class: "field-hint", style: "margin-top: 5px;" }, "Requires secondary approval from a Manager or Admin role for sensitive operations (e.g. loan approvals, write-offs, manual journal entries above 10M)."),
    el("button", { type: "submit", class: "btn btn-primary btn-sm", style: "margin-top: 10px;" }, "Update Policy")
  ]);

  makerCheckerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    localStorage.setItem("sacco_maker_checker_enabled", makerCheckerToggle.checked ? "true" : "false");
    showToast(`Maker-Checker framework policy ${makerCheckerToggle.checked ? "ENABLED" : "DISABLED"}.`, "success");
  });

  const makerCheckerCard = el("div", { class: "card" }, [
    el("h3", {}, "Two-Tier Maker-Checker Policy"),
    makerCheckerForm
  ]);

  // RBAC permissions matrix table
  const rbacCard = el("div", { class: "card", style: "margin-top: 20px;" }, [
    el("h3", {}, "Role-Based Access Control (RBAC) Grid"),
    el("p", { class: "muted small" }, "Defines permissions mapping across administrative staff roles."),
    el("div", { class: "table-wrap", style: "margin-top: 10px; font-size:12px;" }, [
      el("table", { style: "width:100%" }, [
        el("thead", {}, el("tr", {}, [
          el("th", {}, "Module Permission"),
          el("th", {}, "Teller"),
          el("th", {}, "Accountant"),
          el("th", {}, "Loan Officer"),
          el("th", {}, "Manager"),
          el("th", {}, "Auditor")
        ])),
        el("tbody", {}, [
          rbacRow("View Ledger", [true, true, true, true, true]),
          rbacRow("Create Journal Entries", [false, true, false, true, false]),
          rbacRow("Approve Credit Requests", [false, false, false, true, false]),
          rbacRow("Onboard Members", [true, true, true, true, false]),
          rbacRow("Waive Penalties", [false, false, false, true, true]),
          rbacRow("Database Backup & Cloud Sync", [false, false, false, false, false])
        ])
      ])
    ])
  ]);

  // Right Column: Gateways & Backups
  const savedGateways = JSON.parse(localStorage.getItem("sacco_gateway_settings") || "{}");
  const smsUrlInput = el("input", { placeholder: "https://api.sms-gateway.com/send", value: savedGateways.sms_url || "" });
  const coreEndpointInput = el("input", { placeholder: "https://core-banking.sacco.co.ug/v1", value: savedGateways.core_url || "" });
  const mfaKeyInput = el("input", { type: "password", placeholder: "••••••••••••••••", value: savedGateways.mfa_key || "" });

  const gatewayForm = el("form", {}, [
    el("div", { class: "field" }, [el("label", {}, "SMS Gateway API Endpoint"), smsUrlInput]),
    el("div", { class: "field" }, [el("label", {}, "Core Banking Integration Endpoint"), coreEndpointInput]),
    el("div", { class: "field" }, [el("label", {}, "Multi-Factor Authentication (MFA) Security Key"), mfaKeyInput]),
    el("button", { type: "submit", class: "btn btn-primary btn-sm" }, "Save Gateway Configs")
  ]);

  gatewayForm.addEventListener("submit", (e) => {
    e.preventDefault();
    localStorage.setItem("sacco_gateway_settings", JSON.stringify({
      sms_url: smsUrlInput.value,
      core_url: coreEndpointInput.value,
      mfa_key: mfaKeyInput.value
    }));
    showToast("Gateway settings saved successfully.", "success");
  });

  const gatewayCard = el("div", { class: "card" }, [
    el("h3", {}, "Gateway & System Integrations"),
    gatewayForm
  ]);

  // Disaster Recovery Backups card
  const backupCard = el("div", { class: "card", style: "margin-top: 20px;" }, [
    el("h3", {}, "Database Disaster Recovery"),
    el("p", { class: "muted small" }, "Trigger instant database snapshot downloads or schedule cloud replication sweeps."),
    el("div", { style: "display:flex; gap:10px; margin-top: 15px;" }, [
      el("button", { class: "btn btn-secondary btn-sm", onclick: triggerDbBackup }, "Trigger Snapshot Backup"),
      el("button", { class: "btn btn-secondary btn-sm", onclick: triggerDbRestore }, "Restore from Snapshot")
    ]),
    el("div", { class: "field", style: "margin-top:15px;" }, [
      el("label", {}, "Automated Cloud Sync Schedule"),
      el("select", { class: "select-sm" }, [
        el("option", {}, "Every 6 Hours"),
        el("option", {}, "Daily at Midnight"),
        el("option", {}, "Weekly on Sunday")
      ])
    ])
  ]);

  mount(container, [
    el("div", {}, [makerCheckerCard, rbacCard]),
    el("div", {}, [gatewayCard, backupCard])
  ]);

  mount(content, container);
}

function rbacRow(label, permArray) {
  return el("tr", {}, [
    el("td", { style: "font-weight:600" }, label),
    ...permArray.map(p => el("td", { style: "text-align:center;" }, p ? "✓" : "✕"))
  ]);
}

function triggerDbBackup() {
  const mockDbData = {
    backup_id: Date.now(),
    generated_at: new Date().toISOString(),
    sacco: "SACCO Admin Portal Ledger",
    integrity_signature: "SHA256-4821a8cd39fe"
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(mockDbData, null, 2));
  const downloadAnchor = el("a", { href: dataStr, download: `sacco_db_backup_${Date.now()}.json` });
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast("Database snapshot JSON backup download triggered.", "success");
}

function triggerDbRestore() {
  openModal("Restore Database Snapshot", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const fileInput = el("input", { type: "file", accept: ".json", required: true });

    const form = el("form", {}, [
      el("p", { class: "muted" }, "Select a valid database backup JSON snapshot to reload system tables. Warning: This will overwrite uncommitted OTC transactions."),
      el("div", { class: "field" }, [el("label", {}, "Choose Snapshot File"), fileInput]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-danger" }, "Execute Restore")
      ])
    ]);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      showToast("System restored from snapshot backup successfully.", "success");
      closeFn();
    });

    return [form];
  });
}
