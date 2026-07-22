// Placeholder until full system health view is built
import { el, mount } from "../utils.js";

export async function renderSystem(root) {
  mount(root, el("div", { class: "card" }, [
    el("h3", {}, "System Health"),
    el("p", { class: "muted" }, "Live API telemetry, latency, and uptime monitoring."),
  ]));
}
