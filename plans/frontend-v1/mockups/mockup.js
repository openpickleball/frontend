/*
  OPEN player app mockups: shared script. Mockup plumbing only, not app code.

  - Applies the stored theme before first paint (load this file in <head>, not deferred),
    the same way site/public/index.html does, and wires every .theme-toggle.
  - Draws the app shell (top bar, side nav, bottom tab bar) from <body data-page>.
  - Switches mockup states: the URL hash picks a state, and elements with data-show="a b"
    only show in those states. The dashed bar at the top links to every state.
  - Renders match rows from the made-up data below.

  All names, codes, emails and scores are invented. Scores obey the backend rules: no ties, the
  winner reaches the target, wins by 2, and a game past the target ends exactly 2 ahead.
*/

(function () {
  try {
    var theme = localStorage.getItem("theme");
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  } catch (e) {}
})();

var OPEN = (function () {
  var YOU = { code: "P-4RWN-8TQ2", name: "Tamsin Vale" };
  var P = {
    oren: { code: "P-9HJD-3XKA", name: "Oren Quill" },
    bea: { code: "P-M2CF-7YPE", name: "Bea Marlowe" },
    kit: { code: "P-T6BZ-0NQR", name: "Kit Ashdown" },
    rosa: { code: "P-5XEG-K8MW", name: "Rosa Fenwick" },
    idris: { code: "P-A7VH-2DSC", name: "Idris Coldwell" },
    nell: { code: "P-G3QY-6JZB", name: "Nell Brightwater" },
    saul: { code: "P-W8KN-4FTH", name: "Saul Pemberly" },
    priv: { code: null, name: "Private player" },
  };

  // Shape follows MatchOut. `needs_me` is NOT in MatchOut today; see README "Backend gaps".
  var MATCHES = [
    { code: "M-7QK2-H9WD-3NFA", status: "pending", needs_me: true, format: "doubles", played_on: "2026-11-14", best_of: 3, game_target: 11, scoring_type: "side_out", team_a: [YOU, P.oren], team_b: [P.bea, P.kit], games: [[11, 7], [9, 11], [11, 4]] },
    { code: "M-3FTB-8ZRM-K6PE", status: "pending", needs_me: true, format: "singles", played_on: "2026-11-12", best_of: 3, game_target: 11, scoring_type: "side_out", team_a: [YOU], team_b: [P.rosa], games: [[8, 11], [11, 6], [12, 10]] },
    { code: "M-X4NC-2GHJ-9VQT", status: "pending", needs_me: false, format: "doubles", played_on: "2026-11-10", best_of: 3, game_target: 11, scoring_type: "side_out", team_a: [YOU, P.nell], team_b: [P.saul, P.idris], games: [[11, 13], [7, 11]] },
    { code: "M-D9PW-5KXE-7RMB", status: "confirmed", format: "doubles", played_on: "2026-11-08", best_of: 1, game_target: 15, scoring_type: "rally", team_a: [YOU, P.nell], team_b: [P.idris, P.saul], games: [[13, 15]] },
    { code: "M-H2ZA-6TQN-4CJY", status: "confirmed", format: "doubles", played_on: "2026-11-07", best_of: 3, game_target: 11, scoring_type: "side_out", team_a: [YOU, P.oren], team_b: [P.rosa, P.idris], games: [[11, 5], [11, 8]] },
    { code: "M-R5GK-9WBD-2XFP", status: "disputed", format: "doubles", played_on: "2026-11-03", best_of: 3, game_target: 11, scoring_type: "side_out", team_a: [YOU, P.kit], team_b: [P.bea, P.priv], games: [[11, 9], [6, 11], [11, 13]] },
    { code: "M-6YEM-3HNV-8QTA", status: "confirmed", format: "singles", played_on: "2026-11-01", best_of: 1, game_target: 11, scoring_type: "side_out", team_a: [YOU], team_b: [P.saul], games: [[11, 3]] },
    { code: "M-B8TS-4PCX-1JWG", status: "voided", format: "doubles", played_on: "2026-10-30", best_of: 3, game_target: 11, scoring_type: "side_out", team_a: [YOU, P.bea], team_b: [P.kit, P.oren], games: [[11, 6], [11, 9]] },
    { code: "M-N3QH-7DFR-5KZE", status: "confirmed", format: "doubles", played_on: "2026-10-27", best_of: 1, game_target: 21, scoring_type: "rally", team_a: [YOU, P.bea], team_b: [P.oren, P.nell], games: [[21, 19]] },
    { code: "M-F7JC-2VWA-9HMN", status: "confirmed", format: "doubles", played_on: "2026-10-25", best_of: 3, game_target: 11, scoring_type: "side_out", team_a: [P.rosa, YOU], team_b: [P.idris, P.kit], games: [[4, 11], [11, 7], [11, 9]] },
  ];

  // Older matches for the history pages, built from the ones above with new codes and dates.
  var ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U
  function fakeCode(seed) {
    var s = "";
    for (var i = 0; i < 12; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      s += ALPHABET[seed % 32];
    }
    return "M-" + s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8, 12);
  }
  var ALL = MATCHES.slice();
  var day = new Date("2026-10-25T12:00:00");
  for (var i = 0; ALL.length < 47; i++) {
    var base = MATCHES[3 + (i % 7)];
    day = new Date(day.getTime() - (2 + (i % 3)) * 864e5);
    var m = Object.assign({}, base, {
      code: fakeCode(i + 7),
      status: base.status === "voided" && i > 4 ? "confirmed" : base.status === "pending" ? "confirmed" : base.status,
      played_on: day.toISOString().slice(0, 10),
      needs_me: false,
    });
    if (m.status === "disputed" && i > 3) m.status = "confirmed";
    ALL.push(m);
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fmtDate(iso, long) {
    var d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-GB", long ? { weekday: "long", day: "numeric", month: "long", year: "numeric" } : { weekday: "short", day: "numeric", month: "short" });
  }
  function teamName(team) {
    return team
      .map(function (p) {
        return p === YOU ? "You" : p.name;
      })
      .join(" & ");
  }
  function winner(m) {
    var a = 0,
      b = 0;
    m.games.forEach(function (g) {
      g[0] > g[1] ? a++ : b++;
    });
    return a > b ? "a" : "b";
  }
  var STATUS = { pending: "Pending", confirmed: "Confirmed", disputed: "Disputed", voided: "Voided" };
  function badge(status) {
    return '<span class="badge badge--' + status + '">' + STATUS[status] + "</span>";
  }
  function scores(m, side) {
    return m.games
      .map(function (g) {
        var mine = side === "a" ? g[0] : g[1];
        var theirs = side === "a" ? g[1] : g[0];
        return '<span class="' + (mine > theirs ? "won" : "") + '">' + mine + "</span>";
      })
      .join("");
  }
  // MatchRow: one match in a list. Maps to a MatchRow.svelte component.
  function matchRow(m, opts) {
    opts = opts || {};
    var w = winner(m);
    var href = "match.html#" + (m.status === "voided" ? "confirmed" : m.status);
    var gamesWord = m.games.length === 1 ? "1 game" : m.games.length + " games";
    var sr =
      fmtDate(m.played_on, true) + ", " + m.format + ". " + teamName(m.team_a) + " " + m.games.map(function (g) { return g[0] + "–" + g[1]; }).join(", ") + " against " + teamName(m.team_b) + ". " + (w === "a" ? teamName(m.team_a) : teamName(m.team_b)) + " won. Status " + STATUS[m.status] + ".";
    var html =
      '<a class="match-row" data-status="' + m.status + '" href="' + href + '" aria-label="' + esc(sr) + '">' +
      '<div class="match-row-meta"><span>' + fmtDate(m.played_on) + " · " + (m.format === "singles" ? "Singles" : "Doubles") + ", " + gamesWord + "</span>" + badge(m.status) + "</div>" +
      '<div class="score-grid" aria-hidden="true">' +
      '<span class="team' + (w === "a" ? " is-winner" : "") + '">' + esc(teamName(m.team_a)) + '</span><span class="scores">' + scores(m, "a") + "</span>" +
      '<span class="team' + (w === "b" ? " is-winner" : "") + '">' + esc(teamName(m.team_b)) + '</span><span class="scores">' + scores(m, "b") + "</span>" +
      "</div>" +
      (m.status === "voided" ? '<p class="voided-note">Voided. This result was withdrawn and does not count.</p>' : "") +
      "</a>";
    if (opts.actions) {
      html +=
        '<div class="row-actions"><button type="button" class="btn btn--primary btn--sm" data-toast="Confirmed. Thanks for checking the score.">Confirm</button>' +
        '<a class="btn btn--outline btn--sm" href="match.html#pending">Review</a></div>';
    }
    return "<li>" + html + "</li>";
  }

  // ---------- Shell ----------

  var ICONS = {
    home: '<path d="M4 10.5 12 4l8 6.5V20h-5.5v-6h-5v6H4Z"/>',
    record: '<circle cx="12" cy="12" r="8.25"/><path d="M12 8.5v7M8.5 12h7"/>',
    history: '<path d="M4 6.5h16M4 12h16M4 17.5h10"/>',
    profile: '<circle cx="12" cy="8.5" r="3.75"/><path d="M4.75 20c.8-3.6 3.7-5.75 7.25-5.75S18.45 16.4 19.25 20"/>',
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
  }
  var TOGGLE =
    '<button type="button" class="theme-toggle" aria-label="Switch theme">' +
    '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.25"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>' +
    '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>' +
    "</button>";
  var NAV = [
    ["home", "Home", "home.html"],
    ["record", "Record", "record.html"],
    ["history", "Matches", "history.html"],
    ["profile", "Profile", "profile.html"],
  ];
  var WORDMARK = '<a class="wordmark" href="home.html"><span class="mark" aria-hidden="true"></span>OPEN</a>';

  function drawShell() {
    var page = document.body.dataset.page;
    var main = document.querySelector("main");
    if (!page || !main || page === "auth" || page === "index") return;
    var cur = function (k) {
      return k === page ? ' aria-current="page"' : "";
    };
    var side =
      '<aside class="sidenav">' + WORDMARK +
      '<nav aria-label="Main"><ul>' +
      NAV.map(function (n) {
        return '<li><a href="' + n[2] + '"' + cur(n[0]) + ">" + icon(n[0], "nav-icon") + (n[0] === "record" ? "Record a match" : n[1]) + "</a></li>";
      }).join("") +
      "</ul></nav>" +
      '<div class="sidenav-foot"><span>Theme</span>' + TOGGLE + "</div></aside>";
    var top = '<header class="topbar">' + WORDMARK + TOGGLE + "</header>";
    var tabs =
      '<nav class="tabbar" aria-label="Main">' +
      NAV.map(function (n) {
        return '<a href="' + n[2] + '"' + cur(n[0]) + ">" + icon(n[0]) + n[1] + "</a>";
      }).join("") +
      "</nav>";
    var shell = document.createElement("div");
    shell.className = "shell";
    main.parentNode.insertBefore(shell, main);
    shell.insertAdjacentHTML("beforeend", side);
    var col = document.createElement("div");
    shell.appendChild(col);
    col.insertAdjacentHTML("beforeend", top);
    col.appendChild(main);
    document.body.insertAdjacentHTML("beforeend", tabs);
  }

  // ---------- Theme ----------

  function wireTheme() {
    var html = document.documentElement;
    var system = window.matchMedia("(prefers-color-scheme: light)");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    function current() {
      return html.dataset.theme || (system.matches ? "light" : "dark");
    }
    function label() {
      document.querySelectorAll(".theme-toggle").forEach(function (b) {
        b.setAttribute("aria-label", current() === "light" ? "Switch to dark theme" : "Switch to light theme");
      });
    }
    function apply(next) {
      html.dataset.theme = next;
      try {
        localStorage.setItem("theme", next);
      } catch (e) {}
      label();
    }
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".theme-toggle")) return;
      var next = current() === "light" ? "dark" : "light";
      if (document.startViewTransition && !reduce.matches) {
        document.startViewTransition(function () { apply(next); }).ready.catch(function () {});
      } else apply(next);
    });
    system.addEventListener("change", label);
    label();
  }

  // ---------- States ----------

  function wireStates() {
    var bar = document.querySelector(".mock-bar");
    var states = bar ? Array.prototype.map.call(bar.querySelectorAll("a[href^='#']"), function (a) { return a.getAttribute("href").slice(1); }) : [];
    function show() {
      var s = location.hash.slice(1);
      if (states.indexOf(s) < 0) s = states[0] || "";
      document.body.dataset.state = s;
      document.querySelectorAll("[data-show]").forEach(function (el) {
        el.hidden = el.dataset.show.split(" ").indexOf(s) < 0;
      });
      if (bar)
        bar.querySelectorAll("a[href^='#']").forEach(function (a) {
          a.setAttribute("aria-current", a.getAttribute("href") === "#" + s ? "true" : "false");
        });
      document.dispatchEvent(new CustomEvent("mockstate", { detail: s }));
    }
    window.addEventListener("hashchange", show);
    show();
  }

  // ---------- Toast ----------

  function toast(text, action) {
    var region = document.querySelector(".toast-region");
    if (!region) {
      region = document.createElement("div");
      region.className = "toast-region";
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      document.body.appendChild(region);
    }
    region.innerHTML = '<div class="toast"><span>' + esc(text) + "</span>" + (action || "") + "</div>";
    clearTimeout(toast.t);
    if (!action) toast.t = setTimeout(function () { region.innerHTML = ""; }, 4000);
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-toast]");
    if (t) toast(t.dataset.toast);
  });

  document.addEventListener("DOMContentLoaded", function () {
    drawShell();
    wireTheme();
    document.querySelectorAll("[data-matches]").forEach(function (ul) {
      var kind = ul.dataset.matches;
      var list = kind === "needs-me" ? MATCHES.filter(function (m) { return m.needs_me; }) : kind === "recent" ? MATCHES.filter(function (m) { return !m.needs_me; }).slice(0, 5) : ALL;
      var page = Number(ul.dataset.page || 1);
      if (kind === "all") list = list.slice((page - 1) * 20, page * 20);
      ul.innerHTML = list.map(function (m) { return matchRow(m, { actions: kind === "needs-me" }); }).join("");
    });
    wireStates();
  });

  return { YOU: YOU, MATCHES: MATCHES, ALL: ALL, toast: toast, fmtDate: fmtDate };
})();
