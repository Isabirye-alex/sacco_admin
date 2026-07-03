import { isAuthenticated } from "./auth.js";
import { el, mount, showToast } from "./utils.js";

const routes = {}; // path -> { title, render(root) }

export function registerRoute(path, title, render) {
  routes[path] = { title, render };
}

function parseHash() {
  const hash = window.location.hash.replace(/^#/, "") || "/dashboard";
  return hash.split("?")[0];
}

async function renderRoute() {
  const path = parseHash();
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
    await match.render(root);
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
