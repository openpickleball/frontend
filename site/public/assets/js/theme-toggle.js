// Theme toggle: flips whichever theme is showing and remembers the choice.
(function () {
  var button = document.getElementById("theme-toggle");
  if (!button) return;
  var html = document.documentElement;
  var system = window.matchMedia("(prefers-color-scheme: light)");
  function current() {
    return html.dataset.theme || (system.matches ? "light" : "dark");
  }
  function label() {
    button.setAttribute("aria-label", current() === "light" ? "Switch to dark theme" : "Switch to light theme");
  }
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  button.addEventListener("click", function () {
    var next = current() === "light" ? "dark" : "light";
    // Crossfade the whole page where view transitions exist. Reduced motion switches at once.
    if (document.startViewTransition && !reduce.matches && document.visibilityState === "visible") {
      // A skipped transition still applies the theme. Don't log it.
      document
        .startViewTransition(function () {
          apply(next);
        })
        .ready.catch(function () {});
    } else {
      apply(next);
    }
  });
  function apply(next) {
    html.dataset.theme = next;
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
      meta.content = next === "light" ? "#f7f3e8" : "#000000";
    });
    try {
      localStorage.setItem("theme", next);
    } catch (e) {}
    label();
  }
  system.addEventListener("change", label);
  label();
})();
