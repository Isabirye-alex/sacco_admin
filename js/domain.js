// ============================================================================
// SACCO Admin Portal — Business logic utilities
// Domain-specific algorithms and helpers (credit scoring, risk grading,
// queue management, portfolio analytics, etc).
// All public functions are pure where possible; helpers that touch
// localStorage or perform number formatting gracefully degrade when those
// globals are unavailable (e.g. server-side rendering, tests).
// ============================================================================

import { formatMoney, formatDate } from "./utils.js";

// ============================================================================
// SHARED CONSTANTS
// ============================================================================

/** Nominal value of a single share in UGX. Used wherever a share count is
 *  converted to a monetary figure. Centralised so callers don't duplicate
 *  the magic number. */
export const SHARE_NOMINAL_VALUE = 10000;

/** How many days of inactivity constitute a "dormant" member. The backend
 *  dormancy sweep uses the same constant when configured; this is the
 *  client-side default used for risk segmentation. */
export const DORMANCY_THRESHOLD_DAYS = 90;

/** Maximum number of items a single workflow queue can hold in local
 *  memory. The dashboard pagination uses this for the "Recent activity"
 *  timeline. */
export const MAX_QUEUE_ITEMS = 250;

/** Loans whose approved amount is more than this fraction of the member's
 *  share capital exceed SACCO statutory caps. */
export const SHARES_MULTIPLE_CAP = 3.0;

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
 * @typedef {Object} LoanHistoryEntry
 * @property {string} status - One of: pending, under_review, approved, rejected,
 *                              active, disbursed, closed, defaulted.
 * @property {number} [amount_requested]
 * @property {number} [amount_approved]
 *
 * @typedef {Object} CreditScoreParams
 * @property {number} [savingsBalance=0]    Current total savings across accounts (UGX)
 * @property {number} [shareValue=0]        Share holdings × nominal value (UGX)
 * @property {number} [requestedAmount=0]   Loan amount requested (UGX)
 * @property {LoanHistoryEntry[]} [loanHistory=[]]
 * @property {string} [memberSince]         ISO date of joining
 * @property {number} [openFlags=0]         Open risk flags count
 *
 * @typedef {Object} CreditScoreResult
 * @property {number} total - Composite score 0-1000
 * @property {{grade:string,label:string,color:string,min:number}} band
 * @property {Object} components - Per-axis breakdown 0-200
 * @property {Array<{severity:string,text:string}>} factors - Human-readable flags
 */

/**
 * @param {CreditScoreParams} params
 * @returns {CreditScoreResult}
 */
export function computeCreditScore({ savingsBalance = 0, shareValue = 0, requestedAmount = 0, loanHistory = [], memberSince, openFlags = 0 } = {}) {
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
  // 0-200. More savings relative to loan = higher score.
  if (requested <= 0) return 100; // No loan context, neutral
  if (savings <= 0) return 0;
  const ratio = savings / requested;
  if (ratio >= 1.0) return 200;       // 100% cover
  if (ratio >= 0.75) return 170;
  if (ratio >= 0.5) return 140;
  if (ratio >= 0.25) return 100;
  if (ratio >= 0.1) return 60;
  return 20;
}

function scoreShares(shares, requested) {
  // 0-200. Share capital acts as collateral. Standard 3x cap.
  if (requested <= 0) return 100;
  if (shares <= 0) return 0;
  const ratio = shares / requested;
  if (ratio >= 3.0) return 200;
  if (ratio >= 2.0) return 170;
  if (ratio >= 1.0) return 130;
  if (ratio >= 0.5) return 80;
  return 40;
}

function scoreHistory(loans) {
  if (!loans.length) return 100; // No history = neutral, not penalised
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
  const since = new Date(memberSince);
  if (Number.isNaN(since.getTime())) return 60;
  // 30.44 = average days in a calendar month; safe for any date range.
  const months = (Date.now() - since.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
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

/**
 * Resolve a numeric score to its band.
 * @param {number} total - 0-1000
 * @returns {{grade:string,label:string,color:string,min:number}}
 */
export function scoreBand(total) {
  if (!Number.isFinite(total) || total < 0) return SCORE_BANDS[SCORE_BANDS.length - 1];
  return SCORE_BANDS.find((b) => total >= b.min) || SCORE_BANDS[SCORE_BANDS.length - 1];
}

export const SCORE_TIERS = SCORE_BANDS;

// ============================================================================
// PORTFOLIO AGING ANALYSIS
// Loans bucketed by days overdue. Returns counts and outstanding amounts per bucket.
// ============================================================================

/**
 * Build the canonical loan-aging buckets used by the dashboard and the
 * risk module. Exposed so callers can render custom layouts (e.g. a
 * horizontal stacked bar) without duplicating the bucket definitions.
 * @returns {Array<{key:string,label:string,min:number,max:number,count:number,outstanding:number}>}
 */
export function loanAgingBucketDefinitions() {
  return [
    { key: "current", label: "Current", min: -Infinity, max: 0, count: 0, outstanding: 0 },
    { key: "1-30", label: "1–30 days", min: 1, max: 30, count: 0, outstanding: 0 },
    { key: "31-60", label: "31–60 days", min: 31, max: 60, count: 0, outstanding: 0 },
    { key: "61-90", label: "61–90 days", min: 61, max: 90, count: 0, outstanding: 0 },
    { key: "90+", label: "90+ days", min: 91, max: Infinity, count: 0, outstanding: 0 },
  ];
}

/**
 * @param {Object[]} loans
 * @param {Object<string,Object[]>} [schedulesByLoan]
 * @returns {{buckets:ReturnType<typeof loanAgingBucketDefinitions>, totalOutstanding:number, parPct:number}}
 */
export function loanAgingBuckets(loans, schedulesByLoan = {}) {
  const buckets = loanAgingBucketDefinitions();

  const now = Date.now();
  loans.forEach((loan) => {
    if (!["active", "disbursed", "defaulted"].includes(loan.status)) return;
    const schedule = schedulesByLoan[loan.id] || [];
    const unpaid = schedule.filter((s) => !s.is_paid);
    const oldestOverdueDays = unpaid.reduce((max, s) => {
      if (!s.due_date) return max;
      const due = new Date(s.due_date);
      if (Number.isNaN(due.getTime())) return max;
      const d = Math.floor((now - due.getTime()) / (1000 * 60 * 60 * 24));
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
  const overdueOutstanding = buckets
    .filter((b) => b.min > 0)
    .reduce((s, b) => s + b.outstanding, 0);
  const parPct = totalOutstanding > 0 ? (overdueOutstanding / totalOutstanding) * 100 : 0;
  return { buckets, totalOutstanding, overdueOutstanding, parPct };
}

// ============================================================================
// MEMBER RISK SEGMENTATION
// Categorise members into risk segments for portfolio review.
// ============================================================================

/**
 * @param {Object[]} members
 * @param {Object} [ctx]
 * @param {Map<string,number>} [ctx.savingsByMember]
 * @param {Map<string,Object[]>} [ctx.loansByMember]
 * @param {Map<string,number>} [ctx.flagsByMember]
 * @returns {Object<string,Object[]>} members grouped by segment
 */
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
    const memberLoans = loansByMember?.get?.(m.id) || [];
    const activeLoans = memberLoans.filter((l) => ["active", "disbursed"].includes(l.status)).length;
    const defaultedLoans = memberLoans.filter((l) => l.status === "defaulted").length;
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

/**
 * @typedef {Object} WorkflowQueueItem
 * @property {string} id
 * @property {string} type
 * @property {"high"|"normal"} priority
 * @property {string} description
 * @property {string} action
 * @property {string} href
 * @property {string} [created_at]
 * @property {Object} entity
 */

/**
 * Build a unified approval queue from loans, risk flags, and pending
 * member verifications. Each list endpoint is best-effort; if one fails
 * we degrade to an empty list rather than blowing up the whole queue.
 *
 * @param {{get:(path:string)=>Promise<any>}} api
 * @returns {Promise<WorkflowQueueItem[]>}
 */
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
      priority: l.amount_requested > 5000000 ? "high" : "normal",
      description: `${l.loan_number} — UGX ${formatMoney(l.amount_requested)} (${l.repayment_months} mo)`,
      action: "Approve / Reject",
      href: `#/loans`,
      created_at: l.created_at,
      entity: l,
    });
  });
  flags.forEach((f) => {
    items.push({
      id: `flag-${f.id}`,
      type: "Risk Flag",
      priority: ["ghost_member", "aml_suspicious_deposit"].includes(f.flag_type) ? "high" : "normal",
      description: f.description || titleCase(f.flag_type),
      action: "Investigate / Resolve",
      href: `#/risk`,
      created_at: f.created_at,
      entity: f,
    });
  });
  (members.items || members || []).forEach((m) => {
    items.push({
      id: `member-${m.id}`,
      type: "Member Verification",
      priority: "normal",
      description: `${m.first_name} ${m.last_name} (${m.member_number})`,
      action: "Approve / Reject registration",
      href: `#/members`,
      created_at: m.date_joined,
      entity: m,
    });
  });

  items.sort((a, b) => {
    const pa = a.priority === "high" ? 0 : 1;
    const pb = b.priority === "high" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  return items.slice(0, MAX_QUEUE_ITEMS);
}

function titleCase(s) { return String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

// ============================================================================
// SCHEDULED REPORTS - persists in localStorage with cron expression
// ============================================================================

const SCHEDULES_KEY = "sacco_scheduled_reports_v2";

function hasStorage() {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

/** @returns {Array<Object>} */
export function loadSchedules() {
  if (!hasStorage()) return [];
  try { return JSON.parse(localStorage.getItem(SCHEDULES_KEY) || "[]"); }
  catch { return []; }
}

/** @param {Array<Object>} list */
export function saveSchedules(list) {
  if (!hasStorage()) return;
  try { localStorage.setItem(SCHEDULES_KEY, JSON.stringify(list)); }
  catch { /* quota exceeded or storage disabled — silently ignore */ }
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

/**
 * Returns the next human-readable firing time for a given frequency. Useful
 * for preview text in the schedule form before the user commits.
 * @param {"daily"|"weekly"|"biweekly"|"monthly"|"quarterly"|"yearly"} frequency
 * @param {Date} [now=new Date()]
 * @returns {Date}
 */
export function nextScheduleDate(frequency, now = new Date()) {
  const d = new Date(now);
  switch (frequency) {
    case "daily":      d.setDate(d.getDate() + 1); break;
    case "weekly":     d.setDate(d.getDate() + 7); break;
    case "biweekly":   d.setDate(d.getDate() + 14); break;
    case "monthly":    d.setMonth(d.getMonth() + 1); break;
    case "quarterly":  d.setMonth(d.getMonth() + 3); break;
    case "yearly":     d.setFullYear(d.getFullYear() + 1); break;
    default:           d.setDate(d.getDate() + 1);
  }
  return d;
}

// ============================================================================
// AMOUNT PARSING AND TIME FORMATTING
// ============================================================================

/**
 * Tolerant monetary parser. Accepts numbers, "1,234.50", "UGX 1 000",
 * locale strings with spaces, and currency symbols. Returns 0 for any
 * non-numeric or NaN result.
 * @param {string|number|null|undefined} value
 * @returns {number}
 */
export function parseAmount(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  // Strip everything that isn't a digit, decimal separator, or minus.
  const cleaned = String(value).replace(/[^\d.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Human-friendly relative time ("3m ago", "yesterday" if simple enough).
 * Handles future dates ("in 5m") and invalid input by returning "—".
 * @param {string|Date|number|null|undefined} iso
 * @returns {string}
 */
export function relativeTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = d.getTime() - Date.now();
  const absDiff = Math.abs(diff);
  const future = diff > 0;
  const sec = Math.floor(absDiff / 1000);
  const suffix = future ? "from now" : "ago";
  if (sec < 60) return future ? `in ${sec}s` : `${sec}s ${suffix}`;
  const min = Math.floor(sec / 60);
  if (min < 60) return future ? `in ${min}m` : `${min}m ${suffix}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return future ? `in ${hr}h` : `${hr}h ${suffix}`;
  const day = Math.floor(hr / 24);
  if (day < 30) return future ? `in ${day}d` : `${day}d ${suffix}`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return future ? `in ${mo}mo` : `${mo}mo ${suffix}`;
  const yr = Math.floor(mo / 12);
  return future ? `in ${yr}y` : `${yr}y ${suffix}`;
}

// ============================================================================
// Command palette search index
// ============================================================================

/**
 * Pre-compute a lowercase haystack per route so the palette can do a
 * single substring scan per keystroke. The caller is responsible for
 * passing routes shaped like { path, title, group, keywords }.
 * @param {Array<Object>} routes
 * @returns {Array<Object>}
 */
export function buildCommandIndex(routes) {
  return routes.map((r) => ({
    ...r,
    search: `${r.title} ${r.group || ""} ${(r.keywords || []).join(" ")}`.toLowerCase(),
  }));
}

/**
 * Case-insensitive substring filter. Trims the query and returns up to
 * `limit` matches. Returns the first `limit` of the index when the query
 * is empty so the palette has something to show on open.
 * @param {Array<Object>} index
 * @param {string} query
 * @param {number} [limit=8]
 * @returns {Array<Object>}
 */
export function searchCommands(index, query, limit = 8) {
  const q = (query || "").toLowerCase().trim();
  if (!q) return index.slice(0, limit);
  return index.filter((r) => r.search.includes(q)).slice(0, limit);
}

// ============================================================================
// LOAN AMORTISATION
// Standard amortisation calculator used by the credit-review panel to
// preview a candidate loan before approval. Returns the level monthly
// payment (reducing balance) and a full amortisation schedule.
// ============================================================================

/**
 * @param {number} principal            - Loan amount in UGX
 * @param {number} annualRatePercent    - Annual interest rate, e.g. 12 for 12%
 * @param {number} termMonths           - Total repayment period in months
 * @returns {{monthlyPayment:number, totalInterest:number, totalRepayable:number, schedule:Array<{month:number,principal:number,interest:number,balance:number}>}}
 */
export function amortiseLoan(principal, annualRatePercent, termMonths) {
  const P = Number(principal) || 0;
  const n = Math.max(1, Math.floor(Number(termMonths) || 0));
  const r = (Number(annualRatePercent) || 0) / 100 / 12;

  if (P <= 0 || n <= 0) {
    return { monthlyPayment: 0, totalInterest: 0, totalRepayable: 0, schedule: [] };
  }

  // Level payment formula; for r === 0 fall back to straight-line division.
  const monthlyPayment = r === 0
    ? P / n
    : (P * r) / (1 - Math.pow(1 + r, -n));

  const schedule = [];
  let balance = P;
  for (let month = 1; month <= n; month++) {
    const interest = balance * r;
    let principalDue = monthlyPayment - interest;
    if (month === n) principalDue = balance; // clear the residual on the last row
    balance = Math.max(0, balance - principalDue);
    schedule.push({ month, principal: principalDue, interest, balance });
  }

  const totalRepayable = monthlyPayment * n;
  const totalInterest = Math.max(0, totalRepayable - P);
  return { monthlyPayment, totalInterest, totalRepayable, schedule };
}

/**
 * Flat-rate monthly payment. Some legacy SACCO products use simple
 * interest; expose this so the loan configurator can preview both.
 * @param {number} principal
 * @param {number} annualRatePercent
 * @param {number} termMonths
 * @returns {{monthlyPayment:number, totalInterest:number, totalRepayable:number}}
 */
export function flatRatePayment(principal, annualRatePercent, termMonths) {
  const P = Number(principal) || 0;
  const n = Math.max(1, Math.floor(Number(termMonths) || 0));
  const totalInterest = (P * (Number(annualRatePercent) || 0) / 100) * (n / 12);
  const totalRepayable = P + totalInterest;
  return {
    monthlyPayment: n > 0 ? totalRepayable / n : 0,
    totalInterest,
    totalRepayable,
  };
}

// ============================================================================
// SAVINGS PROJECTIONS
// Project the future balance of a savings account given a recurring
// monthly deposit and a simple annual interest rate. Useful for the
// "what-if" widget on the savings product configurator.
// ============================================================================

/**
 * @param {Object} p
 * @param {number} p.startingBalance     - Initial deposit (UGX)
 * @param {number} p.monthlyContribution  - Recurring monthly deposit
 * @param {number} p.annualRatePercent   - Effective annual rate
 * @param {number} p.months              - Projection horizon
 * @param {boolean} [p.compoundMonthly=true]
 * @returns {{finalBalance:number, totalContributed:number, totalInterest:number, series:Array<{month:number,balance:number,contributed:number,interest:number}>}}
 */
export function projectSavingsGrowth({ startingBalance = 0, monthlyContribution = 0, annualRatePercent = 0, months = 12, compoundMonthly = true } = {}) {
  const r = compoundMonthly ? (Number(annualRatePercent) || 0) / 100 / 12 : 0;
  const n = Math.max(0, Math.floor(Number(months) || 0));
  const series = [];
  let balance = Number(startingBalance) || 0;
  let totalContributed = balance;
  let totalInterest = 0;

  for (let m = 1; m <= n; m++) {
    const interest = balance * r;
    balance += interest + Number(monthlyContribution || 0);
    totalInterest += interest;
    totalContributed += Number(monthlyContribution || 0);
    series.push({ month: m, balance, contributed: totalContributed, interest: totalInterest });
  }

  return { finalBalance: balance, totalContributed, totalInterest, series };
}

// ============================================================================
// MEMBER ELIGIBILITY
// A small, composable rule engine for whether a member qualifies for a
// given loan product. Mirrors the policy defaults used by the API so the
// UI can grey out ineligible products before the user even fills the form.
// ============================================================================

/**
 * @typedef {Object} EligibilityPolicy
 * @property {number} [minTenureMonths=3]
 * @property {number} [minSavings=0]        - Minimum total savings in UGX
 * @property {number} [minShares=0]         - Minimum share count
 * @property {number} [maxActiveLoans=1]
 * @property {number} [maxDtiPercent=40]    - Estimated DTI cap
 * @property {number} [parCapPercent=15]    - Member's share of overdue portfolio
 */

/** Default SACCO policy if no overrides are supplied. */
export const DEFAULT_ELIGIBILITY_POLICY = Object.freeze({
  minTenureMonths: 3,
  minSavings: 0,
  minShares: 0,
  maxActiveLoans: 1,
  maxDtiPercent: 40,
  parCapPercent: 15,
});

/**
 * @param {Object} member
 * @param {Object} member.member - Member record with date_joined, status
 * @param {Object} member.financial - { savings, shareValue, monthlyIncome }
 * @param {Object[]} member.loans - Recent loans
 * @param {number} member.requestedAmount
 * @param {number} member.requestedTermMonths
 * @param {number} member.annualRatePercent
 * @param {EligibilityPolicy} [policy]
 * @returns {{eligible:boolean, reasons:string[], score:number}}
 */
export function evaluateLoanEligibility(member, policy = DEFAULT_ELIGIBILITY_POLICY) {
  const reasons = [];
  let score = 100;

  const status = (member.member?.status || "").toLowerCase();
  if (status !== "active") reasons.push(`Member is ${status || "unknown"}; only active members can borrow.`);

  const tenureMonths = member.member?.date_joined
    ? (Date.now() - new Date(member.member.date_joined).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    : 0;
  if (tenureMonths < policy.minTenureMonths) {
    reasons.push(`Tenure ${tenureMonths.toFixed(1)} mo is below the ${policy.minTenureMonths}-month minimum.`);
    score -= 20;
  }

  const savings = Number(member.financial?.savings || 0);
  if (savings < policy.minSavings) {
    reasons.push(`Total savings UGX ${formatMoney(savings)} below the UGX ${formatMoney(policy.minSavings)} floor.`);
    score -= 15;
  }

  const shareValue = Number(member.financial?.shareValue || 0);
  const minShareValue = (policy.minShares || 0) * SHARE_NOMINAL_VALUE;
  if (shareValue < minShareValue) {
    reasons.push(`Share value UGX ${formatMoney(shareValue)} below the UGX ${formatMoney(minShareValue)} floor.`);
    score -= 10;
  }

  const activeLoans = (member.loans || []).filter((l) => ["active", "disbursed"].includes((l.status || "").toLowerCase())).length;
  if (activeLoans > policy.maxActiveLoans) {
    reasons.push(`Member already has ${activeLoans} active loan(s); cap is ${policy.maxActiveLoans}.`);
    score -= 25;
  }

  const defaulted = (member.loans || []).filter((l) => (l.status || "").toLowerCase() === "defaulted").length;
  if (defaulted > 0) {
    reasons.push(`Member has ${defaulted} defaulted loan(s) on file.`);
    score -= 30;
  }

  // DTI guard: use the amortised payment to project a debt-to-income ratio.
  const monthlyIncome = Number(member.financial?.monthlyIncome || 0);
  if (monthlyIncome > 0) {
    const amort = amortiseLoan(member.requestedAmount, member.annualRatePercent, member.requestedTermMonths);
    const dti = (amort.monthlyPayment / monthlyIncome) * 100;
    if (dti > policy.maxDtiPercent) {
      reasons.push(`Estimated DTI ${dti.toFixed(1)}% exceeds the ${policy.maxDtiPercent}% ceiling.`);
      score -= 20;
    }
  }

  // Statutory share-multiple cap.
  if (shareValue > 0 && member.requestedAmount > shareValue * SHARES_MULTIPLE_CAP) {
    reasons.push(`Requested amount is more than ${SHARES_MULTIPLE_CAP}× the member's share value.`);
    score -= 15;
  }

  score = Math.max(0, Math.min(100, score));
  return { eligible: reasons.length === 0, reasons, score };
}

// ============================================================================
// PORTFOLIO CONCENTRATION
// Detect "eggs in one basket" risk: share of a single member (or product)
// to the total loan book. Useful for committee reports.
// ============================================================================

/**
 * @param {Object[]} loans
 * @returns {{topMemberSharePct:number, topProductSharePct:number, hhi:number, memberConcentration:Array<{member_id:string,amount:number,pct:number}>, productConcentration:Array<{product:string,amount:number,pct:number}>}}
 *   hhi - Herfindahl-Hirschman Index (0-10000); > 2500 indicates high concentration.
 */
export function portfolioConcentration(loans) {
  const book = loans.filter((l) => ["active", "disbursed"].includes((l.status || "").toLowerCase()));
  const total = book.reduce((s, l) => s + Number(l.amount_approved || l.amount_requested || 0), 0);

  const byMember = new Map();
  const byProduct = new Map();
  book.forEach((l) => {
    const amt = Number(l.amount_approved || l.amount_requested || 0);
    if (l.member_id) byMember.set(l.member_id, (byMember.get(l.member_id) || 0) + amt);
    const product = l.product_name || l.product_id || "Unknown";
    byProduct.set(product, (byProduct.get(product) || 0) + amt);
  });

  const memberConcentration = [...byMember.entries()]
    .map(([member_id, amount]) => ({ member_id, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
  const productConcentration = [...byProduct.entries()]
    .map(([product, amount]) => ({ product, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const topMemberSharePct = memberConcentration[0]?.pct || 0;
  const topProductSharePct = productConcentration[0]?.pct || 0;

  // HHI = sum of squared market shares (in percentage points).
  const hhi = productConcentration.reduce((s, p) => s + (p.pct || 0) ** 2, 0);

  return { topMemberSharePct, topProductSharePct, hhi, memberConcentration, productConcentration };
}

// ============================================================================
// CASH-FLOW SUMMARY
// Quick aggregate of inflows vs. outflows across a list of transactions.
// Mirrors the cashflow tile in the executive dashboard.
// ============================================================================

/**
 * @param {Object[]} transactions - Each: { direction: "in"|"out"|"credit"|"debit", amount, category? }
 * @param {Date} [now=new Date()]
 * @returns {{inflow:number,outflow:number,net:number,byCategory:Object<string,number>,monthly:Array<{month:string,net:number}>}}
 */
export function cashflowSummary(transactions, now = new Date()) {
  const inflow = transactions
    .filter((t) => ["in", "credit"].includes((t.direction || "").toLowerCase()))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const outflow = transactions
    .filter((t) => ["out", "debit"].includes((t.direction || "").toLowerCase()))
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  const byCategory = {};
  transactions.forEach((t) => {
    const key = t.category || "uncategorised";
    if (!byCategory[key]) byCategory[key] = 0;
    byCategory[key] += Number(t.amount || 0) * (["in", "credit"].includes((t.direction || "").toLowerCase()) ? 1 : -1);
  });

  // Monthly bucketing (last 6 months).
  const monthly = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthTx = transactions.filter((t) => {
      if (!t.date) return false;
      const td = new Date(t.date);
      return `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, "0")}` === monthKey;
    });
    const inM = monthTx.filter((t) => ["in", "credit"].includes((t.direction || "").toLowerCase())).reduce((s, t) => s + Number(t.amount || 0), 0);
    const outM = monthTx.filter((t) => ["out", "debit"].includes((t.direction || "").toLowerCase())).reduce((s, t) => s + Number(t.amount || 0), 0);
    monthly.push({ month: monthKey, net: inM - outM });
  }

  return { inflow, outflow, net: inflow - outflow, byCategory, monthly };
}

// ============================================================================
// PORTFOLIO-AT-RISK DERIVATION (client-side)
// Backend exposes /api/v1/risk/portfolio-at-risk, but admins often need the
// same number when the endpoint is slow or down. This pure helper computes
// PAR from a loans list without a network call.
// ============================================================================

/**
 * @param {Object[]} loans
 * @param {Object<string,Object[]>} [schedulesByLoan]
 * @returns {{totalOutstanding:number, overdueOutstanding:number, parPct:number}}
 */
export function portfolioAtRisk(loans, schedulesByLoan = {}) {
  const { totalOutstanding, overdueOutstanding, parPct } = loanAgingBuckets(loans, schedulesByLoan);
  return { totalOutstanding, overdueOutstanding, parPct };
}

// ============================================================================
// PHONE NUMBER UTILITIES
// Uganda-specific normalisation. The bulk-upload CSV accepts a wide
// variety of formats; this helper coerces them to the canonical
// "+2567XXXXXXXX" form so duplicates and missing-country-code bugs
// don't slip through.
// ============================================================================

/**
 * @param {string|number|null|undefined} raw
 * @returns {string|null} Canonical number, or null if unparseable.
 */
export function normaliseUgandanPhone(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("00")) s = s.slice(2);
  if (s.startsWith("256")) s = s.slice(3);
  if (s.startsWith("0")) s = s.slice(1);
  // After stripping prefixes we should be left with 9 digits starting with 7.
  if (!/^7\d{8}$/.test(s)) return null;
  return `+256${s}`;
}
