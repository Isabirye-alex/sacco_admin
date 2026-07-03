import { api } from "../api.js";
import {
  el, mount, formatMoney, formatDateTime, titleCase, dataTable, openModal, showToast, memberPicker,
} from "../utils.js";

let active = "accounts";

export async function renderSavings(root) {
  const tabs = el("div", { class: "tabs" }, [
    tabButton("accounts", "Member Accounts", root),
    tabButton("products", "Products", root),
  ]);
  const content = el("div", {});
  mount(root, [tabs, content]);
  await renderTabContent(content, root);
}

function tabButton(key, label, root) {
  const btn = el("button", { class: `tab ${active === key ? "active" : ""}`, onclick: async () => { active = key; await renderSavings(root); } }, label);
  return btn;
}

async function renderTabContent(content, root) {
  mount(content, el("div", { class: "spinner" }));
  if (active === "products") {
    await renderProductsTab(content, root);
  } else {
    await renderAccountsTab(content, root);
  }
}

async function renderProductsTab(content, root) {
  const products = await api.get("/api/v1/savings/products");

  const card = el("div", { class: "card" }, [
    el("div", { class: "card-header" }, [
      el("h3", {}, "Savings products"),
      el("button", { class: "btn btn-primary btn-sm", onclick: () => openProductModal(content, root) }, "+ New product"),
    ]),
    dataTable(
      [
        { header: "Name", render: (p) => p.name },
        { header: "Type", render: (p) => titleCase(p.product_type) },
        { header: "Interest p.a.", render: (p) => `${p.interest_rate_annual}%` },
        { header: "Min. balance", className: "ledger", render: (p) => formatMoney(p.minimum_balance) },
      ],
      products, "No savings products yet."
    ),
  ]);
  mount(content, card);
}

function openProductModal(content, root) {
  openModal("New savings product", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Name"), el("input", { id: "p-name", required: true })]),
      el("div", { class: "field" }, [
        el("label", {}, "Type"),
        el("select", { id: "p-type" }, ["regular", "fixed_deposit", "target", "emergency"].map((t) => el("option", { value: t }, titleCase(t)))),
      ]),
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "Interest rate p.a. (%)"), el("input", { id: "p-rate", type: "number", step: "0.01", value: "0" })]),
        el("div", { class: "field" }, [el("label", {}, "Minimum balance"), el("input", { id: "p-min", type: "number", value: "0" })]),
      ]),
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
        await api.post("/api/v1/savings/products", {
          name: form.querySelector("#p-name").value,
          product_type: form.querySelector("#p-type").value,
          interest_rate_annual: Number(form.querySelector("#p-rate").value || 0),
          minimum_balance: Number(form.querySelector("#p-min").value || 0),
        });
        showToast("Savings product created.", "success");
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

async function renderAccountsTab(content, root) {
  let selectedMember = null;
  const resultsHolder = el("div", { style: "margin-top:16px" });

  const picker = memberPicker(
    (q) => api.get(`/api/v1/members?q=${encodeURIComponent(q)}`).then((r) => r.items),
    async (member) => {
      selectedMember = member;
      if (!member) {
        mount(resultsHolder, []);
        return;
      }
      await renderMemberAccounts(resultsHolder, root, content, member);
    }
  );

  const card = el("div", { class: "card" }, [
    el("h3", {}, "Find a member"),
    picker,
    resultsHolder,
  ]);
  mount(content, card);
}

async function renderMemberAccounts(holder, root, content, member) {
  mount(holder, el("div", { class: "spinner" }));
  const [accounts, products] = await Promise.all([
    api.get(`/api/v1/savings/members/${member.id}/accounts`),
    api.get("/api/v1/savings/products"),
  ]);

  const header = el("div", { class: "card-header" }, [
    el("h3", {}, `${member.first_name} ${member.last_name}'s accounts`),
    el("button", {
      class: "btn btn-secondary btn-sm",
      onclick: () => openNewAccountModal(holder, root, content, member, products),
    }, "+ Open account"),
  ]);

  const table = dataTable(
    [
      { header: "Account", render: (a) => a.account_number },
      { header: "Balance", className: "ledger", render: (a) => formatMoney(a.balance) },
      { header: "Status", render: (a) => (a.is_active ? "Active" : "Closed") },
      {
        header: "",
        render: (a) => el("div", { style: "display:flex;gap:6px" }, [
          el("button", { class: "btn btn-secondary btn-sm", onclick: () => openTransactionModal(holder, root, content, member, a) }, "Post transaction"),
          el("button", { class: "btn btn-ghost btn-sm", onclick: async () => showHistory(a) }, "History"),
        ]),
      },
    ],
    accounts, "No savings accounts for this member."
  );

  mount(holder, el("div", { class: "card" }, [header, table]));
}

async function showHistory(account) {
  const txns = await api.get(`/api/v1/savings/accounts/${account.id}/transactions`);
  openModal(`${account.account_number} \u2014 Transactions`, () => [
    dataTable(
      [
        { header: "Date", render: (t) => formatDateTime(t.created_at) },
        { header: "Type", render: (t) => titleCase(t.txn_type) },
        { header: "Amount", className: "ledger", render: (t) => formatMoney(t.amount) },
        { header: "Balance after", className: "ledger", render: (t) => formatMoney(t.balance_after) },
      ],
      txns, "No transactions yet."
    ),
  ]);
}

function openNewAccountModal(holder, root, content, member, products) {
  if (!products.length) {
    showToast("Create a savings product first.", "error");
    return;
  }
  openModal("Open savings account", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const productSelect = el("select", { id: "a-product" }, products.map((p) => el("option", { value: p.id }, p.name)));
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Product"), productSelect]),
      el("div", { class: "field" }, [el("label", {}, "Target amount (optional)"), el("input", { id: "a-target", type: "number" })]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Open account"),
      ]),
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post("/api/v1/savings/accounts", {
          member_id: member.id,
          product_id: productSelect.value,
          target_amount: form.querySelector("#a-target").value ? Number(form.querySelector("#a-target").value) : null,
        });
        showToast("Account opened.", "success");
        closeFn();
        await renderMemberAccounts(holder, root, content, member);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

function openTransactionModal(holder, root, content, member, account) {
  openModal(`${account.account_number} \u2014 Post transaction`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const typeSelect = el("select", { id: "t-type" }, [
      el("option", { value: "deposit" }, "Deposit"),
      el("option", { value: "withdrawal" }, "Withdrawal"),
    ]);
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Type"), typeSelect]),
      el("div", { class: "field" }, [el("label", {}, "Amount"), el("input", { id: "t-amount", type: "number", required: true, min: "0.01", step: "0.01" })]),
      el("div", { class: "field" }, [el("label", {}, "Narrative (optional)"), el("input", { id: "t-narrative" })]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Post"),
      ]),
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post(`/api/v1/savings/accounts/${account.id}/transactions`, {
          txn_type: typeSelect.value,
          amount: Number(form.querySelector("#t-amount").value),
          narrative: form.querySelector("#t-narrative").value || null,
        });
        showToast("Transaction posted.", "success");
        closeFn();
        await renderMemberAccounts(holder, root, content, member);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}
