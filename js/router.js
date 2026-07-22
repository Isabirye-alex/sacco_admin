import { isAuthenticated } from "./auth.js";
import { el, mount, showToast, refreshIcons } from "./utils.js";

const routes = {}; // path -> { title, render(root, query) }

export function registerRoute(path, title, render) {
  routes[path] = { title, render };
}

function parseHash() {
  const raw = window.location.hash.replace(/^#/, "") || "/dashboard";
  const [path, query = ""] = raw.split("?");
  return { path: path || "/dashboard", query: new URLSearchParams(query) };
}

async function renderRoute() {
  const { path, query } = parseHash();
  const authed = isAuthenticated();

  const loginScreen = document.getElementById("login-screen");
  const appShell = document.getElementById("app-shell");

  if (!authed) {
    loginScreen.hidden = false;
    appShell.hidden = true;
    document.getElementById("view-root").innerHTML = "";
    return;
  }

  loginScreen.hidden = true;
  appShell.hidden = false;

  const match = routes[path] || routes["/dashboard"];
  document.getElementById("page-title").textContent = match.title;

  document.querySelectorAll("#nav-links a").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === `#${path}`);
  });

  const root = document.getElementById("view-root");
  mount(root, el("div", { class: "spinner" }));

  try {
    await match.render(root, query);
    refreshIcons(root);
  } catch (err) {
    console.error(err);
    mount(
      root,
      el("div", { class: "card" }, [
        el("h3", {}, "Something went wrong loading this page"),
        el("p", { class: "muted" }, err.message || "Please try again."),
      ])
    );
    showToast(err.message || "Failed to load page.", "error");
  }

  document.querySelector(".sidebar")?.classList.remove("open");
  // Scroll to top on route change
  window.scrollTo({ top: 0, behavior: "instant" });
}

export function startRouter() {
  window.addEventListener("hashchange", renderRoute);
  renderRoute();
}

export function goTo(path) {
  window.location.hash = `#${path}`;
}

export function refreshCurrentRoute() {
  renderRoute();
}
