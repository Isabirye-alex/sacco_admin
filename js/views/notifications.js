import { api } from "../api.js";
import { el, mount, formatDateTime, titleCase, badge, dataTable, showToast, memberPicker } from "../utils.js";

export async function renderNotifications(root) {
  let selectedMember = null;
  const errorEl = el("p", { class: "form-error", hidden: true });
  const historyHolder = el("div", { style: "margin-top:20px" });

  const picker = memberPicker(
    (q) => api.get(`/api/v1/members?q=${encodeURIComponent(q)}`).then((r) => r.items),
    async (m) => {
      selectedMember = m;
      if (!m) { mount(historyHolder, []); return; }
      const history = await api.get(`/api/v1/notifications/members/${m.id}`);
      mount(historyHolder, el("div", { class: "card" }, [
        el("h3", {}, `Notification history \u2014 ${m.first_name} ${m.last_name}`),
        dataTable(
          [
            { header: "Date", render: (n) => formatDateTime(n.created_at) },
            { header: "Channel", render: (n) => titleCase(n.channel) },
            { header: "Subject", render: (n) => n.subject || titleCase(n.event_type) || "\u2014" },
            { header: "Status", render: (n) => badge(n.status) },
          ],
          history, "No notifications sent to this member yet."
        ),
      ]));
    }
  );

  const channelSelect = el("select", { id: "n-channel" }, [
    el("option", { value: "email" }, "Email"),
    el("option", { value: "sms" }, "SMS"),
    el("option", { value: "push" }, "Push"),
  ]);
  const subjectInput = el("input", { id: "n-subject" });
  const bodyInput = el("textarea", { id: "n-body", rows: 4, required: true });

  const form = el("form", {}, [
    el("div", { class: "field" }, [el("label", {}, "Recipient member"), picker]),
    el("div", { class: "field" }, [el("label", {}, "Channel"), channelSelect]),
    el("div", { class: "field" }, [el("label", {}, "Subject (optional)"), subjectInput]),
    el("div", { class: "field" }, [el("label", {}, "Message"), bodyInput]),
    errorEl,
    el("button", { type: "submit", class: "btn btn-primary" }, "Send notification"),
  ]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    if (!selectedMember) { errorEl.textContent = "Select a recipient first."; errorEl.hidden = false; return; }
    try {
      await api.post("/api/v1/notifications", {
        member_id: selectedMember.id,
        channel: channelSelect.value,
        subject: subjectInput.value || null,
        body: bodyInput.value,
      });
      showToast("Notification queued.", "success");
      bodyInput.value = "";
      subjectInput.value = "";
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  mount(root, [
    el("div", { class: "card" }, [el("h3", {}, "Send a notification"), form]),
    historyHolder,
  ]);
}
