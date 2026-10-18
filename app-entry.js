(function () {
  const page = window.location;
  const gameHost = page.hostname === "game.playcrownlands.com";
  const legacyHost = gameHost || page.hostname === "crownland.netlify.app";
  const publicEntry = ["/", "/index.html", "/home.html"].includes(page.pathname);
  const gameEntry = /^\/play(?:\/index\.html|\/)?$/.test(page.pathname);
  const installed = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (!legacyHost && !(installed && publicEntry)) return;
  if (!publicEntry && !gameEntry) return;
  const target = new URL(gameHost || installed || gameEntry || page.pathname === "/index.html" ? "/play/" : "/", legacyHost ? "https://playcrownlands.com" : page.origin);
  target.search = page.search;
  target.hash = page.hash;
  page.replace(target.href);
})();
