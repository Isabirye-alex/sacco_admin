import { el, mount, refreshIcons } from "../utils.js";
import { KeyValueGrid } from "../ui.js";
import { API_BASE_URL } from "../config.js";

export async function renderSystem(root) {
  const pageLoadTime = Date.now();
  const container = el("div", {});

  const healthSection = el("div", { class: "card", style: "margin-bottom: 20px;" }, [
    el("h3", {}, "API Health & Latency"),
    el("div", { class: "spinner", style: "margin: 16px 0;" }),
  ]);

  const uptimeSection = el("div", { class: "card", style: "margin-bottom: 20px;" }, [
    el("h3", {}, "Session Uptime"),
    el("p", { class: "muted" }, "Tracking session uptime since page load."),
    el("div", { id: "uptime-display", class: "ledger", style: "font-size: 18px; margin-top: 8px;" }, "—"),
  ]);

  const metricsSection = el("div", { class: "card" }, [
    el("h3", {}, "Client Metrics"),
    el("div", { id: "client-metrics" }),
  ]);

  container.appendChild(healthSection);
  container.appendChild(uptimeSection);
  container.appendChild(metricsSection);
  mount(root, container);
  refreshIcons(root);

  await runHealthCheck(healthSection);
  startUptimeTicker(pageLoadTime);
  renderClientMetrics();
}

async function runHealthCheck(healthSection) {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { method: "GET", cache: "no-store" });
    const rtt = Math.round(performance.now() - start);
    const ok = res.ok;
    const body = await res.text();
    mount(healthSection, [
      el("div", { style: "display: flex; align-items: center; gap: 10px; margin-bottom: 10px;" }, [
        el("span", { style: `width: 10px; height: 10px; border-radius: 50%; background: ${ok ? "var(--success)" : "var(--danger)"};` }),
        el("span", {}, ok ? "API is reachable" : "API unreachable"),
      ]),
      el("div", { style: "display: flex; justify-content: space-between; padding: 6px 0;" }, [
        el("span", { class: "muted" }, "Round-trip time"),
        el("span", { class: "ledger" }, `${rtt} ms`),
      ]),
      ok ? el("div", { class: "muted small" }, body || "OK") : el("div", { class: "form-error" }, "Check network or API status."),
    ]);
  } catch (err) {
    mount(healthSection, [
      el("div", { style: "display: flex; align-items: center; gap: 10px; margin-bottom: 10px;" }, [
        el("span", { style: "width: 10px; height: 10px; border-radius: 50%; background: var(--danger);" }),
        el("span", { class: "form-error" }, "Network error"),
      ]),
      el("div", { class: "muted small" }, err.message),
    ]);
  }
}

function startUptimeTicker(start) {
  const display = document.getElementById("uptime-display");
  const tick = () => {
    if (!display) return;
    const diff = Date.now() - start;
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    display.textContent = `${mins}m ${secs}s`;
  };
  tick();
  setInterval(tick, 1000);
}

function renderClientMetrics() {
  const section = document.getElementById("client-metrics");
  if (!section) return;
  const items = [
    { label: "User agent", value: navigator.userAgent },
    { label: "Platform", value: navigator.platform },
    { label: "Language", value: navigator.language },
    { label: "Cookies enabled", value: navigator.cookieEnabled ? "Yes" : "No" },
    { label: "LocalStorage available", value: (() => { try { localStorage.setItem("__test", "1"); localStorage.removeItem("__test"); return "Yes"; } catch { return "No"; } })() },
    { label: "Screen resolution", value: `${screen.width} × ${screen.height}` },
    { label: "Viewport size", value: `${window.innerWidth} × ${window.innerHeight}` },
    { label: "Timezone", value: Intl.DateTimeFormat().resolvedOptions().timeZone },
  ];
  mount(section, KeyValueGrid({ items }));
}
