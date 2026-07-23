export function formatMoney(value) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

export function setButtonLoadingState(button, loading = true, loadingLabel = "Loading...") {
  if (!(button instanceof HTMLButtonElement)) return;

  if (loading) {
    if (!button.dataset.defaultText) {
      button.dataset.defaultText = button.textContent.trim();
    }

    button.classList.add("is-loading");
    button.disabled = true;

    let spinner = button.querySelector(".btn-spinner");
    if (!spinner) {
      spinner = document.createElement("span");
      spinner.className = "btn-spinner";
      spinner.setAttribute("aria-hidden", "true");
    }

    const label = document.createElement("span");
    label.className = "btn-label";
    label.textContent = loadingLabel;

    button.replaceChildren(spinner, label);
    return;
  }

  button.classList.remove("is-loading");
  button.disabled = false;

  const label = button.querySelector(".btn-label");
  if (label) label.remove();

  const spinner = button.querySelector(".btn-spinner");
  if (spinner) spinner.remove();

  if (button.dataset.defaultText) {
    button.appendChild(document.createTextNode(button.dataset.defaultText));
  }
}

/** Minimal, dependency-free element builder. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (key === "class") node.className = value;
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
  if (["active", "approved", "disbursed", "closed", "accepted", "sent", "reconciled"].includes(s)) return "badge badge-success";
  if (["pending", "under_review", "queued", "draft"].includes(s)) return "badge badge-warn";
  if (["rejected", "defaulted", "declined", "failed", "exception", "suspended", "exited"].includes(s)) return "badge badge-danger";
  return "badge badge-neutral";
}

export function badge(status) {
  return el("span", { class: statusBadgeClass(status) }, titleCase(status));
}

export function showToast(message, type = "default") {
  const root = document.getElementById("toast-root");
  const toast = el("div", { class: `toast ${type === "error" ? "error" : type === "success" ? "success" : ""}` }, message);
  root.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
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
export function openModal(title, buildBody) {
  const backdrop = el("div", { class: "modal-backdrop" });
  const close = () => backdrop.remove();
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  const modal = el("div", { class: "modal" }, [el("h3", {}, title), ...buildBody(close)]);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
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
      cache = null; // not an admin, or request failed - fall back silently
    }
  }

  return async function resolve(userId) {
    if (!userId) return "\u2014";
    await ensureLoaded();
    if (cache && cache.has(userId)) return cache.get(userId);
    return `User #${userId.slice(0, 8)}`;
  };
}

/** Simple yes/no confirmation modal. Returns a Promise<boolean>. */
export function confirmDialog(message, confirmLabel = "Confirm", danger = true) {
  return new Promise((resolve) => {
    openModal("Please confirm", (close) => [
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
 * columns: [{ header, render(row) -> string|Node, className? }]
 */
export function dataTable(columns, rows, emptyMessage = "No records found.") {
  if (!rows.length) {
    return el("div", { class: "table-empty" }, emptyMessage);
  }
  return el("div", { class: "table-wrap" }, [
    el("table", {}, [
      el("thead", {}, el("tr", {}, columns.map((c) => el("th", {}, c.header)))),
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
 * Pagination bar. onChange(nextPage) is called when the user navigates.
 */
export function paginationBar(page, pageSize, total, onChange) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return el("div", { class: "pagination" }, [
    el("span", { class: "muted" }, `${from}\u2013${to} of ${total}`),
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
export function memberPicker(searchFn, onSelect, placeholder = "Search by name, member number, or national ID\u2026") {
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
          }, `${m.first_name} ${m.last_name} \u2014 ${m.member_number}`)
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
