const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const publicPages = [
  "about.html",
  "how-to-play.html",
  "game-rules.html",
  "support.html",
  "privacy.html",
];
const requiredNavigation = [
  "/about.html",
  "/how-to-play.html",
  "/game-rules.html",
  "/support.html",
  "/privacy.html",
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
const stylesSource = read("site-info.css");
const robotsSource = read("robots.txt");
const sitemapSource = read("sitemap.xml");
const serviceWorkerSource = read("service-worker.js");

assert.match(indexSource, /name="google-adsense-account"\s+content="ca-pub-6031755025291372"/);
assert.doesNotMatch(indexSource, /adsbygoogle|loginDisplayAd|login-display-ad/);
assert.match(indexSource, /class="login-game-info"/);
assert.match(indexSource, /Build a kingdom across living islands/);
for (const href of requiredNavigation) {
  assert.match(indexSource, new RegExp(`href="${href.replaceAll(".", "\\.")}"`), `Homepage does not link to ${href}.`);
}

for (const page of publicPages) {
  const source = read(page);
  assert.match(source, /<title>[^<]{12,}<\/title>/, `${page} needs a descriptive title.`);
  assert.match(source, /<meta name="description" content="[^"]{50,}"/, `${page} needs a substantive description.`);
  assert.match(source, /name="google-adsense-account"\s+content="ca-pub-6031755025291372"/, `${page} needs the non-serving verification tag.`);
  assert.match(source, /rel="canonical"\s+href="https:\/\/crownland\.netlify\.app\//, `${page} needs a canonical URL.`);
  assert.match(source, /href="\/site-info\.css\?v=20260727-adsense-policy"/, `${page} must use the public content stylesheet.`);
  assert.doesNotMatch(source, /adsbygoogle|securepubads\.g\.doubleclick\.net|googletag/, `${page} must not request Google-served ads.`);
  assert.ok(visibleWordCount(source) >= 180, `${page} needs at least 180 visible words of original content.`);
}

assert.match(stylesSource, /\.site-header/);
assert.match(stylesSource, /\.site-hero/);
assert.match(stylesSource, /@media \(max-width:\s*760px\)/);
assert.match(robotsSource, /User-agent:\s*\*/);
assert.match(robotsSource, /Allow:\s*\//);
assert.match(robotsSource, /Sitemap:\s*https:\/\/crownland\.netlify\.app\/sitemap\.xml/);
for (const page of ["/", ...publicPages.map(page => `/${page}`)]) {
  assert.match(sitemapSource, new RegExp(`<loc>https://crownland\\.netlify\\.app${page.replaceAll(".", "\\.")}</loc>`));
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

console.log("Validated ad-free login, non-serving AdSense verification, crawlable public content, robots, and sitemap.");
