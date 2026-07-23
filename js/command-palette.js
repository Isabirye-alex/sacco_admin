// ============================================================================
// Command palette (Ctrl+K / Cmd+K)
// Search-as-you-type launcher for routes, members, and quick actions.
// ============================================================================

import { el, debounce } from "./utils.js";
import { goTo } from "./router.js";
import { api } from "./api.js";
import { buildCommandIndex, searchCommands } from "./domain.js";

const ROUTES = [
  { path: "/dashboard", title: "Dashboard", group: "Operations", icon: "layout-dashboard", keywords: ["home", "overview", "kpi"] },
  { path: "/workflows", title: "Approvals", group: "Operations", icon: "check-square", keywords: ["queue", "pending", "approval"] },
  { path: "/members", title: "Members", group: "Operations", icon: "users", keywords: ["people", "kyc"] },
  { path: "/savings", title: "Savings", group: "Operations", icon: "wallet", keywords: ["deposits", "accounts"] },
  { path: "/loans", title: "Credit & Loans", group: "Operations", icon: "hand-coins", keywords: ["credit", "borrow"] },
  { path: "/accounting", title: "Accounting", group: "Back Office", icon: "calculator", keywords: ["ledger", "journal", "gl", "trial balance"] },
  { path: "/payroll", title: "HR & Payroll", group: "Back Office", icon: "briefcase-business", keywords: ["hr", "deduction", "employer"] },
  { path: "/shares", title: "Shares", group: "Back Office", icon: "pie-chart", keywords: ["equity", "dividend"] },
  { path: "/groups", title: "Groups", group: "Back Office", icon: "user-check", keywords: ["chama", "team"] },
  { path: "/notifications", title: "Notifications", group: "Back Office", icon: "bell", keywords: ["sms", "email", "push", "alert"] },
  { path: "/reports", title: "Reports", group: "Back Office", icon: "trending-up", keywords: ["analytics", "regulatory", "sasra"] },
  { path: "/risk", title: "Risk & Compliance", group: "Back Office", icon: "shield-alert", keywords: ["par", "dormancy", "compliance"] },
  { path: "/system", title: "System Health", group: "System", icon: "activity", keywords: ["uptime", "monitor", "telemetry"] },
  { path: "/referrals", title: "Referrals", group: "System", icon: "gift", keywords: ["invite", "commission"] },
  { path: "/users", title: "Users & Audit", group: "System", icon: "fingerprint", keywords: ["admin", "rbac", "log", "security"] },
];

const ACTIONS = [
  { id: "new-member", title: "Add a new member", group: "Quick Actions", icon: "user-plus", run: () => goTo("/members?action=new") },
  { id: "new-loan", title: "Open loan applications queue", group: "Quick Actions", icon: "file-plus", run: () => goTo("/loans?status=pending") },
  { id: "dormancy", title: "Run dormancy sweep", group: "Quick Actions", icon: "moon", run: () => goTo("/risk") },
  { id: "penalties", title: "Apply overdue penalties", group: "Quick Actions", icon: "alert-triangle", run: () => goTo("/risk") },
  { id: "interest", title: "Post monthly interest", group: "Quick Actions", icon: "percent", run: () => goTo("/savings") },
  { id: "dividends", title: "Declare dividends", group: "Quick Actions", icon: "coins", run: () => goTo("/shares?tab=dividends") },
  { id: "backup", title: "Trigger database backup", group: "Quick Actions", icon: "database", run: () => goTo("/users?tab=security") },
];

let open = false;
let activeIndex = 0;
let currentResults = [];

function close() {
  const overlay = document.querySelector(".cmdk-overlay");
  if (overlay) overlay.remove();
  open = false;
  activeIndex = 0;
  currentResults = [];
}

function openPalette() {
  if (open) return;
  open = true;
  const overlay = el("div", { class: "cmdk-overlay" });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  const input = el("input", { class: "cmdk-input", placeholder: "Type a command, search pages, or look up members…", autofocus: true });
  const resultsHolder = el("div", { class: "cmdk-results" });

  const palette = el("div", { class: "cmdk" }, [
    el("div", { class: "cmdk-input-wrap" }, [el("i", { "data-lucide": "search" }), input]),
    resultsHolder,
    el("div", { class: "cmdk-footer" }, [
      el("span", {}, [el("span", { class: "kbd" }, "↑↓"), " navigate"]),
      el("span", {}, [el("span", { class: "kbd" }, "↵"), " open"]),
      el("span", {}, [el("span", { class: "kbd" }, "esc"), " close"]),
    ]),
  ]);
  overlay.appendChild(palette);
  document.body.appendChild(overlay);

  setTimeout(() => input.focus(), 30);

  const routeIndex = buildCommandIndex(ROUTES);
  let members = [];

  const rerender = () => {
    const q = input.value.trim();
    let results = [];
    if (!q) {
      // Default: show navigation + recent actions
      results = [
        ...ROUTES.map((r) => ({ kind: "route", ...r })),
        ...ACTIONS,
      ].slice(0, 10);
    } else {
      const matched = searchCommands(routeIndex, q).map((r) => ({ kind: "route", ...r }));
      const actionMatches = ACTIONS.filter((a) => a.title.toLowerCase().includes(q.toLowerCase()));
      const memberMatches = members
        .filter((m) => `${m.first_name} ${m.last_name} ${m.member_number}`.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 5)
        .map((m) => ({
          kind: "member",
          id: m.id,
          title: `${m.first_name} ${m.last_name}`,
          group: "Members",
          desc: m.member_number,
          icon: "user",
          run: () => goTo(`/members?focus=${m.id}`),
        }));
      results = [...matched, ...actionMatches, ...memberMatches];
    }
    currentResults = results;
    if (activeIndex >= results.length) activeIndex = 0;
    if (results.length === 0) {
      resultsHolder.innerHTML = "";
      resultsHolder.appendChild(el("div", { class: "cmdk-empty" }, "No matches found."));
    } else {
      clearNode(resultsHolder);
      results.forEach((r, i) => {
        const row = el("div", {
          class: `cmdk-result ${i === activeIndex ? "active" : ""}`,
          onclick: () => { r.run ? r.run() : goTo(r.path); close(); },
          onmouseenter: () => { activeIndex = i; rerender(); },
        }, [
          el("i", { "data-lucide": r.icon || "arrow-right", class: "icon" }),
          el("div", { style: "flex: 1; min-width: 0;" }, [
            el("div", {}, r.title),
            r.desc ? el("div", { class: "muted small" }, r.desc) : null,
          ].filter(Boolean)),
          r.group ? el("span", { class: "group" }, r.group) : null,
        ]);
        resultsHolder.appendChild(row);
      });
      if (window.lucide) window.lucide.createIcons();
    }
  };

  const debouncedMemberSearch = debounce(async (q) => {
    if (!q) { members = []; rerender(); return; }
    try {
      const data = await api.get(`/api/v1/members?q=${encodeURIComponent(q)}&page_size=5`);
      members = data.items || [];
      rerender();
    } catch { members = []; }
  }, 200);

  input.addEventListener("input", (e) => {
    debouncedMemberSearch(e.target.value);
    rerender();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { activeIndex = Math.min(activeIndex + 1, currentResults.length - 1); rerender(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { activeIndex = Math.max(activeIndex - 1, 0); rerender(); e.preventDefault(); }
    else if (e.key === "Enter") {
      const r = currentResults[activeIndex];
      if (r) { r.run ? r.run() : goTo(r.path); close(); }
      e.preventDefault();
    } else if (e.key === "Escape") { close(); }
  });

  rerender();
}

export function initCommandPalette() {
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      openPalette();
    }
  });
  const trigger = document.getElementById("cmdk-trigger");
  if (trigger) trigger.addEventListener("click", openPalette);
}
