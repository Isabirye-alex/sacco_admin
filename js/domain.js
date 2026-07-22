// ============================================================================
// SACCO Admin Portal — Business logic utilities
// Domain-specific algorithms and helpers (credit scoring, risk grading,
// queue management, etc).
// ============================================================================

import { formatMoney, formatDate } from "./utils.js";

// ============================================================================
// CREDIT SCORING ENGINE
// Composite 0-1000 credit score built from:
//   - savings balance (relative to loan request)
//   - share capital (collateral cushion)
//   - loan history (repayment behaviour)
//   - tenure as member
//   - active default flags
// Each component normalised 0-200, summed 0-1000. Grade A-D for risk banding.
// ============================================================================

const SCORE_BANDS = [
  { min: 850, grade: "A", label: "Excellent", color: "success" },
  { min: 700, grade: "B", label: "Good", color: "success" },
  { min: 550, grade: "C", label: "Fair", color: "warn" },
  { min: 400, grade: "D", label: "High Risk", color: "danger" },
  { min: 0, grade: "E", label: "Very High Risk", color: "danger" },
];

/**
 * @param {Object} params
 * @param {number} params.savingsBalance      Current total savings across accounts (UGX)
 * @param {number} params.shareValue          Share holdings × nominal value (UGX)
 * @param {number} params.requestedAmount     Loan amount requested (UGX)
 * @param {Object[]} params.loanHistory       Array of past loans {status, amount_requested, amount_approved, ...}
 * @param {string} params.memberSince         ISO date of joining
 * @param {number} params.openFlags           Open risk flags count
 */
export function computeCreditScore({ savingsBalance = 0, shareValue = 0, requestedAmount = 0, loanHistory = [], memberSince, openFlags = 0 }) {
  const components = {
    savings: scoreSavings(savingsBalance, requestedAmount),
    shares: scoreShares(shareValue, requestedAmount),
    history: scoreHistory(loanHistory),
    tenure: scoreTenure(memberSince),
    flags: scoreFlags(openFlags),
  };

  const total = components.savings + components.shares + components.history + components.tenure + components.flags;
  const band = scoreBand(total);

  // Build human-readable breakdown
  const factors = [];
  if (components.savings < 100) factors.push({ severity: "warn", text: "Thin savings cushion relative to loan size" });
  if (components.shares < 80) factors.push({ severity: "warn", text: "Limited share capital coverage" });
  if (components.history < 100) factors.push({ severity: "danger", text: "Prior loan repayment issues detected" });
  if (components.tenure < 80) factors.push({ severity: "info", text: "Relatively new member (< 12 months tenure)" });
  if (components.flags > 0) factors.push({ severity: "danger", text: `${openFlags} open risk flag(s) on profile` });
  if (total >= 700) factors.push({ severity: "success", text: "Strong overall profile" });

  return { total, band, components, factors };
}

function scoreSavings(savings, requested) {
  if (requested <= 0) return 100;
  const ratio = savings / Math.max(requested, 1);
  if (ratio >= 1.0) return 200;
  if (ratio >= 0.75) return 170;
  if (ratio >= 0.5) return 140;
  if (ratio >= 0.25) return 100;
  if (ratio >= 0.1) return 60;
  return 20;
}

function scoreShares(shares, requested) {
  if (requested <= 0) return 100;
  const ratio = shares / Math.max(requested, 1);
  if (ratio >= 3.0) return 200;
  if (ratio >= 2.0) return 170;
  if (ratio >= 1.0) return 130;
  if (ratio >= 0.5) return 80;
  if (ratio > 0) return 40;
  return 0;
}

function scoreHistory(loans) {
  if (!loans.length) return 100;
  let score = 100;
  let active = 0, defaulted = 0, closed = 0, rejected = 0;
  loans.forEach((l) => {
    const s = (l.status || "").toLowerCase();
    if (s === "active" || s === "disbursed") active++;
    else if (s === "defaulted") { defaulted++; score -= 80; }
    else if (s === "closed") { closed++; score += 10; }
    else if (s === "rejected") { rejected++; score -= 20; }
  });
  return Math.max(0, Math.min(200, score));
}

function scoreTenure(memberSince) {
  if (!memberSince) return 60;
  const months = (Date.now() - new Date(memberSince).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (months >= 60) return 200;
  if (months >= 36) return 170;
  if (months >= 24) return 140;
  if (months >= 12) return 110;
  if (months >= 6) return 80;
  if (months >= 3) return 50;
  return 30;
}

function scoreFlags(flags) {
  if (flags >= 3) return 0;
  if (flags === 2) return 30;
  if (flags === 1) return 70;
  return 200;
}

export function scoreBand(total) {
  return SCORE_BANDS.find((b) => total >= b.min) || SCORE_BANDS[SCORE_BANDS.length - 1];
}

export const SCORE_TIERS = SCORE_BANDS;

// ============================================================================
// PORTFOLIO AGING ANALYSIS
// Loans bucketed by days overdue. Returns counts and outstanding amounts per bucket.
// ============================================================================

export function loanAgingBuckets(loans, schedulesByLoan = {}) {
  const buckets = [
    { key: "current", label: "Current", min: -Infinity, max: 0, count: 0, outstanding: 0 },
    { key: "1-30", label: "1–30 days", min: 1, max: 30, count: 0, outstanding: 0 },
    { key: "31-60", label: "31–60 days", min: 31, max: 60, count: 0, outstanding: 0 },
    { key: "61-90", label: "61–90 days", min: 61, max: 90, count: 0, outstanding: 0 },
    { key: "90+", label: "90+ days", min: 91, max: Infinity, count: 0, outstanding: 0 },
  ];

  const now = Date.now();
  loans.forEach((loan) => {
    if (!["active", "disbursed", "defaulted"].includes(loan.status)) return;
    const schedule = schedulesByLoan[loan.id] || [];
    const unpaid = schedule.filter((s) => !s.is_paid);
    const oldestOverdueDays = unpaid.reduce((max, s) => {
      if (!s.due_date) return max;
      const d = Math.floor((now - new Date(s.due_date).getTime()) / (1000 * 60 * 60 * 24));
      return Math.max(max, d);
    }, 0);
    const outstanding = Number(loan.amount_approved || loan.amount_requested || 0);
    const bucket = buckets.find((b) => oldestOverdueDays >= b.min && oldestOverdueDays <= b.max);
    if (bucket) {
      bucket.count++;
      bucket.outstanding += outstanding;
    }
  });

  const totalOutstanding = buckets.reduce((s, b) => s + b.outstanding, 0);
  return { buckets, totalOutstanding };
}

// ============================================================================
// MEMBER RISK SEGMENTATION
// Categorise members into risk segments for portfolio review.
// ============================================================================

export function memberRiskSegments(members, { savingsByMember, loansByMember, flagsByMember } = {}) {
  const segments = {
    "Healthy & Active": [],
    "Watch List": [],
    "At Risk": [],
    "Dormant": [],
    "Exited": [],
  };

  members.forEach((m) => {
    const status = (m.status || "").toLowerCase();
    if (status === "exited") return segments["Exited"].push(m);
    if (status === "dormant" || status === "suspended") return segments["At Risk"].push(m);

    const savings = savingsByMember?.get?.(m.id) || 0;
    const activeLoans = (loansByMember?.get?.(m.id) || []).filter((l) => ["active", "disbursed"].includes(l.status)).length;
    const defaultedLoans = (loansByMember?.get?.(m.id) || []).filter((l) => l.status === "defaulted").length;
    const flags = flagsByMember?.get?.(m.id) || 0;

    if (defaultedLoans > 0 || flags > 1) segments["Watch List"].push(m);
    else if (savings > 100000 && activeLoans === 0) segments["Healthy & Active"].push(m);
    else segments["Dormant"].push(m);
  });

  return segments;
}

// ============================================================================
// WORKFLOW QUEUE
// Aggregates all pending approval actions across the system into one queue
// for the Workflows module.
// ============================================================================

export async function loadWorkflowQueue(api) {
  const [loans, flags, members] = await Promise.all([
    api.get("/api/v1/loans/applications?loan_status=pending").catch(() => []),
    api.get("/api/v1/risk/flags?flag_status=open").catch(() => []),
    api.get("/api/v1/members?page_size=200&status=dormant").catch(() => ({ items: [] })),
  ]);

  const items = [];
  loans.filter((l) => ["pending", "under_review"].includes(l.status)).forEach((l) => {
    items.push({
      id: `loan-${l.id}`,
      type: "Loan Application",
      priority: l.amount_requested > 5000000 ? "HIGH" : "NORMAL",
      badgeVal: l.status || "pending",
      description: `${l.loan_number} — UGX ${formatMoney(l.amount_requested)} (${l.repayment_months || 12} mo)`,
      actionLabel: "Review Application",
      route: "/loans",
      created_at: l.created_at,
      entity: l,
    });
  });

  flags.forEach((f) => {
    items.push({
      id: `flag-${f.id}`,
      type: "Risk Flag",
      priority: ["ghost_member", "aml_suspicious_deposit"].includes(f.flag_type) ? "HIGH" : "NORMAL",
      badgeVal: "High Risk",
      description: f.description || titleCase(f.flag_type),
      actionLabel: "Investigate",
      route: "/risk",
      created_at: f.created_at || new Date().toISOString(),
      entity: f,
    });
  });

  (members.items || members || []).forEach((m) => {
    items.push({
      id: `member-${m.id}`,
      type: "Member Verification",
      priority: "NORMAL",
      badgeVal: "KYC Pending",
      description: `${m.first_name} ${m.last_name} (${m.member_number})`,
      actionLabel: "Verify Member",
      route: "/members",
      created_at: m.date_joined,
      entity: m,
    });
  });

  items.sort((a, b) => {
    const pa = a.priority === "HIGH" ? 0 : 1;
    const pb = b.priority === "HIGH" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  return items;
}

function titleCase(s) {
  return String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============================================================================
// SCHEDULED REPORTS - persists in localStorage with cron expression
// ============================================================================

const SCHEDULES_KEY = "sacco_scheduled_reports_v2";

export function loadSchedules() {
  try { return JSON.parse(localStorage.getItem(SCHEDULES_KEY) || "[]"); }
  catch { return []; }
}

export function saveSchedules(list) {
  localStorage.setItem(SCHEDULES_KEY, JSON.stringify(list));
}

// Human-friendly frequency → cron-ish description
export const FREQUENCIES = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
  { value: "quarterly", label: "Every quarter" },
  { value: "yearly", label: "Every year" },
];

// ============================================================================
// KENYA SHILLING / UGANDA SHILLING (project uses UGX)
// Amount parser tolerant of commas, spaces, currency symbols.
// ============================================================================

export function parseAmount(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[^\d.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function relativeTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// ============================================================================
// Command palette search index
// ============================================================================

export function buildCommandIndex(routes) {
  return routes.map((r) => ({
    ...r,
    search: `${r.title} ${r.group || ""} ${(r.keywords || []).join(" ")}`.toLowerCase(),
  }));
}

export function searchCommands(index, query) {
  const q = query.toLowerCase().trim();
  if (!q) return index.slice(0, 8);
  return index.filter((r) => r.search.includes(q)).slice(0, 8);
}