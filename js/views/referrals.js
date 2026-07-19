import { api } from "../api.js";
import { el, mount, formatDateTime, formatMoney, titleCase, badge, dataTable, openModal, showToast, memberPicker } from "../utils.js";

let active = "referrals";
let statusFilter = "";

export async function renderReferrals(root) {
  const tabs = el("div", { class: "tabs" }, [
    tabButton("referrals", "Referrals", root),
    tabButton("settings", "Settings", root),
  ]);
  const content = el("div", {});
  mount(root, [tabs, content]);
  await renderTabContent(content, root);
}

function tabButton(key, label, root) {
  return el("button", { class: `tab ${active === key ? "active" : ""}`, onclick: async () => { active = key; await renderReferrals(root); } }, label);
}

async function renderTabContent(content, root) {
  mount(content, el("div", { class: "spinner" }));
  if (active === "settings") await renderSettingsTab(content, root);
  else await renderReferralsTab(content, root);
}

async function renderReferralsTab(content, root) {
  const url = statusFilter ? `/api/v1/referrals?referral_status=${statusFilter}` : "/api/v1/referrals";
  const referrals = await api.get(url);

  const toolbar = el("div", { class: "toolbar" }, [
    el(
      "select",
      { onchange: async (e) => { statusFilter = e.target.value; await renderTabContent(content, root); } },
      ["", "invited", "registered", "commission_paid", "expired"].map((s) =>
        el("option", { value: s, selected: s === statusFilter }, s ? titleCase(s) : "All statuses")
      )
    ),
  ]);

  const table = dataTable(
    [
      { header: "Referrer", render: (r) => r.referrer_member_id.slice(0, 8) },
      { header: "Invited", render: (r) => r.referred_name },
      { header: "Contact", render: (r) => r.referred_contact },
      { header: "Channel", render: (r) => titleCase(r.channel) },
      { header: "Sent", render: (r) => formatDateTime(r.invited_at) },
      { header: "Status", render: (r) => badge(r.status) },
      { header: "Commission", className: "ledger", render: (r) => (r.commission_amount ? formatMoney(r.commission_amount) : "\u2014") },
      {
        header: "",
        render: (r) => (r.status === "registered"
          ? el("button", { class: "btn btn-primary btn-sm", onclick: () => openPayCommissionModal(content, root, r) }, "Pay commission")
          : ""),
      },
    ],
    referrals, "No referrals yet."
  );

  mount(content, [toolbar, el("div", { class: "card" }, [table])]);
}

function openPayCommissionModal(content, root, referral) {
  openModal(`Pay commission \u2014 ${referral.referred_name}`, (closeFn) => {
    let selectedMember = null;
    let selectedAccount = null;
    const errorEl = el("p", { class: "form-error", hidden: true });
    const accountHolder = el("div", { class: "field" });

    const picker = memberPicker(
      (q) => api.get(`/api/v1/members?q=${encodeURIComponent(q)}`).then((r) => r.items),
      async (m) => {
        selectedMember = m;
        accountHolder.innerHTML = "";
        if (!m) return;
        const accounts = await api.get(`/api/v1/savings/members/${m.id}/accounts`);
        if (!accounts.length) {
          accountHolder.appendChild(el("p", { class: "form-error" }, "This member has no savings accounts."));
          return;
        }
        const select = el("select", {}, accounts.map((a) => el("option", { value: a.id }, `${a.account_number} \u2014 UGX ${formatMoney(a.balance)}`)));
        accountHolder.appendChild(el("label", {}, "Credit which account?"));
        accountHolder.appendChild(select);
        selectedAccount = select;
      }
    );

    const form = el("form", {}, [
      el("p", { class: "muted" }, "This referral hasn't specified the referring member directly \u2014 confirm the referrer below before paying out."),
      el("div", { class: "field" }, [el("label", {}, "Referring member"), picker]),
      accountHolder,
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Pay commission"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      if (!selectedMember || !selectedAccount) {
        errorEl.textContent = "Select the referring member's savings account first.";
        errorEl.hidden = false;
        return;
      }
      try {
        await api.post(`/api/v1/referrals/${referral.id}/pay-commission`, {
          savings_account_id: selectedAccount.value,
        });
        showToast("Commission paid.", "success");
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

async function renderSettingsTab(content, root) {
  const settings = await api.get("/api/v1/referrals/system-settings");
  const errorEl = el("p", { class: "form-error", hidden: true });

  const amountInput = el("input", { type: "number", value: settings.referral_commission_amount, min: "0" });
  const form = el("form", {}, [
    el("div", { class: "field" }, [el("label", {}, "Referral commission amount (UGX)"), amountInput]),
    el("div", { class: "field-hint" }, "Paid out once a referred person registers as a member and staff confirms the payout."),
    errorEl,
    el("button", { type: "submit", class: "btn btn-primary" }, "Save"),
  ]);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    try {
      await api.patch("/api/v1/referrals/system-settings", { referral_commission_amount: Number(amountInput.value) });
      showToast("Settings saved.", "success");
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  mount(content, el("div", { class: "card" }, [el("h3", {}, "Referral Settings"), form]));
}
