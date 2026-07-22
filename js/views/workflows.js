// Placeholder workflow view
import { el, mount } from "../utils.js";

export async function renderWorkflows(root) {
  mount(root, el("div", { class: "card" }, [
    el("h3", {}, "Approvals"),
    el("p", { class: "muted" }, "Cross-module approval queue (loans, KYC, write-offs, journal entries)."),
  ]));
}
