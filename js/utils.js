export function formatMoney(value) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatMoneyCompact(value) {
  const n = Number(value ?? 0);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function titleCase(value) {
  if (!value) return "";
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const activeLoadingButtons = new Map();

export function setButtonLoadingState(button, loading = true, loadingLabel = null) {
  if (!button || !(button instanceof HTMLElement)) return;

  if (loading) {
    if (activeLoadingButtons.has(button)) return;

    button.classList.add("is-loading");
    button.disabled = true;

    let spinner = button.querySelector(".btn-spinner");
    if (!spinner) {
      spinner = document.createElement("span");
      spinner.className = "btn-spinner";
      spinner.setAttribute("aria-hidden", "true");
      button.prepend(spinner);
    }

    activeLoadingButtons.set(button, Date.now());
    return;
  }

  const startTime = activeLoadingButtons.get(button);
  const finish = () => {
    button.classList.remove("is-loading");
    button.disabled = false;
    const spinner = button.querySelector(".btn-spinner");
    if (spinner) spinner.remove();
  };

  if (startTime) {
    activeLoadingButtons.delete(button);
    const elapsed = Date.now() - startTime;
    const minTime = 350; // Keep spinner visible for at least 350ms
    const remaining = Math.max(0, minTime - elapsed);
    if (remaining > 0) {
      setTimeout(finish, remaining);
    } else {
      finish();
    }
  } else {
    finish();
  }
}

/** Registers global click and submit handlers to show loading spinners on all buttons. */
export function initGlobalButtonSpinners() {
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target?.closest ? e.target.closest("button, .btn, [role='button']") : null;
      if (!btn || btn.disabled || btn.classList.contains("is-loading")) return;
      setButtonLoadingState(btn, true);
      setTimeout(() => {
        setButtonLoadingState(btn, false);
      }, 450);
    },
    true
  );

  document.addEventListener(
    "submit",
    (e) => {
      const form = e.target;
      if (!form || !(form instanceof HTMLFormElement)) return;
      const submitBtn = form.querySelector("button[type='submit'], button.btn-primary, button:not([type='button'])");
      if (!submitBtn) return;
      setButtonLoadingState(submitBtn, true);
      setTimeout(() => {
        setButtonLoadingState(submitBtn, false);
      }, 550);
    },
    true
  );
}

/** Minimal, dependency-free element builder. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (key === "class") node.className = value;
    else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") {
      const eventName = key.slice(2).toLowerCase();
      node.addEventListener(eventName, async (event) => {
        if (eventName === "click" && node.tagName === "BUTTON") {
          setButtonLoadingState(node, true);
        }

        try {
          const result = value(event);
          if (result && typeof result.then === "function") {
            await result;
          }
        } finally {
          if (eventName === "click" && node.tagName === "BUTTON") {
            setButtonLoadingState(node, false);
          }
        }
      });
    } else if (value !== undefined && value !== null && value !== false) {
      node.setAttribute(key, value === true ? "" : value);
    }
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const child of kids) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === "string" || typeof child === "number" ? document.createTextNode(child) : child);
  }
  return node;
}

export function statusBadgeClass(status) {
  const s = String(status || "").toLowerCase();
  if (["active", "approved", "disbursed", "closed", "accepted", "sent", "reconciled", "success", "resolved", "submitted"].includes(s)) return "badge badge-success";
  if (["pending", "under_review", "queued", "draft", "invited", "open"].includes(s)) return "badge badge-warn";
  if (["rejected", "defaulted", "declined", "failed", "exception", "suspended", "exited", "escalated"].includes(s)) return "badge badge-danger";
  if (["registered", "info"].includes(s)) return "badge badge-info";
  return "badge badge-neutral";
}

export function badge(status) {
  return el("span", { class: statusBadgeClass(status) }, titleCase(status));
}

/**
 * Refresh Lucide icons in a node (and any newly mounted subtrees).
 * Lucide is loaded as a global `lucide` via the UMD CDN.
 */
export function refreshIcons(scope = document) {
  if (typeof window !== "undefined" && window.lucide && window.lucide.createIcons) {
    try { window.lucide.createIcons(); } catch {}
  }
}

export function showToast(message, type = "default", duration = 4200) {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const iconMap = { success: "check-circle", error: "alert-circle", info: "info" };
  const toast = el("div", { class: `toast ${type === "error" ? "error" : type === "success" ? "success" : type === "info" ? "info" : ""}` });
  if (iconMap[type]) toast.appendChild(el("i", { "data-lucide": iconMap[type] }));
  toast.appendChild(el("span", {}, message));
  root.appendChild(toast);
  refreshIcons(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

export function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function mount(rootNode, children) {
  clearNode(rootNode);
  const kids = Array.isArray(children) ? children : [children];
  kids.forEach((child) => child && rootNode.appendChild(child));
}

/**
 * Renders a modal dialog. `buildBody(closeFn)` returns an array of child
 * nodes for the modal body; call closeFn() to dismiss programmatically.
 */
export function openModal(title, buildBody, { size } = {}) {
  const backdrop = el("div", { class: "modal-backdrop" });
  const close = () => backdrop.remove();
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", function escHandler(e) {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", escHandler);
    }
  });

  const sizeClass = size === "lg" ? " modal-lg" : size === "xl" ? " modal-xl" : "";
  const modal = el("div", { class: `modal${sizeClass}` }, [el("h3", {}, title), ...buildBody(close)]);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  refreshIcons(modal);
  return close;
}

/**
 * Returns an async resolve(userId) -> displayName function for showing
 * "performed by" in tables. Only admins can list all users; for other
 * roles this quietly falls back to showing a shortened ID instead of
 * failing the whole page.
 */
export function createUserNameResolver(apiGet) {
  let cache = null;
  let attempted = false;

  async function ensureLoaded() {
    if (attempted) return;
    attempted = true;
    try {
      const users = await apiGet("/api/v1/admin/users");
      cache = new Map(users.map((u) => [u.id, u.full_name]));
    } catch {
      cache = null;
    }
  }

  return async function resolve(userId) {
    if (!userId) return "—";
    await ensureLoaded();
    if (cache && cache.has(userId)) return cache.get(userId);
    return `User #${userId.slice(0, 8)}`;
  };
}

/** Simple yes/no confirmation modal. Returns a Promise<boolean>. */
export function confirmDialog(message, confirmLabel = "Confirm", danger = true, title = "Please confirm") {
  return new Promise((resolve) => {
    openModal(title, (close) => [
      el("p", { class: "muted" }, message),
      el("div", { class: "modal-actions" }, [
        el("button", { class: "btn btn-secondary", onclick: () => { close(); resolve(false); } }, "Cancel"),
        el("button", {
          class: danger ? "btn btn-danger" : "btn btn-primary",
          onclick: () => { close(); resolve(true); },
        }, confirmLabel),
      ]),
    ]);
  });
}

/**
 * Renders a table from column definitions and row data.
 * columns: [{ header, render(row) -> string|Node, className?, sortValue? }]
 */
export function dataTable(columns, rows, emptyMessage = "No records found.") {
  if (!rows.length) {
    return el("div", { class: "table-empty" }, emptyMessage);
  }
  return el("div", { class: "table-wrap" }, [
    el("table", {}, [
      el("thead", {}, el("tr", {}, columns.map((c) => el("th", { class: c.sortValue ? "sortable" : "" }, c.header)))),
      el(
        "tbody",
        {},
        rows.map((row) =>
          el(
            "tr", {},
            columns.map((c) => {
              const value = c.render(row);
              return el("td", { class: c.className || "" }, typeof value === "string" || typeof value === "number" ? value : value || "");
            })
          )
        )
      ),
    ]),
  ]);
}

/**
 * Sortable, paginated data table with column sorting.
 * columns: [{ header, render(row) -> string|Node, className?, sortValue?(row) -> any }]
 */
export function sortableTable({ columns, rows, emptyMessage = "No records found.", pageSize = 25, initialSort = null }) {
  const state = { sortKey: initialSort, sortDir: 1, page: 1 };
  const wrap = el("div", {});

  function applySort(items) {
    if (!state.sortKey) return items;
    const col = columns.find((c) => c.sortValue);
    if (!col) return items;
    const key = columns.indexOf(col);
    return [...items].sort((a, b) => {
      const va = col.sortValue(a);
      const vb = col.sortValue(b);
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * state.sortDir;
      return String(va).localeCompare(String(vb)) * state.sortDir;
    });
  }

  function renderHeader() {
    return el("tr", {}, columns.map((c, i) => {
      const indicator = state.sortKey === i ? (state.sortDir === 1 ? "▲" : "▼") : (c.sortValue ? "⇅" : "");
      return el("th", {
        class: c.sortValue ? "sortable" : "",
        onclick: () => {
          if (!c.sortValue) return;
          if (state.sortKey === i) state.sortDir *= -1;
          else { state.sortKey = i; state.sortDir = 1; }
          render();
        }
      }, [c.header, indicator ? el("span", { class: "sort-indicator" }, indicator) : null].filter(Boolean));
    }));
  }

  function renderBody(items) {
    return items.map((row) =>
      el("tr", {}, columns.map((c) => {
        const value = c.render(row);
        return el("td", { class: c.className || "" }, typeof value === "string" || typeof value === "number" ? value : value || "");
      }))
    );
  }

  function render() {
    const sorted = applySort(rows);
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * pageSize;
    const pageRows = sorted.slice(start, start + pageSize);

    const body = el("tbody", {}, pageRows.length
      ? renderBody(pageRows)
      : [el("tr", {}, el("td", { colspan: String(columns.length) }, emptyMessage))]
    );

    const pageInfo = el("span", { class: "muted" },
      sorted.length === 0
        ? "0 records"
        : `Showing ${start + 1}–${Math.min(start + pageSize, sorted.length)} of ${sorted.length}`
    );

    const pageNums = el("div", { class: "page-numbers" });
    for (let p = 1; p <= totalPages; p++) {
      if (totalPages > 7 && p > 2 && p < totalPages - 1 && Math.abs(p - state.page) > 1) {
        if (p === 3 || p === totalPages - 2) pageNums.appendChild(el("span", { class: "page-num" }, "…"));
        continue;
      }
      pageNums.appendChild(el("button", {
        class: `page-num ${p === state.page ? "active" : ""}`,
        onclick: () => { state.page = p; render(); }
      }, String(p)));
    }

    const pagination = el("div", { class: "pagination" }, [
      pageInfo,
      el("div", { class: "controls" }, [
        el("button", { class: "btn btn-secondary btn-sm", disabled: state.page <= 1, onclick: () => { state.page--; render(); } }, "Previous"),
        pageNums,
        el("button", { class: "btn btn-secondary btn-sm", disabled: state.page >= totalPages, onclick: () => { state.page++; render(); } }, "Next"),
      ]),
    ]);

    mount(wrap, [
      el("div", { class: "table-wrap" }, [el("table", {}, [el("thead", {}, renderHeader()), body])]),
      sorted.length > pageSize ? pagination : null,
    ].filter(Boolean));
  }
  render();
  return wrap;
}

/**
 * Pagination bar. onChange(nextPage) is called when the user navigates.
 */
export function paginationBar(page, pageSize, total, onChange) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return el("div", { class: "pagination" }, [
    el("span", { class: "muted" }, `${from}–${to} of ${total}`),
    el("div", { class: "controls" }, [
      el("button", { class: "btn btn-secondary btn-sm", disabled: page <= 1, onclick: () => onChange(page - 1) }, "Previous"),
      el("span", { class: "muted small", style: "align-self:center" }, `Page ${page} of ${totalPages}`),
      el("button", { class: "btn btn-secondary btn-sm", disabled: page >= totalPages, onclick: () => onChange(page + 1) }, "Next"),
    ]),
  ]);
}

/**
 * A search-as-you-type member picker. Calls onSelect(member) once chosen.
 * Returns the container element to mount in a form.
 */
export function memberPicker(searchFn, onSelect, placeholder = "Search by name, member number, or national ID…") {
  let selected = null;
  const container = el("div", {});
  const input = el("input", { type: "text", placeholder });
  const resultsBox = el("div", {});
  container.appendChild(input);
  container.appendChild(resultsBox);

  let debounceTimer;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (!q) {
      clearNode(resultsBox);
      return;
    }
    debounceTimer = setTimeout(async () => {
      const results = await searchFn(q);
      clearNode(resultsBox);
      if (!results.length) {
        resultsBox.appendChild(el("div", { class: "picker-results" }, [el("div", { class: "picker-result-row muted" }, "No matches.")]));
        return;
      }
      const list = el(
        "div", { class: "picker-results" },
        results.slice(0, 8).map((m) =>
          el("div", {
            class: "picker-result-row",
            onclick: () => {
              selected = m;
              input.value = "";
              clearNode(resultsBox);
              renderSelected();
              onSelect(m);
            },
          }, `${m.first_name} ${m.last_name} — ${m.member_number}`)
        )
      );
      resultsBox.appendChild(list);
    }, 250);
  });

  function renderSelected() {
    const existing = container.querySelector(".picker-selected");
    if (existing) existing.remove();
    if (!selected) return;
    container.appendChild(
      el("div", { class: "picker-selected" }, [
        el("span", {}, `${selected.first_name} ${selected.last_name} (${selected.member_number})`),
        el("button", {
          type: "button", class: "btn btn-ghost btn-sm",
          onclick: () => { selected = null; renderSelected(); onSelect(null); },
        }, "Change"),
      ])
    );
  }

  container.getSelected = () => selected;
  return container;
}

/** Debounce helper */
export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Get initials from a full name */
export function initials(name) {
  if (!name) return "??";
  return String(name)
    .trim()
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}
