import { api } from "../api.js";
import { el, mount, formatMoney, titleCase, dataTable, openModal, showToast, memberPicker } from "../utils.js";

let active = "holdings";

export async function renderShares(root) {
  const tabs = el("div", { class: "tabs" }, [
    tabButton("holdings", "Member Holdings", root),
    tabButton("products", "Products", root),
    tabButton("dividends", "Dividends", root),
  ]);
  const content = el("div", {});
  mount(root, [tabs, content]);
  await renderTabContent(content, root);
}

function tabButton(key, label, root) {
  return el("button", { class: `tab ${active === key ? "active" : ""}`, onclick: async () => { active = key; await renderShares(root); } }, label);
}

async function renderTabContent(content, root) {
  mount(content, el("div", { class: "spinner" }));
  if (active === "products") await renderProductsTab(content, root);
  else if (active === "dividends") await renderDividendsTab(content, root);
  else await renderHoldingsTab(content, root);
}

async function renderProductsTab(content, root) {
  const products = await api.get("/api/v1/shares/products");
  const card = el("div", { class: "card" }, [
    el("div", { class: "card-header" }, [
      el("h3", {}, "Share products"),
      el("button", { class: "btn btn-primary btn-sm", onclick: () => openProductModal(content, root) }, "+ New product"),
    ]),
    dataTable(
      [
        { header: "Name", render: (p) => p.name },
        { header: "Nominal value", className: "ledger", render: (p) => formatMoney(p.nominal_value) },
        { header: "Min. shares", render: (p) => p.min_shares_per_member },
      ],
      products, "No share products yet."
    ),
  ]);
  mount(content, card);
}

function openProductModal(content, root) {
  openModal("New share product", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Name"), el("input", { id: "sp-name", required: true })]),
      el("div", { class: "field" }, [el("label", {}, "Nominal value per share"), el("input", { id: "sp-value", type: "number", required: true })]),
      el("div", { class: "field" }, [el("label", {}, "Minimum shares per member"), el("input", { id: "sp-min", type: "number", value: "1" })]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Create"),
      ]),
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post("/api/v1/shares/products", {
          name: form.querySelector("#sp-name").value,
          nominal_value: Number(form.querySelector("#sp-value").value),
          min_shares_per_member: Number(form.querySelector("#sp-min").value || 1),
        });
        showToast("Share product created.", "success");
        closeFn();
        await renderTabContent(content, root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

async function renderHoldingsTab(content, root) {
  const resultsHolder = el("div", { style: "margin-top:16px" });
  const picker = memberPicker(
    (q) => api.get(`/api/v1/members?q=${encodeURIComponent(q)}`).then((r) => r.items),
    async (member) => {
      if (!member) { mount(resultsHolder, []); return; }
      await renderMemberHoldings(resultsHolder, root, content, member);
    }
  );
  mount(content, el("div", { class: "card" }, [el("h3", {}, "Find a member"), picker, resultsHolder]));
}

async function renderMemberHoldings(holder, root, content, member) {
  mount(holder, el("div", { class: "spinner" }));
  const [holdings, products] = await Promise.all([
    api.get(`/api/v1/shares/members/${member.id}/holdings`),
    api.get("/api/v1/shares/products"),
  ]);

  const header = el("div", { class: "card-header" }, [
    el("h3", {}, `${member.first_name} ${member.last_name}'s holdings`),
    el("button", {
      class: "btn btn-secondary btn-sm",
      onclick: () => openTransactionModal(holder, root, content, member, products),
    }, "+ Record transaction"),
  ]);

  const table = dataTable(
    [{ header: "Shares", render: (h) => `${h.number_of_shares}` }],
    holdings, "No share holdings for this member."
  );

  mount(holder, el("div", { class: "card" }, [header, table]));
}

function openTransactionModal(holder, root, content, member, products) {
  if (!products.length) {
    showToast("Create a share product first.", "error");
    return;
  }
  openModal("Record share transaction", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const productSelect = el("select", {}, products.map((p) => el("option", { value: p.id }, p.name)));
    const typeSelect = el("select", { id: "s-type" }, [
      el("option", { value: "subscription" }, "Subscription"),
      el("option", { value: "redemption" }, "Redemption"),
      el("option", { value: "transfer" }, "Transfer"),
    ]);
    const counterpartyHolder = el("div", { class: "field" });
    let counterparty = null;

    typeSelect.addEventListener("change", () => {
      counterpartyHolder.innerHTML = "";
      if (typeSelect.value === "transfer") {
        counterpartyHolder.appendChild(el("label", {}, "Transfer to member"));
        counterpartyHolder.appendChild(memberPicker(
          (q) => api.get(`/api/v1/members?q=${encodeURIComponent(q)}`).then((r) => r.items),
          (m) => { counterparty = m; }
        ));
      }
    });

    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Product"), productSelect]),
      el("div", { class: "field" }, [el("label", {}, "Type"), typeSelect]),
      el("div", { class: "field" }, [el("label", {}, "Number of shares"), el("input", { id: "s-shares", type: "number", required: true, min: "1" })]),
      counterpartyHolder,
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Record"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post(`/api/v1/shares/members/${member.id}/products/${productSelect.value}/transactions`, {
          txn_type: typeSelect.value,
          number_of_shares: Number(form.querySelector("#s-shares").value),
          counterparty_member_id: typeSelect.value === "transfer" ? counterparty?.id : null,
        });
        showToast("Transaction recorded.", "success");
        closeFn();
        await renderMemberHoldings(holder, root, content, member);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

async function renderDividendsTab(content, root) {
  const errorEl = el("p", { class: "form-error", hidden: true });
  const resultHolder = el("div", { style: "margin-top:16px" });

  const form = el("form", {}, [
    el("div", { class: "field-row" }, [
      el("div", { class: "field" }, [el("label", {}, "Financial year"), el("input", { id: "dv-year", placeholder: "e.g. 2025", required: true })]),
      el("div", { class: "field" }, [el("label", {}, "Rate per share"), el("input", { id: "dv-rate", type: "number", step: "0.0001", required: true })]),
    ]),
    errorEl,
    el("button", { type: "submit", class: "btn btn-primary" }, "Declare dividend"),
  ]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    try {
      const result = await api.post("/api/v1/shares/dividends/declare", {
        financial_year: form.querySelector("#dv-year").value,
        rate_per_share: Number(form.querySelector("#dv-rate").value),
      });
      showToast("Dividend declared.", "success");
      mount(resultHolder, el("div", { class: "card" }, [
        el("h3", {}, "Declaration summary"),
        el("p", {}, `Total paid out: UGX ${formatMoney(result.total_amount)} across ${result.members_paid} member holding(s).`),
      ]));
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  mount(content, [
    el("div", { class: "card" }, [
      el("h3", {}, "Declare a dividend"),
      el("p", { class: "muted" }, "This creates a pending payout for every member holding shares. Review carefully \u2014 dividends are regulatory-sensitive."),
      form,
    ]),
    resultHolder,
  ]);
}
