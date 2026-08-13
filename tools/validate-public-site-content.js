const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const publicPages = [
  "home.html",
  "guides.html",
  "updates.html",
  "about.html",
  "how-to-play.html",
  "battle-economy-guide.html",
  "battle-reports-guide.html",
  "scouting-guide.html",
  "skills-presets-guide.html",
  "clans-rallies-guide.html",
  "objectives-guide.html",
  "daily-rewards-guide.html",
  "game-rules.html",
  "support.html",
  "privacy.html",
  "terms.html",
];
const requiredNavigation = [
  "/guides.html",
  "/updates.html",
  "/play/",
  "/game-rules.html",
  "/support.html",
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function visibleWordCount(source) {
  return source
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

const indexSource = read("index.html");
const homeSource = read("home.html");
const stylesSource = read("site-info.css");
const robotsSource = read("robots.txt");
const sitemapSource = read("sitemap.xml");
const serviceWorkerSource = read("service-worker.js");
const netlifySource = read("netlify.toml");
const manifestSource = read("manifest.webmanifest");

assert.match(indexSource, /name="google-adsense-account"\s+content="ca-pub-6031755025291372"/);
assert.doesNotMatch(indexSource, /adsbygoogle|loginDisplayAd|login-display-ad/);
assert.match(indexSource, /class="login-game-info"/);
assert.match(indexSource, /Build a kingdom across living islands/);
assert.match(indexSource, /name="robots" content="noindex, nofollow"/);
assert.match(indexSource, /rel="canonical" href="https:\/\/playcrownlands\.com\/play\/"/);
assert.match(homeSource, /rel="canonical" href="https:\/\/playcrownlands\.com\/"/);
assert.match(homeSource, /application\/ld\+json/);
assert.match(homeSource, /data-kingdom-planner/);
for (const href of requiredNavigation) {
  assert.match(homeSource, new RegExp(`href="${href.replaceAll(".", "\\.")}"`), `Homepage does not link to ${href}.`);
}

for (const page of publicPages) {
  const source = read(page);
  assert.match(source, /<title>[^<]{12,}<\/title>/, `${page} needs a descriptive title.`);
  assert.match(source, /<meta name="description" content="[^"]{50,}"/, `${page} needs a substantive description.`);
  assert.match(source, /name="google-adsense-account"\s+content="ca-pub-6031755025291372"/, `${page} needs the non-serving verification tag.`);
  assert.match(source, /rel="canonical"\s+href="https:\/\/playcrownlands\.com\//, `${page} needs a canonical URL.`);
  assert.match(source, /href="\/site-info\.css\?v=[^"]+"/, `${page} must use the public content stylesheet.`);
  assert.doesNotMatch(source, /adsbygoogle|securepubads\.g\.doubleclick\.net|googletag/, `${page} must not request Google-served ads.`);
  assert.ok(visibleWordCount(source) >= 180, `${page} needs at least 180 visible words of original content.`);
}

assert.match(stylesSource, /\.site-header/);
assert.match(stylesSource, /\.site-hero/);
assert.match(stylesSource, /@media \(max-width:\s*760px\)/);
assert.match(robotsSource, /User-agent:\s*\*/);
assert.match(robotsSource, /Allow:\s*\//);
assert.match(robotsSource, /Sitemap:\s*https:\/\/playcrownlands\.com\/sitemap\.xml/);
for (const page of ["/", ...publicPages.filter(page => page !== "home.html").map(page => `/${page}`)]) {
  assert.match(sitemapSource, new RegExp(`<loc>https://playcrownlands\\.com${page.replaceAll(".", "\\.")}</loc>`));
}
const staticCacheSource = serviceWorkerSource.slice(
  serviceWorkerSource.indexOf("const STATIC_CACHE_URLS"),
  serviceWorkerSource.indexOf("];", serviceWorkerSource.indexOf("const STATIC_CACHE_URLS")),
);
assert.doesNotMatch(staticCacheSource, /site-info\.css/, "Public-page CSS should load through the runtime cache.");
for (const page of publicPages) {
  assert.doesNotMatch(staticCacheSource, new RegExp(`/${page.replaceAll(".", "\\.")}`), `${page} should not inflate the install cache.`);
}
assert.match(serviceWorkerSource, /request\.mode === "navigate"[\s\S]*networkFirst\(request/);
assert.match(serviceWorkerSource, /url\.pathname\.endsWith\("\.css"\)[\s\S]*networkFirst\(request, null\)/);
assert.match(netlifySource, /from = "\/"\s+to = "\/home\.html"\s+status = 200\s+force = true/);
assert.match(netlifySource, /from = "\/play\/"\s+to = "\/index\.html"\s+status = 200\s+force = true/);
assert.match(manifestSource, /"start_url": "\/play\/"/);

console.log("Validated the content-first homepage, /play/ handoff, interactive public library, non-serving AdSense verification, crawlability, robots, and sitemap.");
