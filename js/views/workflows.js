import { api } from "../api.js";
import { el, mount, formatDate, badge, refreshIcons } from "../utils.js";
import { goTo } from "../router.js";
import { loadWorkflowQueue } from "../domain.js";

let queueItems = [];
let activeFilter = "all";

async function fetchQueue() {
  queueItems = await loadWorkflowQueue(api);
}

export async function renderWorkflows(root) {
  await fetchQueue();
  const container = el("div", {});

  const header = el("div", { class: "page-header" }, [
    el("div", { class: "page-header-row" }, [
      el("div", { class: "page-header-titles" }, [
        el("h1", { class: "page-title" }, "Approvals Queue"),
        el("p", { class: "page-subtitle muted" }, `${queueItems.length} item${queueItems.length === 1 ? "" : "s"} pending across all modules.`),
      ]),
      el("div", { class: "page-header-actions" }, [
        el("select", {
          class: "select-sm",
          onchange: (e) => { activeFilter = e.target.value; renderBody(); }
        }, [
          el("option", { value: "all" }, "All Modules"),
          el("option", { value: "loans" }, "Loans"),
          el("option", { value: "risk" }, "Risk Flags"),
          el("option", { value: "members" }, "Members"),
        ]),
        el("button", { class: "btn btn-secondary btn-sm", onclick: () => { fetchQueue().then(renderBody); } }, "Refresh"),
      ]),
    ]),
  ]);

  const grid = el("div", { class: "grid grid-1", style: "margin-top: 20px;" });
  container.appendChild(header);
  container.appendChild(grid);

  function renderBody() {
    mount(grid, el("div", { class: "spinner" }));
    const filtered = queueItems.filter((item) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "loans") return item.type === "Loan Application";
      if (activeFilter === "risk") return item.type === "Risk Flag";
      if (activeFilter === "members") return item.type === "Member Verification";
      return true;
    });

    const rows = filtered.map((item) => {
      const priorityBadge = item.priority === "high"
        ? el("span", { class: "badge badge-danger", style: "margin-right:6px;" }, "HIGH")
        : null;
      return el("tr", {}, [
        el("td", {}, [priorityBadge, badge(item.type)]),
        el("td", {}, item.description || "—"),
        el("td", {}, item.created_at ? formatDate(item.created_at) : "—"),
        el("td", {}, [
          el("a", { href: item.href || "#", class: "btn btn-primary btn-sm", onclick: (e) => { e.preventDefault(); goTo(item.href.replace("#", "")); } }, item.action || "View"),
        ]),
      ]);
    });

    mount(grid, el("div", { class: "card" }, [
      el("h3", {}, "Pending Items"),
      rows.length
        ? el("div", { class: "table-wrap" }, el("table", {}, [
            el("thead", {}, el("tr", {}, [
              el("th", {}, "Priority"),
              el("th", {}, "Type"),
              el("th", {}, "Description"),
              el("th", {}, "Date"),
              el("th", {}, "Action"),
            ])),
            el("tbody", {}, rows),
          ]))
        : el("div", { class: "table-empty" }, "No pending approval items."),
    ]));
    refreshIcons(root);
  }

  renderBody();
  mount(root, container);
}
