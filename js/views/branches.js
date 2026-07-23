import { api } from "../api.js";
import { el, mount, badge, dataTable, openModal, showToast } from "../utils.js";

export async function renderBranches(root) {
  mount(root, el("div", { class: "spinner" }));
  await renderBranchList(root);
}

async function renderBranchList(root) {
  const branches = await api.get("/api/v1/branches").catch(() => []);

  const totalBranches = branches.length;
  const activeBranches = branches.filter((b) => b.is_active).length;

  const stats = el("div", { class: "grid grid-2", style: "margin-bottom: 20px;" }, [
    el("div", { class: "card stat-card" }, [
      el("div", { class: "stat-label" }, "Total SACCO Branches"),
      el("div", { class: "stat-value" }, String(totalBranches)),
    ]),
    el("div", { class: "card stat-card" }, [
      el("div", { class: "stat-label" }, "Active Branches"),
      el("div", { class: "stat-value", style: "color: var(--pine-600);" }, String(activeBranches)),
    ]),
  ]);

  const card = el("div", { class: "card" }, [
    el("div", { class: "card-header" }, [
      el("h3", {}, "SACCO Branch Network"),
      el("button", { class: "btn btn-primary btn-sm", onclick: () => openCreateBranchModal(root) }, "+ New Branch"),
    ]),
    dataTable(
      [
        { header: "Code", render: (b) => el("strong", {}, b.code) },
        { header: "Name", render: (b) => b.name },
        { header: "Address / Location", render: (b) => b.address || "—" },
        { header: "Phone Number", render: (b) => b.phone_number || "—" },
        { header: "Status", render: (b) => (b.is_active ? badge("active") : badge("inactive")) },
        {
          header: "",
          render: (b) => el("button", { class: "btn btn-secondary btn-sm", onclick: () => openEditBranchModal(root, b) }, "Edit"),
        },
      ],
      branches,
      "No branches created yet. Click '+ New Branch' to add your first SACCO branch."
    ),
  ]);

  mount(root, [stats, card]);
}

function openCreateBranchModal(root) {
  openModal("New SACCO Branch", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const form = el("form", {}, [
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "Branch Code (e.g. KLA-01)"), el("input", { id: "b-code", required: true, placeholder: "KLA-01" })]),
        el("div", { class: "field" }, [el("label", {}, "Branch Name"), el("input", { id: "b-name", required: true, placeholder: "Kampala Main Branch" })]),
      ]),
      el("div", { class: "field" }, [el("label", {}, "Physical Address / Location"), el("input", { id: "b-address", placeholder: "Plot 42 Kampala Road, City Centre" })]),
      el("div", { class: "field" }, [el("label", {}, "Phone Number"), el("input", { id: "b-phone", placeholder: "+256 700 000 000" })]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Create Branch"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post("/api/v1/branches", {
          code: form.querySelector("#b-code").value.trim(),
          name: form.querySelector("#b-name").value.trim(),
          address: form.querySelector("#b-address").value.trim() || null,
          phone_number: form.querySelector("#b-phone").value.trim() || null,
        });
        showToast("Branch created successfully.", "success");
        closeFn();
        await renderBranches(root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}

function openEditBranchModal(root, branch) {
  openModal(`Edit ${branch.name}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const activeToggle = el("input", { type: "checkbox", checked: branch.is_active });

    const form = el("form", {}, [
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "Branch Code"), el("input", { value: branch.code, disabled: true })]),
        el("div", { class: "field" }, [el("label", {}, "Branch Name"), el("input", { id: "b-name", value: branch.name, required: true })]),
      ]),
      el("div", { class: "field" }, [el("label", {}, "Physical Address / Location"), el("input", { id: "b-address", value: branch.address || "" })]),
      el("div", { class: "field" }, [el("label", {}, "Phone Number"), el("input", { id: "b-phone", value: branch.phone_number || "" })]),
      el("div", { class: "field", style: "display:flex;align-items:center;gap:8px" }, [
        activeToggle,
        el("label", { style: "margin:0" }, "Branch Active"),
      ]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Save Changes"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.patch(`/api/v1/branches/${branch.id}`, {
          name: form.querySelector("#b-name").value.trim(),
          address: form.querySelector("#b-address").value.trim() || null,
          phone_number: form.querySelector("#b-phone").value.trim() || null,
          is_active: activeToggle.checked,
        });
        showToast("Branch updated successfully.", "success");
        closeFn();
        await renderBranches(root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
    return [form];
  });
}
