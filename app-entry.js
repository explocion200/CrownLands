(function () {
  const { location } = window;
  const legacyHost = ["game.playcrownlands.com", "crownland.netlify.app"].includes(location.hostname);
  const publicEntry = ["/", "/index.html", "/home.html"].includes(location.pathname);
  const gameEntry = /^\/play(?:\/index\.html|\/)?$/.test(location.pathname);
  const installed = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (!legacyHost && !(installed && publicEntry)) return;
  if (!publicEntry && !gameEntry) return;
  const target = new URL(installed || gameEntry || location.pathname === "/index.html" ? "/play/" : "/", legacyHost ? "https://playcrownlands.com" : location.origin);
  target.search = location.search;
  target.hash = location.hash;
  location.replace(target.href);
})();
