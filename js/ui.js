// ============================================================================
// SACCO Admin Portal — UI Primitives
// A small, dependency-free component library built on top of el().
// Provides: Card, StatCard, EmptyState, ErrorState, Skeleton, Toast upgrades,
// Drawer, Tabs, Pagination, SegmentedControl, ColorChip, RolePill, ProgressBar,
// Sparkline, MetricDelta, KeyValueGrid, ConfirmDanger, DateRange.
// ============================================================================

import { el, formatMoney, formatDate, formatDateTime, titleCase } from "./utils.js";

// --- Card ---------------------------------------------------------------------

export function Card({ title, subtitle, actions, className = "", children, noPadding = false }) {
  const card = el("div", { class: `card ${className}` });
  if (title || subtitle || actions) {
    const headerChildren = [];
    if (title || subtitle) {
      const head = el("div", {});
      if (title) head.appendChild(el("h3", {}, title));
      if (subtitle) head.appendChild(el("p", { class: "muted small" }, subtitle));
      headerChildren.push(head);
    }
    if (actions) headerChildren.push(actions);
    card.appendChild(el("div", { class: "card-header" }, headerChildren));
  }
  if (children) {
    const body = el("div", { class: noPadding ? "card-body no-pad" : "card-body" });
    const kids = Array.isArray(children) ? children : [children];
    kids.forEach((c) => c && body.appendChild(c));
    card.appendChild(body);
  }
  return card;
}

// --- Stat card with sparkline + delta ---------------------------------------

export function StatCard({ label, value, sub, tone = "pine", icon, delta, sparkData, onClick, href }) {
  const header = el("div", { class: "stat-header" }, [
    el("div", { class: "stat-label" }, label),
    icon ? el("div", { class: `stat-icon stat-icon-${tone}` }, [iconEl(icon)]) : null,
  ].filter(Boolean));

  let deltaEl = null;
  if (delta !== undefined && delta !== null) {
    const sign = delta >= 0 ? "+" : "";
    const cls = delta >= 0 ? "delta-up" : "delta-down";
    deltaEl = el("span", { class: `stat-delta ${cls}` }, `${sign}${delta.toFixed(2)}%`);
  }

  const valueRow = el("div", { class: "stat-value-row" }, [
    el("span", { class: "stat-value ledger" }, value),
    deltaEl,
  ].filter(Boolean));

  const footerChildren = [];
  if (sub) footerChildren.push(el("div", { class: "stat-sub" }, sub));
  if (sparkData && Array.isArray(sparkData) && sparkData.length > 1) {
    footerChildren.push(Sparkline(sparkData, tone));
  }

  const footer = el("div", { class: "stat-footer" }, footerChildren);

  const card = el("div", {
    class: `card stat-card stat-card-rich stat-${tone}${onClick || href ? " clickable" : ""}`,
    onclick: onClick || (href ? () => { window.location.hash = href; } : undefined),
  }, [header, valueRow, footer]);

  return card;
}

function iconEl(name) {
  const i = el("i", { "data-lucide": name, class: "stat-icon-svg" });
  return i;
}

// --- Sparkline ---------------------------------------------------------------

export function Sparkline(data, color = "pine") {
  const width = 100;
  const height = 32;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");
  const last = data[data.length - 1];
  const lastX = (data.length - 1) * step;
  const lastY = height - ((last - min) / range) * height;
  const colorMap = {
    pine: "#1B4B43", brass: "#A97F2A", danger: "#B3261E", success: "#1B4B43", warn: "#8A5A00",
  };
  const stroke = colorMap[color] || colorMap.pine;
  const svg = `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <polyline fill="none" stroke="${stroke}" stroke-width="1.6" points="${points}"/>
    <circle cx="${lastX}" cy="${lastY}" r="2.2" fill="${stroke}"/>
  </svg>`;
  const wrap = el("div", { class: "sparkline-wrap", html: svg });
  return wrap;
}

// --- Empty & error states ----------------------------------------------------

export function EmptyState({ icon = "inbox", title, body, action }) {
  const inner = [
    el("div", { class: "empty-icon" }, [el("i", { "data-lucide": icon })]),
    el("h4", {}, title || "Nothing to show"),
    body ? el("p", { class: "muted" }, body) : null,
    action || null,
  ].filter(Boolean);
  return el("div", { class: "empty-state empty-state-rich" }, inner);
}

export function ErrorState({ title = "Something went wrong", body, onRetry, retryLabel = "Try again" }) {
  const inner = [
    el("div", { class: "empty-icon error-icon" }, [el("i", { "data-lucide": "alert-triangle" })]),
    el("h4", {}, title),
    el("p", { class: "muted" }, body || "We couldn't load this data. Please try again."),
  ];
  if (onRetry) {
    inner.push(el("button", { class: "btn btn-primary btn-sm", onclick: onRetry }, retryLabel));
  }
  return el("div", { class: "empty-state empty-state-rich" }, inner);
}

// --- Skeleton loaders --------------------------------------------------------

export function SkeletonRow({ width = "100%", height = "14px" } = {}) {
  return el("div", { class: "skeleton-line", style: `width:${width};height:${height};` });
}

export function SkeletonBlock({ rows = 4 }) {
  return el("div", { class: "skeleton-block" }, Array.from({ length: rows }, () => SkeletonRow()));
}

export function SkeletonCard({ rows = 4 } = {}) {
  return el("div", { class: "card" }, [SkeletonBlock({ rows })]);
}

// --- Tabs --------------------------------------------------------------------

export function Tabs({ items, active, onChange, variant = "default" }) {
  const wrap = el("div", { class: `tabs tabs-${variant}` });
  items.forEach((item) => {
    const btn = el(
      "button",
      {
        class: `tab ${active === item.key ? "active" : ""}${item.badge ? " has-badge" : ""}`,
        onclick: () => onChange(item.key),
      },
      [item.icon ? el("i", { "data-lucide": item.icon, class: "tab-icon" }) : null, item.label, item.badge ? el("span", { class: "tab-badge" }, String(item.badge)) : null].filter(Boolean)
    );
    wrap.appendChild(btn);
  });
  return wrap;
}

// --- Segmented control -------------------------------------------------------

export function SegmentedControl({ options, value, onChange, name }) {
  const wrap = el("div", { class: "segmented", role: "tablist" });
  options.forEach((opt) => {
    const btn = el(
      "button",
      {
        class: `segmented-btn ${value === opt.value ? "active" : ""}`,
        type: "button",
        onclick: () => onChange(opt.value),
      },
      opt.label
    );
    wrap.appendChild(btn);
  });
  return wrap;
}

// --- Progress bar ------------------------------------------------------------

export function ProgressBar({ value, max = 100, tone = "pine", label, showValue = false }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const wrap = el("div", { class: "progress" });
  const fill = el("div", { class: `progress-fill progress-${tone}`, style: `width:${pct}%` });
  wrap.appendChild(fill);
  if (label || showValue) {
    wrap.appendChild(
      el("div", { class: "progress-meta" }, [
        el("span", {}, label || ""),
        showValue ? el("span", {}, `${pct.toFixed(1)}%`) : null,
      ].filter(Boolean))
    );
  }
  return wrap;
}

// --- Key-value grid ----------------------------------------------------------

export function KeyValueGrid({ items }) {
  const grid = el("div", { class: "kv-grid" });
  items.forEach(({ label, value, mono, tone }) => {
    const row = el("div", { class: "kv-row" }, [
      el("span", { class: "kv-label" }, label),
      el("span", { class: `kv-value${mono ? " ledger" : ""}${tone ? ` kv-tone-${tone}` : ""}` }, value || "—"),
    ]);
    grid.appendChild(row);
  });
  return grid;
}

// --- Color chip / category badge --------------------------------------------

const TONE_COLORS = {
  pine: { bg: "var(--pine-100)", fg: "var(--pine-800)" },
  brass: { bg: "var(--brass-100)", fg: "var(--brass-600)" },
  danger: { bg: "var(--danger-bg)", fg: "var(--danger)" },
  success: { bg: "var(--success-bg)", fg: "var(--success)" },
  warn: { bg: "var(--warn-bg)", fg: "var(--warn)" },
  neutral: { bg: "#EEECE4", fg: "var(--ink-600)" },
  blue: { bg: "#E0F2FE", fg: "#075985" },
  violet: { bg: "#EDE9FE", fg: "#5B21B6" },
  rose: { bg: "#FFE4E6", fg: "#BE123C" },
  emerald: { bg: "#D1FAE5", fg: "#065F46" },
};

export function ColorChip({ label, tone = "neutral" }) {
  const t = TONE_COLORS[tone] || TONE_COLORS.neutral;
  return el("span", { class: "color-chip", style: `background:${t.bg};color:${t.fg};` }, label);
}

// --- Metric delta ------------------------------------------------------------

export function MetricDelta({ value, suffix = "%", invert = false }) {
  const v = Number(value || 0);
  const up = invert ? v < 0 : v > 0;
  const down = invert ? v > 0 : v < 0;
  const cls = up ? "delta-up" : down ? "delta-down" : "delta-flat";
  const icon = up ? "trending-up" : down ? "trending-down" : "minus";
  return el("span", { class: `metric-delta ${cls}` }, [
    el("i", { "data-lucide": icon, class: "delta-icon" }),
    `${v >= 0 ? "+" : ""}${v.toFixed(2)}${suffix}`,
  ]);
}

// --- Drawer (slide-over panel) ----------------------------------------------

export function openDrawer({ title, width = "440px", buildBody, footer }) {
  const overlay = el("div", { class: "drawer-overlay" });
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  const drawer = el("aside", { class: "drawer", style: `width:${width};` }, [
    el("header", { class: "drawer-header" }, [
      el("h3", {}, title),
      el("button", { class: "icon-btn", onclick: close, "aria-label": "Close" }, [el("i", { "data-lucide": "x" })]),
    ]),
    el("div", { class: "drawer-body" }, buildBody(close)),
  ]);
  if (footer) {
    drawer.appendChild(el("footer", { class: "drawer-footer" }, footer(close)));
  }
  overlay.appendChild(drawer);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("open"));
  return close;
}

// --- Toolbar -----------------------------------------------------------------

export function Toolbar({ children }) {
  return el("div", { class: "toolbar toolbar-rich" }, children);
}

// --- Date range picker -------------------------------------------------------

export function DateRange({ fromValue, toValue, onChange }) {
  const from = el("input", { type: "date", value: fromValue || "" });
  const to = el("input", { type: "date", value: toValue || "" });
  from.addEventListener("change", () => onChange?.({ from: from.value, to: to.value }));
  to.addEventListener("change", () => onChange?.({ from: from.value, to: to.value }));
  return el("div", { class: "date-range" }, [
    el("input", { type: "date", value: fromValue || "", onchange: (e) => { from.value = e.target.value; onChange?.({ from: e.target.value, to: to.value }); } }),
    el("span", { class: "muted" }, "to"),
    el("input", { type: "date", value: toValue || "", onchange: (e) => { to.value = e.target.value; onChange?.({ from: from.value, to: e.target.value }); } }),
  ]);
}

// --- Export helpers ----------------------------------------------------------

export function exportToCsv(filename, headers, rows) {
  const escape = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

export function exportToJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

// --- Search input ------------------------------------------------------------

export function SearchInput({ placeholder = "Search…", value = "", onInput, debounceMs = 200, className = "" }) {
  let t;
  const input = el("input", {
    type: "text",
    placeholder,
    value,
    class: `search-input ${className}`,
    oninput: (e) => {
      clearTimeout(t);
      const v = e.target.value;
      t = setTimeout(() => onInput?.(v), debounceMs);
    },
  });
  const wrap = el("div", { class: "search-input-wrap" }, [
    el("i", { "data-lucide": "search", class: "search-icon" }),
    input,
  ]);
  return wrap;
}

// --- Page header (breadcrumb + title) ---------------------------------------

export function PageHeader({ title, subtitle, breadcrumbs, actions }) {
  const head = el("div", { class: "page-header" });
  if (breadcrumbs && breadcrumbs.length) {
    const trail = el("nav", { class: "breadcrumbs", "aria-label": "Breadcrumb" });
    breadcrumbs.forEach((bc, i) => {
      if (i > 0) trail.appendChild(el("span", { class: "bc-sep" }, "/"));
      if (bc.href) {
        trail.appendChild(el("a", { href: bc.href, class: "bc-link" }, bc.label));
      } else {
        trail.appendChild(el("span", { class: "bc-current" }, bc.label));
      }
    });
    head.appendChild(trail);
  }
  const titleRow = el("div", { class: "page-header-row" });
  const t = el("div", { class: "page-header-titles" });
  t.appendChild(el("h1", { class: "page-title" }, title));
  if (subtitle) t.appendChild(el("p", { class: "page-subtitle muted" }, subtitle));
  titleRow.appendChild(t);
  if (actions) titleRow.appendChild(el("div", { class: "page-header-actions" }, actions));
  head.appendChild(titleRow);
  return head;
}

// --- Money / amount formatting helper that pulls from utils ------------------

export { formatMoney, formatDate, formatDateTime, titleCase };
