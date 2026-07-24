import { api } from "../api.js";
import {
  el, mount, formatMoney, formatDate, titleCase, badge, dataTable, paginationBar,
  openModal, confirmDialog, showToast, memberPicker
} from "../utils.js";

// ---------------------------------------------------------------------------
// Icon loading
// ---------------------------------------------------------------------------
if (!window.lucide) {
  const script = document.createElement("script");
  script.src = "https://unpkg.com/lucide@latest";
  script.onload = () => { if (window.lucide) window.lucide.createIcons(); };
  document.head.appendChild(script);
}

function refreshIcons() {
  if (window.lucide) setTimeout(() => window.lucide.createIcons(), 10);
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------
const state = {
  page: 1,
  pageSize: 15,
  q: "",
  status: "",
  branchId: "",
  dateFrom: "",
  dateTo: "",
  sortBy: "date_joined",
  sortDir: "desc",
  selectedId: null,
  selectedIds: new Set(),
  activeTab: "overview",
};

// Simple caches so switching tabs / re-rendering the same member doesn't
// re-fetch everything from the server every time.
let branchesCache = null;
let detailCache = { memberId: null, data: null };

function resetSelectionState() {
  state.selectedIds = new Set();
}

async function getBranches() {
  if (branchesCache) return branchesCache;
  try {
    branchesCache = await api.get("/api/v1/branches");
  } catch {
    branchesCache = [];
  }
  return branchesCache;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export async function renderMembers(root) {
  mount(root, listSkeleton());
  try {
    if (state.selectedId) {
      await renderDetail(root, state.selectedId);
    } else {
      await renderList(root);
    }
  } catch (err) {
    mount(root, errorState(err, () => renderMembers(root)));
  }
}

// ---------------------------------------------------------------------------
// Loading / empty / error states
// ---------------------------------------------------------------------------
function listSkeleton() {
  const row = () => el("div", { class: "skeleton-row", style: "display:flex;gap:16px;padding:12px 0;border-bottom:1px solid var(--line);" },
    Array.from({ length: 6 }).map(() => el("div", {
      style: "height:14px;flex:1;border-radius:4px;background:linear-gradient(90deg,#eef1f0 25%,#f7f9f8 37%,#eef1f0 63%);background-size:400% 100%;animation:skeleton-shine 1.4s ease infinite;"
    }))
  );
  const style = el("style", {}, "@keyframes skeleton-shine{0%{background-position:100% 50%}100%{background-position:0 50%}}");
  return el("div", {}, [
    style,
    el("div", { class: "card" }, [
      el("div", { style: "height:36px;width:220px;border-radius:6px;background:#eef1f0;margin-bottom:16px;" }),
      ...Array.from({ length: 6 }).map(row),
    ]),
  ]);
}

function errorState(err, onRetry) {
  return el("div", { class: "card", style: "text-align:center;padding:48px 24px;" }, [
    el("i", { "data-lucide": "alert-triangle", style: "width:32px;height:32px;color:var(--pine-600);margin-bottom:10px;" }),
    el("h3", { style: "margin:0 0 6px;" }, "Couldn't load this data"),
    el("p", { class: "muted", style: "margin:0 0 16px;" }, err?.message || "An unexpected error occurred. Please try again."),
    el("button", { class: "btn btn-primary btn-sm", onclick: onRetry }, "Retry"),
  ]);
}

function emptyState(icon, title, message, actionEl) {
  return el("div", { style: "text-align:center;padding:48px 24px;" }, [
    el("i", { "data-lucide": icon, style: "width:32px;height:32px;color:#b7c0bb;margin-bottom:10px;" }),
    el("h4", { style: "margin:0 0 4px;" }, title),
    el("p", { class: "muted", style: "margin:0 0 14px;" }, message),
    actionEl || null,
  ]);
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function exportToCSV(rows, columns, filename) {
  if (!rows.length) { showToast("Nothing to export.", "error"); return; }
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = columns.map((c) => escape(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => escape(c.value(r))).join(",")).join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`Exported ${rows.length} record${rows.length === 1 ? "" : "s"}.`, "success");
}

function printMemberStatement(member, accounts, loans, holdings) {
  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) { showToast("Please allow pop-ups to print statements.", "error"); return; }
  const savingsRows = accounts.map((a) => `<tr><td>${a.account_number}</td><td>${a.is_active ? "Active" : "Closed"}</td><td style="text-align:right">UGX ${formatMoney(a.balance)}</td></tr>`).join("") || `<tr><td colspan="3">No savings accounts.</td></tr>`;
  const loanRows = loans.map((l) => `<tr><td>${l.loan_number}</td><td>${titleCase(l.status)}</td><td style="text-align:right">UGX ${formatMoney(l.amount_requested)}</td></tr>`).join("") || `<tr><td colspan="3">No loan applications.</td></tr>`;
  const shareRows = holdings.map((h) => `<tr><td>${h.product_id || "Ordinary Shares"}</td><td style="text-align:right">${h.number_of_shares}</td></tr>`).join("") || `<tr><td colspan="2">No share holdings.</td></tr>`;
  win.document.write(`
    <html><head><title>Member Statement — ${member.member_number}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;color:#1c2320;padding:32px;}
      h1{font-size:18px;margin-bottom:0;}
      .muted{color:#667;font-size:13px;margin-top:4px;}
      table{width:100%;border-collapse:collapse;margin:16px 0 24px;}
      th,td{border-bottom:1px solid #ddd;padding:6px 8px;font-size:13px;text-align:left;}
      th{background:#f1f5f4;}
      .section-title{font-weight:700;margin-top:20px;font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:#2f4f43;}
    </style></head><body>
      <h1>${member.first_name} ${member.last_name}</h1>
      <div class="muted">${member.member_number} &middot; ${member.national_id} &middot; Joined ${formatDate(member.date_joined)} &middot; Printed ${new Date().toLocaleDateString()}</div>
      <div class="section-title">Savings Accounts</div>
      <table><tr><th>Account</th><th>Status</th><th style="text-align:right">Balance</th></tr>${savingsRows}</table>
      <div class="section-title">Loan Applications</div>
      <table><tr><th>Loan No.</th><th>Status</th><th style="text-align:right">Requested</th></tr>${loanRows}</table>
      <div class="section-title">Share Holdings</div>
      <table><tr><th>Class</th><th style="text-align:right">Shares</th></tr>${shareRows}</table>
    </body></html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

// ---------------------------------------------------------------------------
// LIST VIEW
// ---------------------------------------------------------------------------
async function renderList(root) {
  const params = new URLSearchParams({ page: state.page, page_size: state.pageSize });
  if (state.q) params.set("q", state.q);
  if (state.status) params.set("status", state.status);
  if (state.branchId) params.set("branch_id", state.branchId);
  if (state.dateFrom) params.set("date_from", state.dateFrom);
  if (state.dateTo) params.set("date_to", state.dateTo);
  if (state.sortBy) { params.set("sort_by", state.sortBy); params.set("sort_dir", state.sortDir); }

  const [data, branches, stats] = await Promise.all([
    api.get(`/api/v1/members?${params.toString()}`),
    getBranches(),
    api.get("/api/v1/members/stats").catch(() => null),
  ]);

  const itemsWithBalances = await Promise.all(
    (data.items || []).map(async (m) => {
      try {
        const [accounts, holdings] = await Promise.all([
          api.get(`/api/v1/savings/members/${m.id}/accounts`).catch(() => []),
          api.get(`/api/v1/shares/members/${m.id}/holdings`).catch(() => [])
        ]);
        const savingsBalance = accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
        const shareCount = holdings.reduce((sum, h) => sum + Number(h.number_of_shares || 0), 0);
        const shareBalance = shareCount * 10000;
        return { ...m, savingsBalance, shareBalance };
      } catch {
        return { ...m, savingsBalance: 0, shareBalance: 0 };
      }
    })
  );

  // Reconcile selection with what's currently on screen so stale ids don't linger.
  const visibleIds = new Set(itemsWithBalances.map((m) => m.id));
  for (const id of [...state.selectedIds]) if (!visibleIds.has(id)) state.selectedIds.delete(id);

  const statsBar = buildStatsBar(stats, data, itemsWithBalances);
  const toolbar = buildToolbar(root, branches);
  const bulkBar = buildBulkBar(root, itemsWithBalances);
  const table = buildMembersTable(root, itemsWithBalances);

  const card = el("div", { class: "card", style: "padding:0;overflow:hidden;" }, [table]);

  mount(root, [
    statsBar,
    toolbar,
    bulkBar,
    itemsWithBalances.length
      ? card
      : el("div", { class: "card" }, [
          emptyState(
            "users",
            "No members match your search",
            "Try adjusting your filters, or add a new member to get started.",
            el("button", { class: "btn btn-primary btn-sm", onclick: () => openCreateMemberModal(root) }, "Add member")
          ),
        ]),
    itemsWithBalances.length
      ? paginationBar(data.page, data.page_size, data.total, (p) => { state.page = p; renderMembers(root); })
      : null,
  ]);
  refreshIcons();
}

function buildStatsBar(stats, pageData, currentItems) {
  const approx = !stats;
  const totalSavings = stats?.total_savings ?? currentItems.reduce((s, m) => s + m.savingsBalance, 0);
  const totalShares = stats?.total_shares ?? currentItems.reduce((s, m) => s + m.shareBalance, 0);
  const active = stats?.active ?? currentItems.filter((m) => m.status === "active").length;
  const flagged = stats?.dormant ?? currentItems.filter((m) => ["dormant", "suspended"].includes(m.status)).length;

  const card = (icon, label, value, tint) => el("div", {
    class: "card",
    style: `flex:1;min-width:170px;display:flex;gap:12px;align-items:center;padding:14px 16px;`
  }, [
    el("div", { style: `width:38px;height:38px;border-radius:9px;background:${tint};display:flex;align-items:center;justify-content:center;flex-shrink:0;` }, [
      el("i", { "data-lucide": icon, style: "width:18px;height:18px;color:var(--pine-700);" })
    ]),
    el("div", {}, [
      el("div", { style: "font-size:18px;font-weight:700;line-height:1.1;" }, value),
      el("div", { class: "muted small" }, label),
    ]),
  ]);

  return el("div", { style: "display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;" }, [
    card("users", "Total members", pageData.total ?? currentItems.length, "var(--pine-50)"),
    card("user-check", "Active", active, "#eaf6ef"),
    card("shield-alert", "Dormant / suspended", flagged, "#fdf3e7"),
    card("piggy-bank", `Total savings${approx ? " (page)" : ""}`, `UGX ${formatMoney(totalSavings)}`, "var(--pine-50)"),
    card("layers", `Total share value${approx ? " (page)" : ""}`, `UGX ${formatMoney(totalShares)}`, "#eaf6ef"),
  ]);
}

function buildToolbar(root, branches) {
  const searchWrap = el("div", { style: "position: relative; display: flex; align-items: center;" }, [
    el("i", { "data-lucide": "search", style: "position: absolute; left: 10px; width: 16px; height: 16px; color: #888;" }),
    el("input", {
      class: "search-input", type: "text", placeholder: "Search name, ID\u2026",
      style: "padding-left: 32px;",
      value: state.q,
      oninput: debounce((e) => { state.q = e.target.value; state.page = 1; renderMembers(root); }, 350),
    })
  ]);

  const statusSelect = el(
    "select",
    { onchange: (e) => { state.status = e.target.value; state.page = 1; renderMembers(root); } },
    ["", "active", "dormant", "suspended", "exited"].map((s) =>
      el("option", { value: s, selected: s === state.status }, s ? titleCase(s) : "All statuses")
    )
  );

  const branchSelect = el(
    "select",
    { onchange: (e) => { state.branchId = e.target.value; state.page = 1; renderMembers(root); } },
    [el("option", { value: "" }, "All branches"), ...branches.map((b) =>
      el("option", { value: b.id, selected: b.id === state.branchId }, b.name)
    )]
  );

  const sortSelect = el(
    "select",
    {
      onchange: (e) => {
        const [by, dir] = e.target.value.split(":");
        state.sortBy = by; state.sortDir = dir; renderMembers(root);
      }
    },
    [
      { v: "date_joined:desc", l: "Newest first" },
      { v: "date_joined:asc", l: "Oldest first" },
      { v: "first_name:asc", l: "Name (A\u2013Z)" },
      { v: "first_name:desc", l: "Name (Z\u2013A)" },
    ].map((o) => el("option", { value: o.v, selected: o.v === `${state.sortBy}:${state.sortDir}` }, o.l))
  );

  const dateFrom = el("input", {
    type: "date", title: "Joined from", value: state.dateFrom,
    onchange: (e) => { state.dateFrom = e.target.value; state.page = 1; renderMembers(root); },
  });
  const dateTo = el("input", {
    type: "date", title: "Joined to", value: state.dateTo,
    onchange: (e) => { state.dateTo = e.target.value; state.page = 1; renderMembers(root); },
  });

  const hasFilters = state.q || state.status || state.branchId || state.dateFrom || state.dateTo;
  const clearBtn = hasFilters
    ? el("button", { class: "btn btn-secondary btn-sm", onclick: () => {
        Object.assign(state, { q: "", status: "", branchId: "", dateFrom: "", dateTo: "", page: 1 });
        renderMembers(root);
      } }, "Clear filters")
    : null;

  return el("div", { class: "toolbar", style: "display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px;" }, [
    searchWrap,
    statusSelect,
    branchSelect,
    el("span", { class: "muted small" }, "Joined"),
    dateFrom,
    el("span", { class: "muted small" }, "\u2013"),
    dateTo,
    sortSelect,
    clearBtn,
    el("div", { style: "flex:1;" }),
    el("button", { class: "btn btn-secondary", style: "display: flex; align-items: center; gap: 6px;", onclick: () => exportCurrentView(root) }, [
      el("i", { "data-lucide": "download", style: "width: 16px; height: 16px;" }),
      el("span", {}, "Export CSV")
    ]),
    el("button", { class: "btn btn-secondary", style: "display: flex; align-items: center; gap: 6px;", onclick: () => openBulkUploadModal(root) }, [
      el("i", { "data-lucide": "upload", style: "width: 16px; height: 16px;" }),
      el("span", {}, "Bulk Upload CSV")
    ]),
    el("button", { class: "btn btn-primary", style: "display: flex; align-items: center; gap: 6px;", onclick: () => openCreateMemberModal(root) }, [
      el("i", { "data-lucide": "plus", style: "width: 16px; height: 16px;" }),
      el("span", {}, "Add member")
    ]),
  ]);
}

const EXPORT_COLUMNS = [
  { label: "Member No.", value: (m) => m.member_number },
  { label: "First Name", value: (m) => m.first_name },
  { label: "Last Name", value: (m) => m.last_name },
  { label: "Phone", value: (m) => m.phone_number },
  { label: "Email", value: (m) => m.email || "" },
  { label: "Status", value: (m) => m.status },
  { label: "Savings Balance", value: (m) => m.savingsBalance },
  { label: "Share Value", value: (m) => m.shareBalance },
  { label: "Date Joined", value: (m) => m.date_joined },
];

let lastRenderedItems = [];

function exportCurrentView(root) {
  exportToCSV(lastRenderedItems, EXPORT_COLUMNS, `members_export_${new Date().toISOString().slice(0, 10)}.csv`);
}

function buildBulkBar(root, items) {
  if (state.selectedIds.size === 0) return null;
  const n = state.selectedIds.size;
  return el("div", {
    style: "display:flex;align-items:center;gap:10px;background:var(--pine-50);border:1px solid var(--pine-200);border-radius:8px;padding:10px 14px;margin-bottom:12px;"
  }, [
    el("span", { style: "font-weight:600;color:var(--pine-900);" }, `${n} member${n === 1 ? "" : "s"} selected`),
    el("div", { style: "flex:1;" }),
    el("button", { class: "btn btn-secondary btn-sm", onclick: () => bulkChangeStatus(root, "active") }, "Activate"),
    el("button", { class: "btn btn-secondary btn-sm", onclick: () => bulkChangeStatus(root, "suspended") }, "Suspend"),
    el("button", { class: "btn btn-secondary btn-sm", onclick: () => {
      const rows = items.filter((m) => state.selectedIds.has(m.id));
      exportToCSV(rows, EXPORT_COLUMNS, `members_selected_${new Date().toISOString().slice(0, 10)}.csv`);
    } }, "Export selected"),
    el("button", { class: "btn btn-secondary btn-sm", onclick: () => { resetSelectionState(); renderMembers(root); } }, "Clear"),
  ]);
}

async function bulkChangeStatus(root, newStatus) {
  const ids = [...state.selectedIds];
  if (!ids.length) return;
  const ok = await confirmDialog(`Set ${ids.length} member${ids.length === 1 ? "" : "s"} to "${titleCase(newStatus)}"?`, "Bulk update");
  if (!ok) return;
  let success = 0, failed = 0;
  for (const id of ids) {
    try { await api.patch(`/api/v1/members/${id}`, { status: newStatus }); success++; }
    catch { failed++; }
  }
  showToast(`Updated ${success} member${success === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.`, failed ? "error" : "success");
  resetSelectionState();
  renderMembers(root);
}

function sortHeader(root, label, key) {
  const active = state.sortBy === key;
  return el("button", {
    style: "background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:4px;font:inherit;font-weight:600;color:inherit;padding:0;",
    onclick: () => {
      state.sortDir = active && state.sortDir === "asc" ? "desc" : "asc";
      state.sortBy = key;
      renderMembers(root);
    }
  }, [
    el("span", {}, label),
    el("i", { "data-lucide": active ? (state.sortDir === "asc" ? "arrow-up" : "arrow-down") : "arrow-up-down", style: "width:12px;height:12px;opacity:.6;" })
  ]);
}

function buildMembersTable(root, itemsWithBalances) {
  lastRenderedItems = itemsWithBalances;
  const allSelected = itemsWithBalances.length > 0 && itemsWithBalances.every((m) => state.selectedIds.has(m.id));

  return dataTable(
    [
      {
        header: el("input", {
          type: "checkbox", checked: allSelected,
          onchange: (e) => {
            if (e.target.checked) itemsWithBalances.forEach((m) => state.selectedIds.add(m.id));
            else itemsWithBalances.forEach((m) => state.selectedIds.delete(m.id));
            renderMembers(root);
          }
        }),
        render: (m) => el("input", {
          type: "checkbox", checked: state.selectedIds.has(m.id),
          onclick: (e) => e.stopPropagation(),
          onchange: (e) => {
            if (e.target.checked) state.selectedIds.add(m.id); else state.selectedIds.delete(m.id);
            renderMembers(root);
          }
        }),
      },
      { header: sortHeader(root, "Member No.", "member_number"), render: (m) => m.member_number },
      { header: sortHeader(root, "Name", "first_name"), render: (m) => `${m.first_name} ${m.last_name}` },
      { header: "Contact Info", render: (m) => el("div", {}, [
        el("div", {}, m.phone_number),
        el("div", { class: "muted small" }, m.email || "No email")
      ])},
      { header: "Status", render: (m) => badge(m.status) },
      { header: "Savings Balance", className: "ledger", render: (m) => `UGX ${formatMoney(m.savingsBalance)}` },
      { header: "Share Value", className: "ledger", render: (m) => `UGX ${formatMoney(m.shareBalance)}` },
      { header: sortHeader(root, "Joined", "date_joined"), render: (m) => formatDate(m.date_joined) },
      {
        header: "",
        render: (m) => el("button", { class: "btn btn-secondary btn-sm", onclick: () => { state.selectedId = m.id; state.activeTab = "overview"; detailCache = { memberId: null, data: null }; renderMembers(root); } }, "Open Profile"),
      },
    ],
    itemsWithBalances,
    "No members match your search."
  );
}

// ---------------------------------------------------------------------------
// DETAIL VIEW
// ---------------------------------------------------------------------------
async function loadDetailBundle(memberId) {
  if (detailCache.memberId === memberId && detailCache.data) return detailCache.data;
  const [member, accounts, loans, holdings, notes, activity] = await Promise.all([
    api.get(`/api/v1/members/${memberId}`),
    api.get(`/api/v1/savings/members/${memberId}/accounts`).catch(() => []),
    api.get(`/api/v1/loans/applications?member_id=${memberId}`).catch(() => []),
    api.get(`/api/v1/shares/members/${memberId}/holdings`).catch(() => []),
    api.get(`/api/v1/members/${memberId}/notes`).catch(() => null),
    api.get(`/api/v1/audit-logs?member_id=${memberId}`).catch(() => null),
  ]);
  const data = { member, accounts, loans, holdings, notes, activity };
  detailCache = { memberId, data };
  return data;
}

async function renderDetail(root, memberId) {
  const { member, accounts, loans, holdings, notes, activity } = await loadDetailBundle(memberId);

  const backBtn = el("button", {
    style: "display: flex; align-items: center; gap: 6px; background: none; border: none; cursor: pointer; color: var(--pine-700); font-weight: 500; padding: 4px 0; margin-bottom: 10px;",
    onclick: () => { state.selectedId = null; resetSelectionState(); renderMembers(root); }
  }, [
    el("i", { "data-lucide": "arrow-left", style: "width: 16px; height: 16px;" }),
    el("span", {}, "Back to members")
  ]);

  const showApprovalBar = ["dormant", "suspended"].includes(member.status);
  const approvalActions = showApprovalBar
    ? el("div", { style: "background: var(--pine-50); padding: 12px 16px; border-radius: 8px; border: 1px solid var(--pine-200); display: flex; gap: 10px; align-items: center; margin-bottom: 15px;" }, [
        el("i", { "data-lucide": "shield-alert", style: "width: 20px; height: 20px; color: var(--pine-600);" }),
        el("span", { style: "font-weight: 600; color: var(--pine-900); flex-grow: 1;" }, "Registration Status: Pending approval"),
        el("button", { class: "btn btn-primary btn-sm", onclick: () => approveRegistration(root, member) }, "Approve Registration"),
        el("button", { class: "btn btn-danger btn-sm", onclick: () => rejectRegistration(root, member) }, "Reject Registration")
      ])
    : null;

  const header = el("div", { class: "detail-header", style: "display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;" }, [
    el("div", {}, [
      el("h2", { style: "margin-bottom:2px;" }, `${member.first_name} ${member.last_name}`),
      el("p", { class: "muted" }, `${member.member_number} \u00b7 ${member.national_id} \u00b7 Joined ${formatDate(member.date_joined)}`),
    ]),
    el("div", { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;" }, [
      badge(member.status),
      member.phone_number ? el("a", { class: "btn btn-secondary btn-sm", href: `tel:${member.phone_number}`, title: "Call member", style: "display:flex;align-items:center;gap:6px;" }, [
        el("i", { "data-lucide": "phone", style: "width:14px;height:14px;" }), "Call"
      ]) : null,
      member.email ? el("a", { class: "btn btn-secondary btn-sm", href: `mailto:${member.email}`, title: "Email member", style: "display:flex;align-items:center;gap:6px;" }, [
        el("i", { "data-lucide": "mail", style: "width:14px;height:14px;" }), "Email"
      ]) : null,
      el("button", { class: "btn btn-secondary btn-sm", onclick: () => printMemberStatement(member, accounts, loans, holdings) }, "Print statement"),
      el("button", { class: "btn btn-secondary btn-sm", onclick: () => openEditMemberModal(root, member) }, "Manage Status"),
      el("button", { class: "btn btn-secondary btn-sm", onclick: () => openShareReallocation(root, member, holdings) }, "Share Reallocation"),
      member.status !== "exited"
        ? el("button", {
            class: "btn btn-danger btn-sm",
            onclick: async () => {
              const ok = await confirmDialog(`Mark ${member.first_name} ${member.last_name} as exited? This cannot be undone.`, "Exit member");
              if (!ok) return;
              try {
                await api.del(`/api/v1/members/${member.id}`);
                showToast("Member exited.", "success");
                state.selectedId = null;
                detailCache = { memberId: null, data: null };
                renderMembers(root);
              } catch (err) {
                showToast(err.message, "error");
              }
            },
          }, "Exit member")
        : null,
    ]),
  ]);

  const tabs = [
    { id: "overview", label: "Overview", icon: "id-card" },
    { id: "savings", label: "Savings", icon: "piggy-bank" },
    { id: "loans", label: "Loans", icon: "landmark" },
    { id: "activity", label: "Activity Log", icon: "history" },
    { id: "notes", label: "Notes", icon: "sticky-note" },
  ];

  const tabBar = el("div", { style: "display:flex;gap:4px;border-bottom:1px solid var(--line);margin:18px 0 16px;" },
    tabs.map((t) => el("button", {
      style: `background:none;border:none;cursor:pointer;padding:9px 14px;font-weight:600;font-size:13.5px;display:flex;align-items:center;gap:6px;border-bottom:2px solid ${state.activeTab === t.id ? "var(--pine-700)" : "transparent"};color:${state.activeTab === t.id ? "var(--pine-900)" : "#667"};`,
      onclick: () => { state.activeTab = t.id; renderDetail(root, memberId); }
    }, [
      el("i", { "data-lucide": t.icon, style: "width:14px;height:14px;" }),
      el("span", {}, t.label),
    ]))
  );

  let tabBody;
  if (state.activeTab === "overview") tabBody = overviewTab(member);
  else if (state.activeTab === "savings") tabBody = savingsLoansSharesTab(accounts, loans, holdings);
  else if (state.activeTab === "loans") tabBody = loansTab(loans);
  else if (state.activeTab === "activity") tabBody = activityTab(activity);
  else if (state.activeTab === "notes") tabBody = notesTab(root, member, notes);

  mount(root, [backBtn, approvalActions, header, tabBar, tabBody]);
  refreshIcons();
}

function overviewTab(member) {
  const leftCol = el("div", { class: "card", style: "flex: 1;" }, [
    el("h3", {}, "Bio-data Details"),
    infoRow("First Name", member.first_name),
    infoRow("Last Name", member.last_name),
    infoRow("National ID", member.national_id),
    infoRow("Date of Birth", member.date_of_birth ? formatDate(member.date_of_birth) : "—"),
    infoRow("Phone Number", member.phone_number),
    infoRow("Email Address", member.email || "—"),
    infoRow("Address", member.physical_address || "—"),
    infoRow("Occupation", member.occupation || "—"),
  ]);

  const rightCol = el("div", { class: "card", style: "flex: 1; display: flex; flex-direction: column; gap: 15px;" }, [
    el("h3", { style: "display: flex; align-items: center; gap: 8px;" }, [
      el("i", { "data-lucide": "shield-check", style: "width: 20px; height: 20px; color: var(--pine-600);" }),
      el("span", {}, "KYC Identity Documents")
    ]),
    el("p", { class: "muted small" }, "Click any document below to inspect or zoom high-resolution specimens."),
    el("div", { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 10px;" }, [
      kycDocPreview("National ID Card", member.national_id, "id-card"),
      kycDocPreview("Passport Photo", `${member.first_name} ${member.last_name}`, "avatar"),
    ]),
    kycDocPreview("Signature Specimen", "Verified signature Specimen", "signature"),
  ]);

  const kycSplitScreen = el("div", { class: "grid grid-2", style: "margin-bottom: 20px;" }, [leftCol, rightCol]);

  const kinCard = el("div", { class: "card" }, [
    el("h3", {}, "Next of Kin / Beneficiaries"),
    member.next_of_kin?.length
      ? el("div", {}, member.next_of_kin.map((k) => el("div", { style: "padding:6px 0;border-bottom:1px solid var(--line)" }, [
          el("div", { style: "font-weight:600" }, k.full_name),
          el("div", { class: "muted small" }, `${titleCase(k.relationship_type)} \u00b7 ${k.phone_number}`),
        ])))
      : emptyState("users", "No next of kin recorded", "Add a beneficiary from the member's registration form."),
  ]);

  return el("div", {}, [kycSplitScreen, kinCard]);
}

function savingsLoansSharesTab(accounts, loans, holdings) {
  const savingsCard = el("div", { class: "card" }, [
    el("h3", {}, "Savings Accounts"),
    accounts.length
      ? dataTable(
          [
            { header: "Account", render: (a) => a.account_number },
            { header: "Balance", className: "ledger", render: (a) => `UGX ${formatMoney(a.balance)}` },
            { header: "Status", render: (a) => (a.is_active ? badge("active") : badge("closed")) },
          ],
          accounts, "No savings accounts."
        )
      : emptyState("piggy-bank", "No savings accounts", "This member has not opened a savings account yet."),
  ]);

  const sharesCard = el("div", { class: "card" }, [
    el("h3", {}, "Share Holdings"),
    holdings.length
      ? dataTable(
          [
            { header: "Class", render: (h) => h.product_id || "Ordinary Shares" },
            { header: "Shares Owned", className: "ledger", render: (h) => h.number_of_shares },
            { header: "Value", className: "ledger", render: (h) => `UGX ${formatMoney(Number(h.number_of_shares || 0) * 10000)}` },
          ],
          holdings, "No share holdings."
        )
      : emptyState("layers", "No share holdings", "This member has not purchased shares yet."),
  ]);

  return el("div", {}, [savingsCard, sharesCard]);
}

function loansTab(loans) {
  return el("div", { class: "card" }, [
    el("h3", {}, "Loans Summary"),
    loans.length
      ? dataTable(
          [
            { header: "Loan No.", render: (l) => l.loan_number },
            { header: "Requested", className: "ledger", render: (l) => `UGX ${formatMoney(l.amount_requested)}` },
            { header: "Status", render: (l) => badge(l.status) },
          ],
          loans, "No loan applications."
        )
      : emptyState("landmark", "No loan applications", "This member hasn't applied for a loan yet."),
  ]);
}

function activityTab(activity) {
  if (activity === null) {
    return el("div", { class: "card" }, [
      el("h3", {}, "Activity Log"),
      emptyState("history", "Activity log unavailable", "The audit trail service could not be reached. Try again shortly."),
    ]);
  }
  return el("div", { class: "card" }, [
    el("h3", {}, "Activity Log"),
    activity.length
      ? el("div", { style: "display:flex;flex-direction:column;" }, activity.map((a) => el("div", {
          style: "display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);"
        }, [
          el("i", { "data-lucide": "circle-dot", style: "width:14px;height:14px;color:var(--pine-600);margin-top:3px;flex-shrink:0;" }),
          el("div", { style: "flex:1;" }, [
            el("div", { style: "font-weight:600;font-size:13.5px;" }, a.description || a.action || "Update"),
            el("div", { class: "muted small" }, `${a.actor_name || "System"} \u00b7 ${formatDate(a.created_at)}`),
          ]),
        ])))
      : emptyState("history", "No activity recorded", "Actions performed on this member's account will appear here."),
  ]);
}

function notesTab(root, member, notes) {
  const unavailable = notes === null;
  const listEl = el("div", { style: "display:flex;flex-direction:column;gap:10px;margin-top:12px;" },
    unavailable
      ? []
      : (notes.length
          ? notes.map((n) => el("div", { style: "background:var(--pine-50);border:1px solid var(--pine-200);border-radius:8px;padding:10px 12px;" }, [
              el("div", { style: "font-size:13.5px;" }, n.body),
              el("div", { class: "muted small", style: "margin-top:4px;" }, `${n.author_name || "Staff"} \u00b7 ${formatDate(n.created_at)}`),
            ]))
          : [])
  );

  const textarea = el("textarea", { rows: 2, placeholder: "Add an internal note about this member\u2026", style: "width:100%;" });
  const addBtn = el("button", { class: "btn btn-primary btn-sm", style: "margin-top:8px;", onclick: async () => {
    if (!textarea.value.trim()) return;
    try {
      await api.post(`/api/v1/members/${member.id}/notes`, { body: textarea.value.trim() });
      showToast("Note added.", "success");
      detailCache = { memberId: null, data: null };
      renderDetail(root, member.id);
    } catch (err) {
      showToast(err.message || "Could not save note.", "error");
    }
  } }, "Add note");

  return el("div", { class: "card" }, [
    el("h3", {}, "Internal Notes"),
    unavailable
      ? emptyState("sticky-note", "Notes unavailable", "The notes service could not be reached. Try again shortly.")
      : (notes.length ? listEl : emptyState("sticky-note", "No notes yet", "Notes are only visible to staff and never shared with the member.")),
    el("div", { style: "margin-top:14px;border-top:1px solid var(--line);padding-top:12px;" }, [textarea, addBtn]),
  ]);
}

function infoRow(label, value) {
  return el("div", { style: "display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)" }, [
    el("span", { class: "muted" }, label),
    el("span", { style: "font-weight:600" }, value || "—"),
  ]);
}

// ---------------------------------------------------------------------------
// KYC document preview / zoom
// ---------------------------------------------------------------------------
function kycDocPreview(label, desc, docType) {
  let docIconName = "file-text";
  let previewStyle = "background: #f1f3f2; border: 2px dashed #cbd2ce; height: 110px;";
  let contentEl = el("div", { style: "font-size: 11px; font-weight: bold; color: #4B554F; margin-top: 5px;" }, desc);

  if (docType === "id-card") {
    docIconName = "id-card";
    previewStyle = "background: linear-gradient(135deg, #eef2f3, #dfe6e9); border: 1px solid var(--pine-200); height: 110px;";
  } else if (docType === "avatar") {
    docIconName = "user-round";
    previewStyle = "background: #eef5f3; border: 1px solid var(--pine-200); height: 110px; border-radius: 50%; width: 110px; margin: 0 auto;";
  } else if (docType === "signature") {
    docIconName = "pen-tool";
    previewStyle = "background: #fff; border: 1px solid #ddd; height: 85px; font-family: 'Courier New', Courier, monospace; font-style: italic;";
    contentEl = el("div", { style: "font-size: 18px; color: #1e272e; transform: rotate(-3deg); margin-top: 5px;" }, desc);
  }

  return el("div", {
    class: "kyc-preview-box",
    style: `display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 12px; cursor: pointer; text-align: center; border-radius: 6px; ${previewStyle}`,
    onclick: () => openKycDocZoom(label, desc, docType),
    role: "button",
    tabindex: "0",
    "aria-label": `View ${label}`,
  }, [
    el("i", { "data-lucide": docIconName, style: "width: 28px; height: 28px; color: var(--pine-700);" }),
    el("div", { style: "font-weight: 600; font-size: 12px; margin-top: 6px;" }, label),
    contentEl
  ]);
}

function openKycDocZoom(label, desc, docType) {
  openModal(`KYC Viewer — ${label}`, (closeFn) => {
    let viewerEl;
    if (docType === "avatar") {
      viewerEl = el("div", { style: "text-align: center; padding: 20px;" }, [
        el("div", { style: "display: flex; align-items: center; justify-content: center; width: 160px; height: 160px; border-radius: 50%; background: var(--pine-100); margin: 0 auto;" }, [
          el("i", { "data-lucide": "user-round", style: "width: 80px; height: 80px; color: var(--pine-700);" })
        ]),
        el("h4", { style: "margin-top: 15px;" }, desc),
        el("p", { class: "muted" }, "Biometric Member Photograph specimen.")
      ]);
    } else if (docType === "signature") {
      viewerEl = el("div", { style: "padding: 30px; background: #fff; border: 1px solid #ccc; text-align: center;" }, [
        el("div", { style: "display: flex; align-items: center; justify-content: center; margin-bottom: 15px;" }, [
          el("i", { "data-lucide": "pen-tool", style: "width: 32px; height: 32px; color: #555;" })
        ]),
        el("div", { style: "font-family: 'Courier New', monospace; font-size: 36px; font-style: italic; font-weight: bold; transform: rotate(-3deg); color: #111;" }, desc),
        el("hr", { style: "margin: 30px 0; border: none; border-top: 2px solid #555;" }),
        el("p", { class: "muted" }, "Specimen Signature Specimen for transaction verifications.")
      ]);
    } else {
      viewerEl = el("div", { style: "padding: 20px; background: linear-gradient(135deg, #ffffff, #f1f5f4); border: 2px solid var(--pine-500); border-radius: 8px; box-shadow: var(--shadow);" }, [
        el("div", { style: "display: flex; justify-content: space-between; border-bottom: 2px solid var(--pine-600); padding-bottom: 8px;" }, [
          el("span", { style: "font-weight: bold; color: var(--pine-900);" }, "REPUBLIC OF UGANDA"),
          el("span", { style: "font-weight: bold; color: var(--pine-800);" }, "NATIONAL IDENTITY CARD")
        ]),
        el("div", { style: "display: flex; gap: 20px; margin-top: 15px; align-items: center;" }, [
          el("div", { style: "padding: 15px; background: #ddd; border-radius: 6px; display: flex; align-items: center; justify-content: center;" }, [
            el("i", { "data-lucide": "user-round", style: "width: 48px; height: 48px; color: #555;" })
          ]),
          el("div", { style: "font-size: 13px; line-height: 1.6;" }, [
            el("div", {}, `Document No: ${desc}`),
            el("div", {}, "Expiry Date: 30-JUN-2031"),
            el("div", {}, "Authority: National Identification and Registration Authority (NIRA)")
          ])
        ])
      ]);
    }

    refreshIcons();

    return [
      viewerEl,
      el("div", { class: "modal-actions" }, [
        el("button", { class: "btn btn-secondary", onclick: closeFn }, "Close")
      ])
    ];
  });
}

// ---------------------------------------------------------------------------
// Registration approval / rejection
// ---------------------------------------------------------------------------
async function approveRegistration(root, member) {
  const ok = await confirmDialog(`Approve registration for ${member.first_name} ${member.last_name}?`, "Approve", false);
  if (!ok) return;
  try {
    await api.patch(`/api/v1/members/${member.id}`, { status: "active" });
    showToast("Registration approved successfully.", "success");
    detailCache = { memberId: null, data: null };
    await renderDetail(root, member.id);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function rejectRegistration(root, member) {
  openModal("Reject Registration", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const reasonInput = el("textarea", { placeholder: "Specify the exact reason for rejection...", rows: 3, required: true });
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Rejection Reason"), reasonInput]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-danger" }, "Confirm Rejection")
      ])
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post("/api/v1/risk/flags", {
          flag_type: "ghost_member",
          description: `Registration rejected for ${member.first_name} ${member.last_name}: ${reasonInput.value}`
        });
        await api.patch(`/api/v1/members/${member.id}`, { status: "exited" });
        showToast("Registration rejected.", "success");
        closeFn();
        state.selectedId = null;
        detailCache = { memberId: null, data: null };
        await renderMembers(root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });

    return [form];
  });
}

// ---------------------------------------------------------------------------
// Create member
// ---------------------------------------------------------------------------
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
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
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
        submitBtn.disabled = false;
      }
    });

    return [form];
  });
}

// ---------------------------------------------------------------------------
// Bulk CSV upload
// ---------------------------------------------------------------------------
function openBulkUploadModal(root) {
  openModal("Bulk Onboard Members via CSV", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const fileInput = el("input", { type: "file", accept: ".csv", required: true });
    const progressEl = el("p", { class: "muted small", hidden: true });

    const form = el("form", {}, [
      el("p", { class: "muted" }, "Select a CSV file containing columns: First Name, Last Name, National ID, Phone, Email (optional), Physical Address (optional)."),
      el("div", { class: "field" }, [el("label", {}, "Upload CSV File"), fileInput]),
      progressEl,
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Start Upload")
      ])
    ]);

    function parseCSVLine(text) {
      const result = [];
      let start = 0;
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(cleanValue(text.substring(start, i)));
          start = i + 1;
        }
      }
      result.push(cleanValue(text.substring(start)));
      return result;
    }

    function cleanValue(val) {
      val = val.trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
      }
      return val.replace(/""/g, '"').trim() || null;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      const file = fileInput.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target.result;
        progressEl.hidden = false;
        progressEl.textContent = "Parsing CSV lines...";

        try {
          const lines = text.split(/\r?\n/);
          let uploaded = 0;
          let failed = 0;
          const failedLines = [];

          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = parseCSVLine(line);

            if (parts.length >= 4 && parts[0] && parts[1] && parts[2] && parts[3]) {
              const [first, last, nid, phone, email, address] = parts;
              try {
                await api.post("/api/v1/members", {
                  first_name: first,
                  last_name: last,
                  national_id: nid,
                  phone_number: phone,
                  email: email || null,
                  physical_address: address || null
                });
                uploaded++;
              } catch (e) {
                console.error(`Bulk upload error at line ${i + 1}:`, e);
                failed++;
                failedLines.push(i + 1);
              }
              progressEl.textContent = `Uploading: ${uploaded} succeeded, ${failed} failed...`;
            } else {
              console.warn(`Skipped invalid line ${i + 1} (missing required columns):`, line);
              failed++;
              failedLines.push(i + 1);
            }
          }

          showToast(
            `Bulk onboarding complete. ${uploaded} onboarded${failed ? `, ${failed} failed (lines: ${failedLines.slice(0, 8).join(", ")}${failedLines.length > 8 ? "\u2026" : ""})` : ""}.`,
            failed ? "error" : "success"
          );
          closeFn();
          await renderMembers(root);
        } catch (err) {
          errorEl.textContent = "Failed to parse CSV file: " + err.message;
          errorEl.hidden = false;
        }
      };
      reader.readAsText(file);
    });

    return [form];
  });
}

// ---------------------------------------------------------------------------
// Edit member / status management
// ---------------------------------------------------------------------------
function openEditMemberModal(root, member) {
  openModal(`Manage Status \u2014 ${member.first_name} ${member.last_name}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const phoneInput = el("input", { id: "e-phone", value: member.phone_number });
    const emailInput = el("input", { id: "e-email", type: "email", value: member.email || "" });
    const addressInput = el("input", { id: "e-address", value: member.physical_address || "" });
    const statusSelect = el(
      "select", { id: "e-status" },
      ["active", "dormant", "suspended", "exited"].map((s) =>
        el("option", { value: s, selected: s === member.status },
          s === "suspended" ? "Suspended (Freeze Account)" : titleCase(s)
        )
      )
    );
    const branchSelect = el("select", { id: "e-branch" }, [el("option", { value: "" }, "Loading branches\u2026")]);
    getBranches().then((branches) => {
      branchSelect.innerHTML = "";
      branchSelect.appendChild(el("option", { value: "" }, "\u2014 No branch assigned \u2014"));
      branches.forEach((b) => branchSelect.appendChild(el("option", { value: b.id, selected: b.id === member.branch_id }, b.name)));
    }).catch(() => { branchSelect.innerHTML = "<option value=''>Could not load branches</option>"; });

    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Phone number"), phoneInput]),
      el("div", { class: "field" }, [el("label", {}, "Email"), emailInput]),
      el("div", { class: "field" }, [el("label", {}, "Address"), addressInput]),
      el("div", { class: "field" }, [el("label", {}, "Branch"), branchSelect]),
      el("div", { class: "field" }, [
        el("label", {}, "Account Status Configuration"),
        statusSelect,
        el("div", { class: "field-hint" }, "Setting status to 'Suspended' freezes savings payouts, share transfers, and loan disbursements immediately.")
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
          phone_number: phoneInput.value,
          email: emailInput.value || null,
          physical_address: addressInput.value || null,
          status: statusSelect.value,
          branch_id: branchSelect.value || null,
        });
        showToast("Member status updated.", "success");
        closeFn();
        detailCache = { memberId: null, data: null };
        renderDetail(root, member.id);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });

    return [form];
  });
}

// ---------------------------------------------------------------------------
// Share reallocation
// ---------------------------------------------------------------------------
function openShareReallocation(root, member, holdings) {
  openModal(`Share Reallocation — ${member.first_name} ${member.last_name}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    let counterparty = null;

    const sharesInput = el("input", { id: "sr-shares", type: "number", required: true, min: "1", placeholder: "Shares to transfer" });
    const productSelect = el("select", {}, holdings.map(h => el("option", { value: h.product_id || "default" }, `Shares Class (${h.number_of_shares} owned)`)));

    const picker = memberPicker(
      (q) => api.get(`/api/v1/members?q=${encodeURIComponent(q)}`).then((r) => r.items),
      (m) => { counterparty = m; }
    );

    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Select Shares Class"), productSelect]),
      el("div", { class: "field" }, [el("label", {}, "Number of Shares to Transfer"), sharesInput]),
      el("div", { class: "field" }, [el("label", {}, "Counterparty Recipient Member"), picker]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Execute Reallocation")
      ])
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      if (!counterparty) { errorEl.textContent = "Select a recipient member first."; errorEl.hidden = false; return; }
      try {
        const prodId = productSelect.value === "default" ? "default" : productSelect.value;
        await api.post(`/api/v1/shares/members/${member.id}/products/${prodId}/transactions`, {
          txn_type: "transfer",
          number_of_shares: Number(sharesInput.value),
          counterparty_member_id: counterparty.id
        });
        showToast("Shares reallocated successfully.", "success");
        closeFn();
        detailCache = { memberId: null, data: null };
        renderDetail(root, member.id);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });

    return [form];
  });
}