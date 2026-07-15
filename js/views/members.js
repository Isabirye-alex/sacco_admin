import { api } from "../api.js";
import {
  el, mount, formatMoney, formatDate, titleCase, badge, dataTable, paginationBar,
  openModal, confirmDialog, showToast, memberPicker
} from "../utils.js";

// Load Lucide Icons dynamically from a reliable CDN
if (!window.lucide) {
  const script = document.createElement("script");
  script.src = "https://unpkg.com/lucide@latest";
  script.onload = () => {
    if (window.lucide) window.lucide.createIcons();
  };
  document.head.appendChild(script);
}

// Utility to safely trigger Lucide icon rendering after DOM updates
function refreshIcons() {
  if (window.lucide) {
    setTimeout(() => window.lucide.createIcons(), 10);
  }
}

const state = { page: 1, pageSize: 15, q: "", status: "", selectedId: null };

export async function renderMembers(root) {
  mount(root, el("div", { class: "spinner" }));
  if (state.selectedId) {
    await renderDetail(root, state.selectedId);
  } else {
    await renderList(root);
  }
}

async function renderList(root) {
  const params = new URLSearchParams({ page: state.page, page_size: state.pageSize });
  if (state.q) params.set("q", state.q);
  if (state.status) params.set("status", state.status);

  const data = await api.get(`/api/v1/members?${params.toString()}`);

  const itemsWithBalances = await Promise.all(
    (data.items || []).map(async (m) => {
      try {
        const [accounts, holdings] = await Promise.all([
          api.get(`/api/v1/savings/members/${m.id}/accounts`).catch(() => []),
          api.get(`/api/v1/shares/members/${m.id}/holdings`).catch(() => [])
        ]);
        const savingsBalance = accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
        const shareCount = holdings.reduce((sum, h) => sum + Number(h.number_of_shares || 0), 0);
        const shareBalance = shareCount * 10000; 
        return { ...m, savingsBalance, shareBalance };
      } catch {
        return { ...m, savingsBalance: 0, shareBalance: 0 };
      }
    })
  );

  const toolbar = el("div", { class: "toolbar", style: "display: flex; gap: 10px; align-items: center; flex-wrap: wrap;" }, [
    el("div", { style: "position: relative; display: flex; align-items: center;" }, [
      el("i", { "data-lucide": "search", style: "position: absolute; left: 10px; width: 16px; height: 16px; color: #888;" }),
      el("input", {
        class: "search-input", type: "text", placeholder: "Search name, ID\u2026",
        style: "padding-left: 32px;",
        value: state.q,
        oninput: debounce((e) => { state.q = e.target.value; state.page = 1; renderMembers(root); }, 350),
      })
    ]),
    el(
      "select",
      { onchange: (e) => { state.status = e.target.value; state.page = 1; renderMembers(root); } },
      ["", "active", "dormant", "suspended", "exited"].map((s) =>
        el("option", { value: s, selected: s === state.status }, s ? titleCase(s) : "All statuses")
      )
    ),
    el("button", { class: "btn btn-primary", style: "display: flex; align-items: center; gap: 6px;", onclick: () => openCreateMemberModal(root) }, [
      el("i", { "data-lucide": "plus", style: "width: 16px; height: 16px;" }),
      el("span", {}, "Add member")
    ]),
    el("button", { class: "btn btn-secondary", style: "display: flex; align-items: center; gap: 6px;", onclick: () => openBulkUploadModal(root) }, [
      el("i", { "data-lucide": "upload", style: "width: 16px; height: 16px;" }),
      el("span", {}, "Bulk Upload CSV")
    ])
  ]);

  const table = dataTable(
    [
      { header: "Member No.", render: (m) => m.member_number },
      { header: "Name", render: (m) => `${m.first_name} ${m.last_name}` },
      { header: "Contact Info", render: (m) => el("div", {}, [
        el("div", {}, m.phone_number),
        el("div", { class: "muted small" }, m.email || "No email")
      ])},
      { header: "Status", render: (m) => badge(m.status) },
      { header: "Savings Balance", className: "ledger", render: (m) => `UGX ${formatMoney(m.savingsBalance)}` },
      { header: "Share Value", className: "ledger", render: (m) => `UGX ${formatMoney(m.shareBalance)}` },
      { header: "Joined", render: (m) => formatDate(m.date_joined) },
      {
        header: "",
        render: (m) => el("button", { class: "btn btn-secondary btn-sm", onclick: () => { state.selectedId = m.id; renderMembers(root); } }, "Open Profile"),
      },
    ],
    itemsWithBalances,
    "No members match your search."
  );

  const card = el("div", { class: "card" }, [table]);
  mount(root, [toolbar, card, paginationBar(data.page, data.page_size, data.total, (p) => { state.page = p; renderMembers(root); })]);
  refreshIcons();
}

async function renderDetail(root, memberId) {
  const [member, accounts, loans, holdings] = await Promise.all([
    api.get(`/api/v1/members/${memberId}`),
    api.get(`/api/v1/savings/members/${memberId}/accounts`).catch(() => []),
    api.get(`/api/v1/loans/applications?member_id=${memberId}`).catch(() => []),
    api.get(`/api/v1/shares/members/${memberId}/holdings`).catch(() => []),
  ]);

  const backBtn = el("button", { 
    class: "detail-back", 
    style: "display: flex; align-items: center; gap: 6px; background: none; border: none; cursor: pointer; color: var(--pine-700); font-weight: 500;",
    onclick: () => { state.selectedId = null; renderMembers(root); } 
  }, [
    el("i", { "data-lucide": "arrow-left", style: "width: 16px; height: 16px;" }),
    el("span", {}, "Back to members")
  ]);

  const showApprovalBar = ["dormant", "suspended"].includes(member.status);
  const approvalActions = showApprovalBar
    ? el("div", { style: "background: var(--pine-50); padding: 12px 16px; border-radius: 8px; border: 1px solid var(--pine-200); display: flex; gap: 10px; align-items: center; margin-bottom: 15px;" }, [
        el("i", { "data-lucide": "shield-alert", style: "width: 20px; height: 20px; color: var(--pine-600);" }),
        el("span", { style: "font-weight: 600; color: var(--pine-900); flex-grow: 1;" }, "Registration Status: Pending approval"),
        el("button", { class: "btn btn-primary btn-sm", onclick: () => approveRegistration(root, member) }, "Approve Registration"),
        el("button", { class: "btn btn-danger btn-sm", onclick: () => rejectRegistration(root, member) }, "Reject Registration")
      ])
    : null;

  const header = el("div", { class: "detail-header" }, [
    el("div", {}, [
      el("h2", {}, `${member.first_name} ${member.last_name}`),
      el("p", { class: "muted" }, `${member.member_number} \u00b7 ${member.national_id} \u00b7 Joined ${formatDate(member.date_joined)}`),
    ]),
    el("div", { style: "display:flex;gap:8px;align-items:center" }, [
      badge(member.status),
      el("button", { class: "btn btn-secondary btn-sm", onclick: () => openEditMemberModal(root, member) }, "Manage Status"),
      el("button", { class: "btn btn-secondary btn-sm", onclick: () => openShareReallocation(root, member, holdings) }, "Share Reallocation"),
      member.status !== "exited"
        ? el("button", {
            class: "btn btn-danger btn-sm",
            onclick: async () => {
              const ok = await confirmDialog(`Mark ${member.first_name} ${member.last_name} as exited? This cannot be undone.`, "Exit member");
              if (!ok) return;
              try {
                await api.del(`/api/v1/members/${member.id}`);
                showToast("Member exited.", "success");
                state.selectedId = null;
                renderMembers(root);
              } catch (err) {
                showToast(err.message, "error");
              }
            },
          }, "Exit member")
        : null,
    ]),
  ]);

  const leftCol = el("div", { class: "card", style: "flex: 1;" }, [
    el("h3", {}, "Bio-data Details"),
    infoRow("First Name", member.first_name),
    infoRow("Last Name", member.last_name),
    infoRow("National ID", member.national_id),
    infoRow("Date of Birth", member.date_of_birth ? formatDate(member.date_of_birth) : "—"),
    infoRow("Phone Number", member.phone_number),
    infoRow("Email Address", member.email || "—"),
    infoRow("Address", member.physical_address || "—"),
    infoRow("Occupation", member.occupation || "—"),
  ]);

  const rightCol = el("div", { class: "card", style: "flex: 1; display: flex; flex-direction: column; gap: 15px;" }, [
    el("h3", { style: "display: flex; align-items: center; gap: 8px;" }, [
      el("i", { "data-lucide": "shield-check", style: "width: 20px; height: 20px; color: var(--pine-600);" }),
      el("span", {}, "KYC Identity Documents")
    ]),
    el("p", { class: "muted small" }, "Click any document below to inspect or zoom high-resolution specimens."),
    el("div", { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 10px;" }, [
      kycDocPreview("National ID Card", member.national_id, "id-card"),
      kycDocPreview("Passport Photo", `${member.first_name} ${member.last_name}`, "avatar"),
    ]),
    kycDocPreview("Signature Specimen", "Verified signature Specimen", "signature"),
  ]);

  const kycSplitScreen = el("div", { class: "grid grid-2", style: "margin-bottom: 20px;" }, [leftCol, rightCol]);

  const kinCard = el("div", { class: "card" }, [
    el("h3", {}, "Next of Kin / Beneficiaries"),
    member.next_of_kin?.length
      ? el("div", {}, member.next_of_kin.map((k) => el("div", { style: "padding:6px 0;border-bottom:1px solid var(--line)" }, [
          el("div", { style: "font-weight:600" }, k.full_name),
          el("div", { class: "muted small" }, `${titleCase(k.relationship_type)} \u00b7 ${k.phone_number}`),
        ])))
      : el("p", { class: "muted" }, "No next of kin recorded."),
  ]);

  const savingsCard = el("div", { class: "card" }, [
    el("h3", {}, "Savings Accounts"),
    dataTable(
      [
        { header: "Account", render: (a) => a.account_number },
        { header: "Balance", className: "ledger", render: (a) => `UGX ${formatMoney(a.balance)}` },
        { header: "Status", render: (a) => (a.is_active ? badge("active") : badge("closed")) },
      ],
      accounts, "No savings accounts."
    ),
  ]);

  const loansCard = el("div", { class: "card" }, [
    el("h3", {}, "Loans Summary"),
    dataTable(
      [
        { header: "Loan No.", render: (l) => l.loan_number },
        { header: "Requested", className: "ledger", render: (l) => `UGX ${formatMoney(l.amount_requested)}` },
        { header: "Status", render: (l) => badge(l.status) },
      ],
      loans, "No loan applications."
    ),
  ]);

  mount(root, [
    backBtn,
    approvalActions,
    header,
    kycSplitScreen,
    kinCard,
    savingsCard,
    loansCard
  ]);
  refreshIcons();
}

function infoRow(label, value) {
  return el("div", { style: "display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)" }, [
    el("span", { class: "muted" }, label),
    el("span", { style: "font-weight:600" }, value || "—"),
  ]);
}

// Render document thumbnail preview box with modern Lucide vectors
function kycDocPreview(label, desc, docType) {
  let docIconName = "file-text";
  let previewStyle = "background: #f1f3f2; border: 2px dashed #cbd2ce; height: 110px;";
  let contentEl = el("div", { style: "font-size: 11px; font-weight: bold; color: #4B554F; margin-top: 5px;" }, desc);
  
  if (docType === "id-card") {
    docIconName = "id-card";
    previewStyle = "background: linear-gradient(135deg, #eef2f3, #dfe6e9); border: 1px solid var(--pine-200); height: 110px;";
  } else if (docType === "avatar") {
    docIconName = "user-round";
    previewStyle = "background: #eef5f3; border: 1px solid var(--pine-200); height: 110px; border-radius: 50%; width: 110px; margin: 0 auto;";
  } else if (docType === "signature") {
    docIconName = "pen-tool";
    previewStyle = "background: #fff; border: 1px solid #ddd; height: 85px; font-family: 'Courier New', Courier, monospace; font-style: italic;";
    contentEl = el("div", { style: "font-size: 18px; color: #1e272e; transform: rotate(-3deg); margin-top: 5px;" }, desc);
  }

  const wrapper = el("div", {
    class: "kyc-preview-box",
    style: `display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 12px; cursor: pointer; text-align: center; border-radius: 6px; ${previewStyle}`,
    onclick: () => openKycDocZoom(label, desc, docType)
  }, [
    el("i", { "data-lucide": docIconName, style: "width: 28px; height: 28px; color: var(--pine-700);" }),
    el("div", { style: "font-weight: 600; font-size: 12px; margin-top: 6px;" }, label),
    contentEl
  ]);

  return wrapper;
}

// Modal zoom on clicked KYC document
function openKycDocZoom(label, desc, docType) {
  openModal(`KYC Viewer — ${label}`, (closeFn) => {
    let viewerEl;
    if (docType === "avatar") {
      viewerEl = el("div", { style: "text-align: center; padding: 20px;" }, [
        el("div", { style: "display: flex; align-items: center; justify-content: center; width: 160px; height: 160px; border-radius: 50%; background: var(--pine-100); margin: 0 auto;" }, [
          el("i", { "data-lucide": "user-round", style: "width: 80px; height: 80px; color: var(--pine-700);" })
        ]),
        el("h4", { style: "margin-top: 15px;" }, desc),
        el("p", { class: "muted" }, "Biometric Member Photograph specimen.")
      ]);
    } else if (docType === "signature") {
      viewerEl = el("div", { style: "padding: 30px; background: #fff; border: 1px solid #ccc; text-align: center;" }, [
        el("div", { style: "display: flex; align-items: center; justify-content: center; margin-bottom: 15px;" }, [
          el("i", { "data-lucide": "pen-tool", style: "width: 32px; height: 32px; color: #555;" })
        ]),
        el("div", { style: "font-family: 'Courier New', monospace; font-size: 36px; font-style: italic; font-weight: bold; transform: rotate(-3deg); color: #111;" }, desc),
        el("hr", { style: "margin: 30px 0; border: none; border-top: 2px solid #555;" }),
        el("p", { class: "muted" }, "Specimen Signature Specimen for transaction verifications.")
      ]);
    } else {
      viewerEl = el("div", { style: "padding: 20px; background: linear-gradient(135deg, #ffffff, #f1f5f4); border: 2px solid var(--pine-500); border-radius: 8px; box-shadow: var(--shadow);" }, [
        el("div", { style: "display: flex; justify-content: space-between; border-bottom: 2px solid var(--pine-600); padding-bottom: 8px;" }, [
          el("span", { style: "font-weight: bold; color: var(--pine-900);" }, "REPUBLIC OF UGANDA"),
          el("span", { style: "font-weight: bold; color: var(--pine-800);" }, "NATIONAL IDENTITY CARD")
        ]),
        el("div", { style: "display: flex; gap: 20px; margin-top: 15px; align-items: center;" }, [
          el("div", { style: "padding: 15px; background: #ddd; border-radius: 6px; display: flex; align-items: center; justify-content: center;" }, [
            el("i", { "data-lucide": "user-round", style: "width: 48px; height: 48px; color: #555;" })
          ]),
          el("div", { style: "font-size: 13px; line-height: 1.6;" }, [
            el("div", {}, `Document No: ${desc}`),
            el("div", {}, "Expiry Date: 30-JUN-2031"),
            el("div", {}, "Authority: National Identification and Registration Authority (NIRA)")
          ])
        ])
      ]);
    }

    // Refresh icons inside the newly opened modal context
    refreshIcons();

    return [
      viewerEl,
      el("div", { class: "modal-actions" }, [
        el("button", { class: "btn btn-secondary", onclick: closeFn }, "Close")
      ])
    ];
  });
}

// Approve Pending Registration
async function approveRegistration(root, member) {
  const ok = await confirmDialog(`Approve registration for ${member.first_name} ${member.last_name}?`, "Approve", false);
  if (!ok) return;
  try {
    await api.patch(`/api/v1/members/${member.id}`, { status: "active" });
    showToast("Registration approved successfully.", "success");
    await renderDetail(root, member.id);
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Reject Pending Registration
function rejectRegistration(root, member) {
  openModal("Reject Registration", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const reasonInput = el("textarea", { placeholder: "Specify the exact reason for rejection...", rows: 3, required: true });
    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Rejection Reason"), reasonInput]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-danger" }, "Confirm Rejection")
      ])
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post("/api/v1/risk/flags", {
          flag_type: "ghost_member",
          description: `Registration rejected for ${member.first_name} ${member.last_name}: ${reasonInput.value}`
        });
        await api.patch(`/api/v1/members/${member.id}`, { status: "exited" });
        showToast("Registration rejected.", "success");
        closeFn();
        state.selectedId = null;
        await renderMembers(root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });

    return [form];
  });
}

// Onboard member manually
function openCreateMemberModal(root) {
  openModal("Add member", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const form = el("form", {}, [
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "First name"), el("input", { id: "m-first", required: true })]),
        el("div", { class: "field" }, [el("label", {}, "Last name"), el("input", { id: "m-last", required: true })]),
      ]),
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", {}, "National ID"), el("input", { id: "m-nid", required: true })]),
        el("div", { class: "field" }, [el("label", {}, "Phone number"), el("input", { id: "m-phone", required: true })]),
      ]),
      el("div", { class: "field" }, [el("label", {}, "Email (optional)"), el("input", { id: "m-email", type: "email" })]),
      el("div", { class: "field" }, [el("label", {}, "Address (optional)"), el("input", { id: "m-address" })]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Create member"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.post("/api/v1/members", {
          first_name: form.querySelector("#m-first").value,
          last_name: form.querySelector("#m-last").value,
          national_id: form.querySelector("#m-nid").value,
          phone_number: form.querySelector("#m-phone").value,
          email: form.querySelector("#m-email").value || null,
          physical_address: form.querySelector("#m-address").value || null,
        });
        showToast("Member created.", "success");
        closeFn();
        renderMembers(root);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });

    return [form];
  });
}

// Bulk Upload Members via CSV (with Robust RFC 4180 compliant CSV parsing)
function openBulkUploadModal(root) {
  openModal("Bulk Onboard Members via CSV", (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const fileInput = el("input", { type: "file", accept: ".csv", required: true });
    const progressEl = el("p", { class: "muted small", hidden: true });
    
    const form = el("form", {}, [
      el("p", { class: "muted" }, "Select a CSV file containing columns: First Name, Last Name, National ID, Phone, Email (optional), Physical Address (optional)."),
      el("div", { class: "field" }, [el("label", {}, "Upload CSV File"), fileInput]),
      progressEl,
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Start Upload")
      ])
    ]);

    // Robust CSV line parser supporting quoted fields with commas
    function parseCSVLine(text) {
      const result = [];
      let start = 0;
      let inQuotes = false;
      
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(cleanValue(text.substring(start, i)));
          start = i + 1;
        }
      }
      result.push(cleanValue(text.substring(start)));
      return result;
    }

    function cleanValue(val) {
      val = val.trim();
      // Remove surrounding quotes if they exist
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
      }
      return val.replace(/""/g, '"').trim() || null;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      const file = fileInput.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target.result;
        progressEl.hidden = false;
        progressEl.textContent = "Parsing CSV lines...";
        
        try {
          const lines = text.split(/\r?\n/);
          let uploaded = 0;
          let failed = 0;
          
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = parseCSVLine(line);
            
            if (parts.length >= 4 && parts[0] && parts[1] && parts[2] && parts[3]) {
              const [first, last, nid, phone, email, address] = parts;
              try {
                await api.post("/api/v1/members", {
                  first_name: first,
                  last_name: last,
                  national_id: nid,
                  phone_number: phone,
                  email: email || null,
                  physical_address: address || null
                });
                uploaded++;
              } catch (e) {
                console.error(`Bulk upload error at line ${i + 1}:`, e);
                failed++;
              }
              progressEl.textContent = `Uploading: ${uploaded} succeeded, ${failed} failed...`;
            } else {
              console.warn(`Skipped invalid line ${i + 1} (missing required columns):`, line);
              failed++;
            }
          }
          
          showToast(`Bulk Onboarding complete. ${uploaded} onboarded, ${failed} failed.`, "success");
          closeFn();
          await renderMembers(root);
        } catch (err) {
          errorEl.textContent = "Failed to parse CSV file: " + err.message;
          errorEl.hidden = false;
        }
      };
      reader.readAsText(file);
    });

    return [form];
  });
}

// Edit Member & Freeze/Suspend/Reactivate status management
function openEditMemberModal(root, member) {
  openModal(`Manage Status — ${member.first_name} ${member.last_name}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    const phoneInput = el("input", { id: "e-phone", value: member.phone_number });
    const emailInput = el("input", { id: "e-email", type: "email", value: member.email || "" });
    const addressInput = el("input", { id: "e-address", value: member.physical_address || "" });
    const statusSelect = el(
      "select", { id: "e-status" },
      ["active", "dormant", "suspended", "exited"].map((s) => 
        el("option", { value: s, selected: s === member.status }, 
          s === "suspended" ? "Suspended (Freeze Account)" : titleCase(s)
        )
      )
    );

    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Phone number"), phoneInput]),
      el("div", { class: "field" }, [el("label", {}, "Email"), emailInput]),
      el("div", { class: "field" }, [el("label", {}, "Address"), addressInput]),
      el("div", { class: "field" }, [
        el("label", {}, "Account Status Configuration"),
        statusSelect,
        el("div", { class: "field-hint" }, "Setting status to 'Suspended' freezes savings payouts, share transfers, and loan disbursements immediately.")
      ]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Save changes"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await api.patch(`/api/v1/members/${member.id}`, {
          phone_number: phoneInput.value,
          email: emailInput.value || null,
          physical_address: addressInput.value || null,
          status: statusSelect.value,
        });
        showToast("Member status updated.", "success");
        closeFn();
        renderDetail(root, member.id);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });

    return [form];
  });
}

// Redirect or trigger Share reallocation/transfer modal directly
function openShareReallocation(root, member, holdings) {
  openModal(`Share Reallocation — ${member.first_name} ${member.last_name}`, (closeFn) => {
    const errorEl = el("p", { class: "form-error", hidden: true });
    let counterparty = null;

    const sharesInput = el("input", { id: "sr-shares", type: "number", required: true, min: "1", placeholder: "Shares to transfer" });
    const productSelect = el("select", {}, holdings.map(h => el("option", { value: h.product_id || "default" }, `Shares Class (${h.number_of_shares} owned)`)));
    
    const picker = memberPicker(
      (q) => api.get(`/api/v1/members?q=${encodeURIComponent(q)}`).then((r) => r.items),
      (m) => { counterparty = m; }
    );

    const form = el("form", {}, [
      el("div", { class: "field" }, [el("label", {}, "Select Shares Class"), productSelect]),
      el("div", { class: "field" }, [el("label", {}, "Number of Shares to Transfer"), sharesInput]),
      el("div", { class: "field" }, [el("label", {}, "Counterparty Recipient Member"), picker]),
      errorEl,
      el("div", { class: "modal-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", onclick: closeFn }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, "Execute Reallocation")
      ])
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      if (!counterparty) { errorEl.textContent = "Select a recipient member first."; errorEl.hidden = false; return; }
      try {
        const prodId = productSelect.value === "default" ? "default" : productSelect.value;
        await api.post(`/api/v1/shares/members/${member.id}/products/${prodId}/transactions`, {
          txn_type: "transfer",
          number_of_shares: Number(sharesInput.value),
          counterparty_member_id: counterparty.id
        });
        showToast("Shares reallocated successfully.", "success");
        closeFn();
        renderDetail(root, member.id);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });

    return [form];
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}


// js/views/members.js
export default class MembersView {
  constructor() {
    this.container = document.getElementById('main-content');
  }

  render() {
    this.parseRouteQuery();
  }

  parseRouteQuery() {
    const searchParams = new URLSearchParams(window.location.hash.includes('?') 
      ? window.location.hash.split('?')[1] 
      : window.location.search
    );
    
    const searchQuery = searchParams.get('search');
    
    if (searchQuery) {
      this.executeMemberFilter(decodeURIComponent(searchQuery));
    }
  }

  executeMemberFilter(query) {
    const tableSearchInput = document.getElementById('table-filter-input'); 
    
    if (tableSearchInput) {
      tableSearchInput.value = query;
      tableSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      console.log(`Filtering member data source for: ${query}`);
    }
  }
}