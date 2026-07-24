import { api } from "../api.js";
import { el, mount, formatDateTime, titleCase, badge, dataTable, showToast, memberPicker } from "../utils.js";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const CHANNELS = [
  { value: "email", label: "Email", limit: null, icon: svgEmail, tone: "indigo" },
  { value: "sms", label: "SMS", limit: 160, icon: svgSms, tone: "amber" },
  { value: "push", label: "Push", limit: 178, icon: svgPush, tone: "teal" },
];

const PRIORITIES = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const PAGE_SIZE = 8;

/* ------------------------------------------------------------------ */
/* Icons (inline, no external deps)                                    */
/* ------------------------------------------------------------------ */

function svgEmail() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`;
}
function svgSms() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
}
function svgPush() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
}
function svgSearch() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`;
}
function svgInbox() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`;
}
function svgClock() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`;
}

function icon(svg, cls) {
  const span = el("span", { class: `n-icon${cls ? " " + cls : ""}` });
  span.innerHTML = svg;
  return span;
}

/* ------------------------------------------------------------------ */
/* One-time style injection                                            */
/* ------------------------------------------------------------------ */

function ensureStyles() {
  if (document.getElementById("notif-styles")) return;
  const style = el("style", { id: "notif-styles" });
  style.textContent = `
.notif-view{
  --n-bg: #12141c;
  --n-panel: #1a1d29;
  --n-panel-2: #21253400;
  --n-border: #2c3142;
  --n-text: #eef0f6;
  --n-muted: #8b90a5;
  --n-indigo: #6e7bf2;
  --n-amber: #f2b155;
  --n-teal: #45c9b0;
  --n-rose: #f2647a;
  --n-emerald: #4fd18b;
  --n-mono: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  --n-radius: 12px;
  color: var(--n-text);
}
.notif-view *{ box-sizing: border-box; }
.n-grid{ display:grid; grid-template-columns: 380px 1fr; gap: 20px; align-items:start; }
@media (max-width: 880px){ .n-grid{ grid-template-columns: 1fr; } }

.n-card{
  background: var(--n-panel);
  border: 1px solid var(--n-border);
  border-radius: var(--n-radius);
  padding: 20px;
}
.n-card h3{ margin:0 0 4px; font-size: 15px; font-weight: 600; letter-spacing: .01em; }
.n-sub{ margin:0 0 16px; color: var(--n-muted); font-size: 12.5px; }

/* Stats strip */
.n-stats{ display:grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 18px; }
.n-stat{
  background: var(--n-panel);
  border: 1px solid var(--n-border);
  border-radius: var(--n-radius);
  padding: 14px 16px;
  position: relative;
  overflow: hidden;
}
.n-stat::before{
  content:"";
  position:absolute; left:0; top:0; bottom:0; width:3px;
  background: var(--stat-color, var(--n-indigo));
}
.n-stat-value{ font-family: var(--n-mono); font-size: 22px; font-weight: 600; line-height:1; }
.n-stat-label{ margin-top:6px; color: var(--n-muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: .06em; }
@media (max-width: 560px){ .n-stats{ grid-template-columns: repeat(2,1fr); } }

/* Form */
.n-field{ margin-bottom: 16px; }
.n-field label{ display:block; font-size: 12.5px; color: var(--n-muted); margin-bottom: 7px; font-weight: 500; }
.notif-view input[type=text], .notif-view input[type=search], .notif-view input[type=datetime-local], .notif-view textarea, .notif-view select{
  width:100%; background: #0f111a; border:1px solid var(--n-border); color: var(--n-text);
  border-radius: 8px; padding: 9px 11px; font-size: 13.5px; font-family: inherit; outline: none;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.notif-view textarea{ resize: vertical; min-height: 92px; line-height:1.5; }
.notif-view input:focus, .notif-view textarea:focus, .notif-view select:focus{
  border-color: var(--n-indigo); box-shadow: 0 0 0 3px rgba(110,123,242,.18);
}

.n-segmented{ display:flex; gap:6px; flex-wrap:wrap; }
.n-seg-btn{
  display:flex; align-items:center; gap:7px;
  background: #0f111a; border:1px solid var(--n-border); color: var(--n-muted);
  border-radius: 8px; padding: 8px 12px; font-size: 13px; cursor:pointer;
  transition: all .15s ease;
}
.n-seg-btn .n-icon{ width:15px; height:15px; display:inline-flex; }
.n-seg-btn .n-icon svg{ width:100%; height:100%; }
.n-seg-btn:hover{ border-color: var(--n-muted); color: var(--n-text); }
.n-seg-btn[aria-pressed="true"]{
  background: color-mix(in srgb, var(--seg-color, var(--n-indigo)) 18%, #0f111a);
  border-color: var(--seg-color, var(--n-indigo));
  color: var(--n-text);
}

.n-counter{ display:flex; justify-content:flex-end; margin-top:6px; font-family: var(--n-mono); font-size: 11.5px; color: var(--n-muted); }
.n-counter.n-counter-warn{ color: var(--n-amber); }
.n-counter.n-counter-over{ color: var(--n-rose); font-weight:600; }

.n-schedule-row{ display:flex; align-items:center; gap:10px; margin-bottom: 10px; }
.n-toggle{
  position:relative; width:38px; height:22px; border-radius:11px; background:#0f111a;
  border:1px solid var(--n-border); cursor:pointer; flex:none;
}
.n-toggle::after{
  content:""; position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%;
  background: var(--n-muted); transition: transform .15s ease, background .15s ease;
}
.n-toggle[aria-checked="true"]{ border-color: var(--n-indigo); }
.n-toggle[aria-checked="true"]::after{ transform: translateX(16px); background: var(--n-indigo); }
.n-toggle-label{ font-size: 12.5px; color: var(--n-muted); }

.n-schedule-input{ overflow:hidden; max-height:0; opacity:0; transition: max-height .18s ease, opacity .18s ease; }
.n-schedule-input.n-open{ max-height:80px; opacity:1; margin-top:10px; }

.n-error{
  display:flex; gap:8px; align-items:flex-start; background: rgba(242,100,122,.1);
  border:1px solid rgba(242,100,122,.35); color: #ffb4c1; border-radius:8px;
  padding: 10px 12px; font-size: 13px; margin-bottom: 14px;
}

.n-submit{
  width:100%; display:flex; align-items:center; justify-content:center; gap:8px;
  background: var(--n-indigo); color:#fff; border:none; border-radius:9px;
  padding: 11px 16px; font-size: 14px; font-weight:600; cursor:pointer;
  transition: filter .15s ease, transform .1s ease;
}
.n-submit:hover{ filter: brightness(1.08); }
.n-submit:active{ transform: translateY(1px); }
.n-submit:disabled{ opacity:.6; cursor:not-allowed; }
.n-spinner{
  width:14px; height:14px; border-radius:50%; border:2px solid rgba(255,255,255,.35);
  border-top-color:#fff; animation: n-spin .7s linear infinite;
}
@keyframes n-spin{ to{ transform: rotate(360deg); } }

/* History panel toolbar */
.n-toolbar{ display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; align-items:center; }
.n-search{ position:relative; flex:1; min-width:180px; }
.n-search .n-icon{ position:absolute; left:10px; top:50%; transform:translateY(-50%); width:14px; height:14px; color:var(--n-muted); }
.n-search .n-icon svg{ width:100%; height:100%; }
.n-search input{ padding-left:32px; }
.n-chips{ display:flex; gap:6px; }
.n-chip{
  background:#0f111a; border:1px solid var(--n-border); color: var(--n-muted);
  border-radius:999px; padding:6px 12px; font-size:12.5px; cursor:pointer; transition: all .15s ease;
}
.n-chip[aria-pressed="true"]{ background: var(--n-indigo); border-color: var(--n-indigo); color:#fff; }

.n-table-wrap table{ font-size: 13px; }
.n-table-wrap td, .n-table-wrap th{ padding: 9px 6px; }
.n-mono{ font-family: var(--n-mono); font-size: 12px; color: var(--n-muted); }

.n-empty{ text-align:center; padding: 46px 20px; color: var(--n-muted); }
.n-empty .n-icon{ width:34px; height:34px; margin: 0 auto 12px; opacity:.6; }
.n-empty .n-icon svg{ width:100%; height:100%; }
.n-empty-title{ color: var(--n-text); font-size: 14px; font-weight:600; margin-bottom:4px; }

.n-skeleton{ display:flex; flex-direction:column; gap:8px; }
.n-skel-row{ height:34px; border-radius:6px; background: linear-gradient(90deg,#1c2030,#242939,#1c2030); background-size:200% 100%; animation: n-shimmer 1.3s ease-in-out infinite; }
@keyframes n-shimmer{ 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }

.n-pager{ display:flex; justify-content:space-between; align-items:center; margin-top:14px; font-size:12.5px; color: var(--n-muted); }
.n-pager-btns{ display:flex; gap:6px; }
.n-pager button{
  background:#0f111a; border:1px solid var(--n-border); color: var(--n-text);
  border-radius:6px; padding:5px 10px; font-size:12.5px; cursor:pointer;
}
.n-pager button:disabled{ opacity:.4; cursor:not-allowed; }

.n-placeholder{ color: var(--n-muted); font-size: 13px; padding: 30px 4px; text-align:center; }
`;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/* Small view helpers                                                  */
/* ------------------------------------------------------------------ */

function statCard(label, value, color) {
  const card = el("div", { class: "n-stat", style: `--stat-color:${color}` }, [
    el("div", { class: "n-stat-value" }, String(value)),
    el("div", { class: "n-stat-label" }, label),
  ]);
  return card;
}

function computeStats(history) {
  const total = history.length;
  const buckets = { delivered: 0, sent: 0, failed: 0, pending: 0 };
  for (const n of history) {
    const s = (n.status || "").toLowerCase();
    if (s.includes("fail") || s.includes("bounce")) buckets.failed++;
    else if (s.includes("deliver")) buckets.delivered++;
    else if (s.includes("sent")) buckets.sent++;
    else buckets.pending++;
  }
  return { total, ...buckets };
}

function channelTone(value) {
  const c = CHANNELS.find((c) => c.value === value);
  const map = { indigo: "var(--n-indigo)", amber: "var(--n-amber)", teal: "var(--n-teal)" };
  return c ? map[c.tone] : "var(--n-indigo)";
}

/* ------------------------------------------------------------------ */
/* Main render                                                         */
/* ------------------------------------------------------------------ */

export async function renderNotifications(root) {
  ensureStyles();

  let selectedMember = null;
  let selectedChannel = "email";
  let selectedPriority = "normal";
  let scheduling = false;
  let historyData = [];
  let page = 1;
  let searchTerm = "";
  let channelFilter = "all";
  let sending = false;

  /* ---- form elements ---- */

  const errorEl = el("div", { class: "n-error", hidden: true });

  const segButtons = CHANNELS.map((c) =>
    el(
      "button",
      {
        type: "button",
        class: "n-seg-btn",
        style: `--seg-color:${{ indigo: "var(--n-indigo)", amber: "var(--n-amber)", teal: "var(--n-teal)" }[c.tone]}`,
        "aria-pressed": String(c.value === selectedChannel),
        onclick: () => selectChannel(c.value),
      },
      [icon(c.icon()), c.label]
    )
  );
  const channelRow = el("div", { class: "n-segmented" }, segButtons);

  const prioSegButtons = PRIORITIES.map((p) =>
    el(
      "button",
      {
        type: "button",
        class: "n-seg-btn",
        "aria-pressed": String(p.value === selectedPriority),
        onclick: () => selectPriority(p.value),
      },
      p.label
    )
  );
  const priorityRow = el("div", { class: "n-segmented" }, prioSegButtons);

  const subjectField = el("div", { class: "n-field" }, [
    el("label", {}, "Subject (optional)"),
    el("input", { type: "text", id: "n-subject" }),
  ]);
  const subjectInput = subjectField.querySelector("input");

  const bodyInput = el("textarea", { id: "n-body", rows: 4, required: true });
  const counter = el("div", { class: "n-counter" }, "");

  const scheduleToggle = el("div", {
    class: "n-toggle",
    role: "switch",
    tabindex: "0",
    "aria-checked": "false",
    onclick: toggleSchedule,
    onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSchedule(); } },
  });
  const scheduleInput = el("input", { type: "datetime-local", id: "n-schedule" });
  const scheduleInputWrap = el("div", { class: "n-schedule-input" }, [scheduleInput]);

  const submitBtn = el("button", { type: "submit", class: "n-submit" }, "Send notification");

  const picker = memberPicker(
    (q) => api.get(`/api/v1/members?q=${encodeURIComponent(q)}`).then((r) => r.items),
    onMemberSelected
  );

  const form = el("form", {}, [
    el("div", { class: "n-field" }, [el("label", {}, "Recipient member"), picker]),
    el("div", { class: "n-field" }, [el("label", {}, "Channel"), channelRow]),
    el("div", { class: "n-field" }, [el("label", {}, "Priority"), priorityRow]),
    subjectField,
    el("div", { class: "n-field" }, [
      el("label", {}, "Message"),
      bodyInput,
      counter,
    ]),
    el("div", { class: "n-field" }, [
      el("div", { class: "n-schedule-row" }, [
        scheduleToggle,
        el("span", { class: "n-toggle-label" }, "Schedule for later instead of sending now"),
      ]),
      scheduleInputWrap,
    ]),
    errorEl,
    submitBtn,
  ]);

  /* ---- history panel ---- */

  const statsRow = el("div", { class: "n-stats" });
  const searchInput = el("input", { type: "search", placeholder: "Search subject or message\u2026" });
  const chipAll = chip("All", true, () => setChannelFilter("all"));
  const chipEmail = chip("Email", false, () => setChannelFilter("email"));
  const chipSms = chip("SMS", false, () => setChannelFilter("sms"));
  const chipPush = chip("Push", false, () => setChannelFilter("push"));
  const toolbar = el("div", { class: "n-toolbar" }, [
    el("div", { class: "n-search" }, [icon(svgSearch()), searchInput]),
    el("div", { class: "n-chips" }, [chipAll, chipEmail, chipSms, chipPush]),
  ]);
  const tableWrap = el("div", { class: "n-table-wrap" });
  const pager = el("div", { class: "n-pager", hidden: true });

  const historyPanel = el("div", { class: "n-card" }, [
    el("h3", {}, "Notification history"),
    el("p", { class: "n-sub" }, "Select a member to see everything sent to them."),
    el("div", { class: "n-placeholder" }, "No member selected yet."),
  ]);

  searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value.trim().toLowerCase();
    page = 1;
    renderHistoryTable();
  });

  /* ---- behavior ---- */

  function selectChannel(value) {
    selectedChannel = value;
    segButtons.forEach((btn, i) => btn.setAttribute("aria-pressed", String(CHANNELS[i].value === value)));
    subjectField.style.display = value === "email" ? "" : "none";
    updateCounter();
  }
  function selectPriority(value) {
    selectedPriority = value;
    prioSegButtons.forEach((btn, i) => btn.setAttribute("aria-pressed", String(PRIORITIES[i].value === value)));
  }
  function toggleSchedule() {
    scheduling = !scheduling;
    scheduleToggle.setAttribute("aria-checked", String(scheduling));
    scheduleInputWrap.classList.toggle("n-open", scheduling);
    submitBtn.textContent = scheduling ? "Schedule notification" : "Send notification";
    if (scheduling && !scheduleInput.value) {
      const d = new Date(Date.now() + 5 * 60000);
      scheduleInput.value = d.toISOString().slice(0, 16);
    }
  }
  function updateCounter() {
    const channel = CHANNELS.find((c) => c.value === selectedChannel);
    const len = bodyInput.value.length;
    if (!channel.limit) {
      counter.textContent = `${len} characters`;
      counter.className = "n-counter";
      return;
    }
    const remaining = channel.limit - len;
    counter.textContent = `${len} / ${channel.limit}`;
    counter.className = "n-counter" + (remaining < 0 ? " n-counter-over" : remaining <= 20 ? " n-counter-warn" : "");
  }
  bodyInput.addEventListener("input", updateCounter);

  function chip(label, active, onclick) {
    return el("button", { type: "button", class: "n-chip", "aria-pressed": String(active), onclick }, label);
  }
  function setChannelFilter(value) {
    channelFilter = value;
    [chipAll, chipEmail, chipSms, chipPush].forEach((c) =>
      c.setAttribute("aria-pressed", String(c === { all: chipAll, email: chipEmail, sms: chipSms, push: chipPush }[value]))
    );
    page = 1;
    renderHistoryTable();
  }

  async function onMemberSelected(m) {
    selectedMember = m;
    page = 1;
    searchTerm = "";
    searchInput.value = "";
    channelFilter = "all";
    setChannelFilter("all");

    if (!m) {
      mount(historyPanel, [
        el("h3", {}, "Notification history"),
        el("p", { class: "n-sub" }, "Select a member to see everything sent to them."),
        el("div", { class: "n-placeholder" }, "No member selected yet."),
      ]);
      return;
    }

    mount(historyPanel, [
      el("h3", {}, `Notification history \u2014 ${m.first_name} ${m.last_name}`),
      el("p", { class: "n-sub" }, "Loading recent activity\u2026"),
      el("div", { class: "n-skeleton" }, Array.from({ length: 5 }, () => el("div", { class: "n-skel-row" }))),
    ]);

    await loadHistory();
  }

  async function loadHistory() {
    if (!selectedMember) return;
    try {
      historyData = await api.get(`/api/v1/notifications/members/${selectedMember.id}`);
    } catch (err) {
      mount(historyPanel, [
        el("h3", {}, `Notification history \u2014 ${selectedMember.first_name} ${selectedMember.last_name}`),
        el("div", { class: "n-error" }, `Couldn't load history: ${err.message}`),
      ]);
      return;
    }
    renderHistoryPanel();
  }

  function renderHistoryPanel() {
    const stats = computeStats(historyData);
    mount(statsRow, [
      statCard("Total sent", stats.total, "var(--n-indigo)"),
      statCard("Delivered", stats.delivered + stats.sent, "var(--n-emerald)"),
      statCard("Pending", stats.pending, "var(--n-amber)"),
      statCard("Failed", stats.failed, "var(--n-rose)"),
    ]);

    mount(historyPanel, [
      el("h3", {}, `Notification history \u2014 ${selectedMember.first_name} ${selectedMember.last_name}`),
      el("p", { class: "n-sub" }, `${historyData.length} notification${historyData.length === 1 ? "" : "s"} on record.`),
      statsRow,
      toolbar,
      tableWrap,
      pager,
    ]);
    renderHistoryTable();
  }

  function filteredHistory() {
    return historyData.filter((n) => {
      if (channelFilter !== "all" && n.channel !== channelFilter) return false;
      if (searchTerm) {
        const hay = `${n.subject || ""} ${n.event_type || ""} ${n.body || ""}`.toLowerCase();
        if (!hay.includes(searchTerm)) return false;
      }
      return true;
    });
  }

  function renderHistoryTable() {
    const filtered = filteredHistory();
    if (historyData.length === 0) {
      mount(tableWrap, [
        el("div", { class: "n-empty" }, [
          icon(svgInbox()),
          el("div", { class: "n-empty-title" }, "No notifications yet"),
          el("div", {}, "Nothing has been sent to this member. Anything you send will show up here."),
        ]),
      ]);
      pager.hidden = true;
      return;
    }
    if (filtered.length === 0) {
      mount(tableWrap, [
        el("div", { class: "n-empty" }, [
          icon(svgSearch()),
          el("div", { class: "n-empty-title" }, "No matches"),
          el("div", {}, "Try a different search term or filter."),
        ]),
      ]);
      pager.hidden = true;
      return;
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    mount(tableWrap, [
      dataTable(
        [
          {
            header: "Date",
            render: (n) => el("span", { class: "n-mono" }, formatDateTime(n.created_at)),
          },
          {
            header: "Channel",
            render: (n) =>
              el("span", { style: `color:${channelTone(n.channel)}` }, titleCase(n.channel)),
          },
          { header: "Subject", render: (n) => n.subject || titleCase(n.event_type) || "\u2014" },
          { header: "Status", render: (n) => badge(n.status) },
        ],
        pageItems,
        "No notifications sent to this member yet."
      ),
    ]);

    pager.hidden = false;
    mount(pager, [
      el("span", {}, `Page ${page} of ${totalPages}`),
      el("div", { class: "n-pager-btns" }, [
        el("button", { type: "button", disabled: page <= 1, onclick: () => { page--; renderHistoryTable(); } }, "\u2190 Prev"),
        el("button", { type: "button", disabled: page >= totalPages, onclick: () => { page++; renderHistoryTable(); } }, "Next \u2192"),
      ]),
    ]);
  }

  function setSending(state) {
    sending = state;
    submitBtn.disabled = state;
    mount(submitBtn, state
      ? [el("span", { class: "n-spinner" }), scheduling ? "Scheduling\u2026" : "Sending\u2026"]
      : [scheduling ? "Schedule notification" : "Send notification"]);
  }

  function showError(message) {
    mount(errorEl, [icon(svgClock()), el("span", {}, message)]);
    errorEl.hidden = false;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    errorEl.hidden = true;

    if (!selectedMember) return showError("Select a recipient first.");
    if (!bodyInput.value.trim()) return showError("Write a message before sending.");
    const channel = CHANNELS.find((c) => c.value === selectedChannel);
    if (channel.limit && bodyInput.value.length > channel.limit) {
      return showError(`${channel.label} messages must be ${channel.limit} characters or fewer.`);
    }
    let scheduledAt = null;
    if (scheduling) {
      if (!scheduleInput.value) return showError("Choose a date and time to schedule for.");
      scheduledAt = new Date(scheduleInput.value).toISOString();
      if (new Date(scheduledAt) <= new Date()) return showError("Scheduled time must be in the future.");
    }

    setSending(true);
    try {
      await api.post("/api/v1/notifications", {
        member_id: selectedMember.id,
        channel: selectedChannel,
        priority: selectedPriority,
        subject: subjectInput.value || null,
        body: bodyInput.value,
        scheduled_at: scheduledAt,
      });
      showToast(scheduling ? "Notification scheduled." : "Notification queued.", "success");
      bodyInput.value = "";
      subjectInput.value = "";
      updateCounter();
      if (scheduling) toggleSchedule();
      await loadHistory();
    } catch (err) {
      showError(err.message);
    } finally {
      setSending(false);
    }
  });

  /* ---- initial mount ---- */

  selectChannel(selectedChannel);
  updateCounter();

  mount(root, [
    el("div", { class: "notif-view" }, [
      el("div", { class: "n-grid" }, [
        el("div", { class: "n-card" }, [
          el("h3", {}, "Send a notification"),
          el("p", { class: "n-sub" }, "Reach a member by email, SMS, or push."),
          form,
        ]),
        historyPanel,
      ]),
    ]),
  ]);
}