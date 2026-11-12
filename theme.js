// Light/dark toggle.  Loaded in <head> so the saved choice applies before first
// paint; without a saved choice the page follows the system setting.
(function () {
  const root = document.documentElement;
  const dark = matchMedia("(prefers-color-scheme: dark)");
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) {}
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;

  const isDark = () => (root.dataset.theme || (dark.matches ? "dark" : "light")) === "dark";

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.createElement("button");
    btn.className = "theme-toggle";
    const sync = () => {
      btn.textContent = isDark() ? "☀" : "☾";
      btn.setAttribute("aria-label", isDark() ? "Switch to light mode" : "Switch to dark mode");
      btn.title = btn.getAttribute("aria-label");
    };
    btn.addEventListener("click", () => {
      root.dataset.theme = isDark() ? "light" : "dark";
      try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
      sync();
    });
    dark.addEventListener("change", sync);
    sync();
    document.body.append(btn);
  });
})();
