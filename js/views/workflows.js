// ============================================================================
// Approvals Queue (Workflows)
// Aggregates pending loans, risk flags, and dormant-member verifications
// into a single decisioning surface. The queue is fetched once and
// re-sorted / re-filtered client-side for snappy interactions.
// ============================================================================

import { api } from "../api.js";
import {
  el, mount, formatDate, formatDateTime, titleCase, badge, dataTable,
  showToast, refreshIcons,
} from "../utils.js";
import {
  Card, Toolbar, SegmentedControl, SearchInput, StatCard, ColorChip,
  EmptyState, ErrorState, SkeletonCard, PageHeader, openDrawer, exportToCsv,
} from "../ui.js";
import { goTo } from "../router.js";
import { loadWorkflowQueue, relativeTime } from "../domain.js";

// --- Module state ------------------------------------------------------------

/** Last-fetched queue. Refreshed by the Refresh button or pull-to-refresh. */
let queueItems = [];

/** Currently applied filters. */
let activeModule = "all";
let activePriority = "all";
let searchQuery = "";

/** Per-module counts (derived from `queueItems` after every fetch). */
let moduleCounts = { all: 0, loans: 0, risk: 0, members: 0 };

/** Convenience lookup so row click can fetch details. */
let userNamesById = new Map();

/** Where the table body lives so the segment/search handlers can re-render. */
let tableHolder = null;
let summaryHolder = null;
let lastError = null;

// --- Module / priority classification ----------------------------------------

const MODULE_META = {
  all:     { label: "All modules",   icon: "layers" },
  loans:   { label: "Loans",         icon: "hand-coins" },
  risk:    { label: "Risk flags",    icon: "shield-alert" },
  members: { label: "Members",       icon: "user-check" },
};

const PRIORITY_META = {
  all:    { label: "All priorities", tone: "neutral" },
  high:   { label: "High",           tone: "danger" },
  normal: { label: "Normal",         tone: "neutral" },
};

// --- Helpers -----------------------------------------------------------------

function matchesModule(item) {
  if (activeModule === "all") return true;
  if (activeModule === "loans")   return item.type === "Loan Application";
  if (activeModule === "risk")    return item.type === "Risk Flag";
  if (activeModule === "members") return item.type === "Member Verification";
  return true;
}

function matchesPriority(item) {
  if (activePriority === "all") return true;
  return (item.priority || "normal") === activePriority;
}

function matchesSearch(item) {
  if (!searchQuery) return true;
  const haystack = [
    item.type, item.description, item.action, item.id,
    item.entity?.loan_number, item.entity?.member_number, item.entity?.flag_type,
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(searchQuery.toLowerCase());
}

/** Stable, deterministic ordering for the queue. The display order is
 *  always: high-priority → normal, then most-recent first within each
 *  group, with a tiebreaker on description so equal-date rows don't jump. */
function sortQueue(items) {
  return [...items].sort((a, b) => {
    const pa = a.priority === "high" ? 0 : 1;
    const pb = b.priority === "high" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const da = new Date(a.created_at || 0).getTime();
    const db = new Date(b.created_at || 0).getTime();
    if (da !== db) return db - da;
    return String(a.description || "").localeCompare(String(b.description || ""));
  });
}

function recomputeModuleCounts() {
  moduleCounts = { all: queueItems.length, loans: 0, risk: 0, members: 0 };
  queueItems.forEach((item) => {
    if (item.type === "Loan Application") moduleCounts.loans++;
    else if (item.type === "Risk Flag") moduleCounts.risk++;
    else if (item.type === "Member Verification") moduleCounts.members++;
  });
}

function priorityChip(priority) {
  if (priority === "high") {
    return el("span", { class: "priority-pill priority-high" }, [
      el("i", { "data-lucide": "flame", class: "priority-icon" }),
      "High",
    ]);
  }
  return el("span", { class: "priority-pill priority-normal" }, "Normal");
}

function typeCell(item) {
  const iconMap = {
    "Loan Application": "file-text",
    "Risk Flag": "shield-alert",
    "Member Verification": "user-check",
  };
  return el("div", { class: "type-cell" }, [
    el("div", { class: "type-icon" }, [el("i", { "data-lucide": iconMap[item.type] || "circle" })]),
    el("div", {}, [
      el("div", { class: "type-label" }, titleCase(item.type)),
      item.entity?.loan_number
        ? el("div", { class: "muted small mono" }, item.entity.loan_number)
        : null,
    ].filter(Boolean)),
  ]);
}

function descriptionCell(item) {
  const wrap = el("div", { class: "desc-cell" });
  wrap.appendChild(el("div", { class: "desc-primary" }, item.description || "—"));
  if (item.entity?.purpose) {
    wrap.appendChild(el("div", { class: "muted small desc-quote" }, `“${item.entity.purpose}”`));
  } else if (item.entity?.first_name) {
    wrap.appendChild(el("div", { class: "muted small" },
      `${item.entity.first_name} ${item.entity.last_name} · ${item.entity.member_number || ""}`.trim()
    ));
  } else if (item.entity?.flag_type) {
    wrap.appendChild(el("div", { class: "muted small" }, titleCase(item.entity.flag_type)));
  }
  return wrap;
}

function ageCell(item) {
  if (!item.created_at) return el("span", { class: "muted" }, "—");
  const date = new Date(item.created_at);
  if (Number.isNaN(date.getTime())) return el("span", { class: "muted" }, "—");
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  const tone = days >= 7 ? "rose" : days >= 3 ? "amber" : "blue";
  return el("div", { class: "age-cell" }, [
    el("span", { class: "age-date" }, formatDate(item.created_at)),
    el("span", {}, ColorChip({ label: relativeTime(item.created_at), tone })),
  ]);
}

function actionCell(item) {
  return el("div", { class: "table-actions" }, [
    el("button", {
      class: "btn btn-primary btn-sm",
      onclick: (e) => { e.stopPropagation(); openItemDetail(item); },
    }, [
      el("i", { "data-lucide": "arrow-right", style: "width:14px;height:14px;margin-right:4px;" }),
      "Review",
    ]),
    el("button", {
      class: "icon-btn",
      title: "Open in module",
      onclick: (e) => {
        e.stopPropagation();
        if (item.href) goTo(item.href.replace("#", ""));
      },
    }, [el("i", { "data-lucide": "external-link" })]),
  ]);
}

function filteredAndSorted() {
  return sortQueue(
    queueItems.filter((item) => matchesModule(item) && matchesPriority(item) && matchesSearch(item))
  );
}

// --- Detail drawer -----------------------------------------------------------

function openItemDetail(item) {
  const entity = item.entity || {};
  const meta = MODULE_META[
    item.type === "Loan Application" ? "loans"
    : item.type === "Risk Flag" ? "risk"
    : "members"
  ];

  const body = el("div", { class: "drawer-stack" });

  // Header card: priority + type
  body.appendChild(el("div", { class: "drawer-row drawer-row-tight" }, [
    priorityChip(item.priority),
    ColorChip({ label: titleCase(item.type), tone: "neutral" }),
    entity.flag_type ? ColorChip({ label: titleCase(entity.flag_type), tone: "violet" }) : null,
  ].filter(Boolean)));

  // Description block
  body.appendChild(el("div", { class: "drawer-section" }, [
    el("div", { class: "muted small" }, "Summary"),
    el("div", { class: "drawer-headline" }, item.description || "—"),
  ]));

  // Key-value grid of common fields
  const kv = [];
  if (item.created_at) kv.push({ label: "Created", value: formatDateTime(item.created_at) });
  if (entity.amount_requested) kv.push({ label: "Amount requested", value: `UGX ${entity.amount_requested.toLocaleString()}`, mono: true });
  if (entity.repayment_months) kv.push({ label: "Term", value: `${entity.repayment_months} months` });
  if (entity.member_number)    kv.push({ label: "Member", value: entity.member_number, mono: true });
  if (entity.national_id)       kv.push({ label: "National ID", value: entity.national_id, mono: true });
  if (entity.status)            kv.push({ label: "Status", value: badge(entity.status) });
  if (entity.purpose)           kv.push({ label: "Purpose", value: entity.purpose });
  if (kv.length) body.appendChild(el("div", { class: "kv-grid", style: "display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;" },
    kv.map(({ label, value, mono }) => el("div", {}, [
      el("div", { class: "muted small" }, label),
      el("div", { class: mono ? "ledger" : "" }, value || "—"),
    ]))
  ));

  // Quick action: open the parent module
  body.appendChild(el("div", { class: "drawer-section" }, [
    el("button", {
      class: "btn btn-secondary btn-block",
      onclick: () => { if (item.href) goTo(item.href.replace("#", "")); },
    }, [
      el("i", { "data-lucide": meta.icon, style: "width:16px;height:16px;margin-right:6px;" }),
      `Open in ${meta.label}`,
    ]),
  ]));

  openDrawer({
    title: `Review · ${titleCase(item.type)}`,
    buildBody: () => body,
    footer: (close) => [
      el("button", { class: "btn btn-secondary", onclick: close }, "Close"),
    ],
  });
  refreshIcons();
}

// --- Rendering ---------------------------------------------------------------

async function fetchQueue() {
  queueItems = await loadWorkflowQueue(api);
  recomputeModuleCounts();
  // Pre-resolve any referenced member / user names for nicer descriptions.
  const ids = new Set();
  queueItems.forEach((item) => {
    if (item.entity?.created_by) ids.add(item.entity.created_by);
    if (item.entity?.member_id) ids.add(item.entity.member_id);
  });
  if (ids.size) {
    try {
      const users = await api.get("/api/v1/admin/users").catch(() => []);
      userNamesById = new Map(users.map((u) => [u.id, u.full_name]));
    } catch { userNamesById = new Map(); }
  }
}

function renderKpis() {
  const total = queueItems.length;
  const high = queueItems.filter((i) => i.priority === "high").length;
  const oldest = queueItems.reduce((acc, i) => {
    if (!i.created_at) return acc;
    const days = Math.floor((Date.now() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(acc, days);
  }, 0);

  // Total potential value (only for items that carry an amount).
  const value = queueItems.reduce((sum, i) => sum + Number(i.entity?.amount_requested || 0), 0);

  mount(summaryHolder, [
    StatCard({
      label: "Pending items",
      value: total.toLocaleString(),
      sub: `${moduleCounts.loans} loans · ${moduleCounts.risk} flags · ${moduleCounts.members} verifications`,
      tone: "pine", icon: "inbox",
    }),
    StatCard({
      label: "High priority",
      value: high.toLocaleString(),
      sub: high ? "Needs immediate attention" : "All caught up",
      tone: high ? "danger" : "success",
      icon: high ? "flame" : "check-circle",
    }),
    StatCard({
      label: "Oldest in queue",
      value: oldest ? `${oldest}d` : "—",
      sub: oldest ? "Since last action" : "No backlog",
      tone: oldest >= 7 ? "danger" : oldest >= 3 ? "warn" : "pine",
      icon: "clock",
    }),
    StatCard({
      label: "Total exposure",
      value: value ? `UGX ${(value / 1_000_000).toFixed(1)}M` : "UGX 0",
      sub: value ? "Sum of pending loan requests" : "No loan items queued",
      tone: "brass", icon: "hand-coins",
    }),
  ]);
  refreshIcons(summaryHolder);
}

function renderToolbar() {
  const moduleOptions = [
    { value: "all",     label: MODULE_META.all.label },
    { value: "loans",   label: `${MODULE_META.loans.label} · ${moduleCounts.loans}` },
    { value: "risk",    label: `${MODULE_META.risk.label} · ${moduleCounts.risk}` },
    { value: "members", label: `${MODULE_META.members.label} · ${moduleCounts.members}` },
  ];
  const priorityOptions = [
    { value: "all",    label: PRIORITY_META.all.label },
    { value: "high",   label: PRIORITY_META.high.label },
    { value: "normal", label: PRIORITY_META.normal.label },
  ];

  return Toolbar({
    children: [
      SearchInput({
        placeholder: "Search by reference, name, or description…",
        value: searchQuery,
        onInput: (v) => { searchQuery = v; renderTable(); },
      }),
      el("div", { class: "toolbar-group" }, [
        el("span", { class: "muted small toolbar-label" }, "Module"),
        SegmentedControl({
          options: moduleOptions,
          value: activeModule,
          onChange: (v) => { activeModule = v; renderTable(); },
        }),
      ]),
      el("div", { class: "toolbar-group" }, [
        el("span", { class: "muted small toolbar-label" }, "Priority"),
        SegmentedControl({
          options: priorityOptions,
          value: activePriority,
          onChange: (v) => { activePriority = v; renderTable(); },
        }),
      ]),
      el("div", { class: "toolbar-spacer" }),
      el("button", {
        class: "btn btn-secondary",
        onclick: () => {
          const rows = filteredAndSorted().map((i) => [
            i.priority, i.type, i.description,
            i.created_at ? new Date(i.created_at).toISOString() : "",
            i.href || "",
          ]);
          exportToCsv(
            `approvals-queue-${new Date().toISOString().slice(0, 10)}.csv`,
            ["Priority", "Type", "Description", "Created", "Link"],
            rows
          );
          showToast("Queue exported.", "success");
        },
      }, [
        el("i", { "data-lucide": "download", style: "width:16px;height:16px;margin-right:6px;" }),
        "Export",
      ]),
      el("button", {
        class: "btn btn-primary",
        onclick: async () => {
          tableHolder.innerHTML = "";
          mount(tableHolder, SkeletonCard({ rows: 5 }));
          try {
            await fetchQueue();
            renderKpis();
            renderTable();
          } catch (err) {
            lastError = err;
            renderTable();
          }
        },
      }, [
        el("i", { "data-lucide": "refresh-cw", style: "width:16px;height:16px;margin-right:6px;" }),
        "Refresh",
      ]),
    ],
  });
}

function renderTable() {
  const rows = filteredAndSorted();
  if (!queueItems.length && lastError) {
    mount(tableHolder, ErrorState({
      title: "Couldn’t load the queue",
      body: lastError.message || "Please check your connection and try again.",
      onRetry: async () => {
        lastError = null;
        tableHolder.innerHTML = "";
        mount(tableHolder, SkeletonCard({ rows: 5 }));
        try { await fetchQueue(); renderKpis(); renderTable(); }
        catch (err) { lastError = err; renderTable(); }
      },
    }));
    return;
  }
  if (!rows.length) {
    mount(tableHolder, EmptyState({
      icon: "inbox",
      title: "Nothing pending",
      body: queueItems.length
        ? "No items match your current filters. Try clearing search or switching module."
        : "Queue clear — nothing needs your review right now.",
      action: queueItems.length
        ? el("button", {
            class: "btn btn-secondary btn-sm",
            onclick: () => {
              searchQuery = ""; activeModule = "all"; activePriority = "all";
              renderTable();
            },
          }, "Clear filters")
        : null,
    }));
    return;
  }

  const table = dataTable(
    [
      { header: "Priority", className: "col-priority", render: priorityChip },
      { header: "Type",     className: "col-type",     render: typeCell },
      { header: "Description", render: descriptionCell },
      { header: "Submitted", className: "col-age",     render: ageCell },
      { header: "",          className: "col-actions", render: actionCell },
    ],
    rows,
    "No items match your filters."
  );

  // Make rows clickable → open detail drawer
  table.querySelectorAll("tbody tr").forEach((tr, i) => {
    tr.classList.add("clickable");
    tr.addEventListener("click", () => openItemDetail(rows[i]));
  });

  mount(tableHolder, table);
  refreshIcons();
}

// --- Public entry point ------------------------------------------------------

export async function renderWorkflows(root) {
  const container = el("div", {});

  const header = PageHeader({
    title: "Approvals Queue",
    subtitle: "Pending decisions across loans, risk flags, and member verifications.",
    breadcrumbs: [
      { label: "Operations" },
      { label: "Approvals Queue" },
    ],
    actions: [
      el("button", { class: "btn btn-ghost btn-sm", onclick: () => goTo("/dashboard") }, [
        el("i", { "data-lucide": "arrow-left", style: "width:14px;height:14px;margin-right:4px;" }),
        "Back to dashboard",
      ]),
    ],
  });

  summaryHolder = el("div", { class: "grid grid-4", style: "margin-bottom: 16px;" });
  tableHolder = el("div", { class: "card table-card", style: "padding: 0;" });

  container.appendChild(header);
  container.appendChild(summaryHolder);
  container.appendChild(renderToolbar());
  container.appendChild(tableHolder);
  mount(root, container);

  // Initial load
  mount(summaryHolder, Array.from({ length: 4 }, () => SkeletonCard({ rows: 2 })));
  mount(tableHolder, SkeletonCard({ rows: 6 }));

  try {
    await fetchQueue();
    renderKpis();
    renderTable();
  } catch (err) {
    lastError = err;
    renderTable();
  }

  refreshIcons();
}
