const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const publicPages = [
  "home.html",
  "guides.html",
  "updates.html",
  "roadmap.html",
  "world.html",
  "community.html",
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
  "/",
  "/play/",
  "/roadmap.html",
  "/world.html",
  "/how-to-play.html",
  "/guides.html",
  "/updates.html",
  "/community.html",
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
const updatesSource = read("updates.html");
const publicSiteSource = read("public-site.js");
const gameStylesSource = read("styles.css");
const interfaceThemeSource = read("interface-theme.css");
const readabilitySource = read("readability.css");
const stylesSource = read("site-info.css");
const robotsSource = read("robots.txt");
const sitemapSource = read("sitemap.xml");
const serviceWorkerSource = read("service-worker.js");
const netlifySource = read("netlify.toml");
const manifestSource = read("manifest.webmanifest");
const roadmapSource = read("roadmap.html");
const roadmapDataSource = read("roadmap-data.js");
const roadmapScriptSource = read("roadmap.js");
const roadmapStylesSource = read("roadmap.css");
const worldSource = read("world.html");
const communitySource = read("community.html");
const howToSource = read("how-to-play.html");
const guidesSource = read("guides.html");
const supportSource = read("support.html");

assert.match(indexSource, /name="google-adsense-account"\s+content="ca-pub-6031755025291372"/);
assert.doesNotMatch(indexSource, /adsbygoogle|loginDisplayAd|login-display-ad/);
assert.match(indexSource, /class="login-game-info"/);
assert.match(indexSource, /Build a kingdom across 15 connected regions/);
assert.match(indexSource, /href="\/roadmap\.html"/);
assert.match(indexSource, /name="robots" content="noindex, nofollow"/);
assert.match(indexSource, /rel="canonical" href="https:\/\/playcrownlands\.com\/play\/"/);
assert.match(homeSource, /rel="canonical" href="https:\/\/playcrownlands\.com\/"/);
assert.match(homeSource, /application\/ld\+json/);
assert.match(homeSource, /data-kingdom-planner/);
assert.match(homeSource, /<title>Crownlands — Medieval Browser Strategy Game<\/title>/);
assert.match(homeSource, /Conquer cities\. March armies\. Rule the realm\./);
for (const phrase of ["15", "Persistent", "Real-time", "City", "Clan", "Daily", "Achievements", "Gear"]) {
  assert.match(homeSource, new RegExp(`>${phrase}<`), `Homepage is missing the ${phrase} feature chip.`);
}
for (const pillar of ["Build cities", "Produce resources", "Scout rivals", "March armies", "Capture territory", "Join clans", "Contest objectives", "Develop a ruler"]) {
  assert.match(homeSource, new RegExp(pillar), `Homepage is missing the ${pillar} gameplay pillar.`);
}
assert.match(homeSource, /class="power-path"/);
assert.match(homeSource, /Explore all 15 regions/);
assert.match(homeSource, /Live foundations, active polish, and visible next steps/);
assert.ok((homeSource.match(/Read the note -&gt;/g) || []).length >= 3, "Homepage needs three linked development notes.");
assert.match(updatesSource, /data-patch-notes-feed/);
assert.match(updatesSource, /src="\/patch-notes\.js"[\s\S]*src="\/public-site\.js/);
assert.match(publicSiteSource, /renderPublicPatchNotes/);
assert.match(gameStylesSource, /\.public-site-links a\s*\{[\s\S]*?min-height:\s*0[\s\S]*?font-size:\s*\.62rem[\s\S]*?text-decoration:\s*underline/);
assert.match(interfaceThemeSource, /\.public-site-links a\s*\{[\s\S]*?border:\s*0[\s\S]*?background:\s*transparent[\s\S]*?text-decoration:\s*underline/);
assert.match(readabilitySource, /\.setup-card \.server-realm-heading\s*\{[\s\S]*?color:\s*#4b1f25 !important[\s\S]*?text-shadow:\s*none/);
assert.match(readabilitySource, /\.setup-card #onlineStatusText\s*\{[\s\S]*?color:\s*#2b1a0f !important[\s\S]*?text-shadow:\s*none/);
assert.match(readabilitySource, /\.setup-card #onlineStatusDetail\s*\{[\s\S]*?color:\s*#4f3f2d !important[\s\S]*?text-shadow:\s*none/);
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
  assert.doesNotMatch(source, /Five Island|island game|island map|portal system/i, `${page} contains retired public world wording.`);
  assert.ok(visibleWordCount(source) >= 180, `${page} needs at least 180 visible words of original content.`);
  for (const href of requiredNavigation) {
    assert.match(source, new RegExp(`href="${href.replaceAll(".", "\\.")}"`), `${page} does not link to ${href}.`);
  }
}

assert.match(worldSource, /<title>Crownlands World — 15 Connected Regions<\/title>/);
assert.match(worldSource, /Capacity belongs to each region/);
assert.match(worldSource, /Dynamic realm expansion/);
assert.match(worldSource, /currently has 15 connected regions/);
for (const region of ["Crownlands Heart", "West Marches", "East Reach", "North Frontier", "Southfields", "Graywood Hollow", "Greenrook Vale", "Lowroad Vale", "Stonebrook Farms", "Goldmere Plains", "Bandit Wastes", "Ironfall Hills", "Redbanner Fields", "Ashenfen March", "Relic Vale"]) {
  assert.match(worldSource, new RegExp(region), `World page is missing ${region}.`);
}
assert.ok(visibleWordCount(worldSource) >= 650, "World page needs substantial original regional content.");
assert.match(communitySource, /Share gameplay feedback/);
assert.match(communitySource, /Report a reproducible bug/);
assert.match(communitySource, /Suggest a balance change/);
assert.match(communitySource, /https:\/\/discord\.gg\/F2EdEGuvEy/);
assert.match(communitySource, /https:\/\/github\.com\/explocion200\/crownlands-game\/issues/);
assert.ok(visibleWordCount(communitySource) >= 500, "Community page needs substantial original participation guidance.");
for (const anchor of ["first-five", "main-city", "first-city", "economy", "daily", "map", "scouting", "moving-troops", "camps", "strongholds", "growth", "join-clan", "checklist"]) {
  assert.match(howToSource, new RegExp(`id="${anchor}"`), `Beginner guide is missing #${anchor}.`);
}
for (const anchor of ["cities-levels", "troops-marches", "combat-walls", "scouting-reports", "camps", "strongholds", "clans-rallies", "items-bag", "skills", "achievements", "leaderboards", "pwa-install"]) {
  assert.match(guidesSource, new RegExp(`id="${anchor}"`), `Guide hub is missing #${anchor}.`);
}
for (const anchor of ["installation", "gameplay-questions", "known-limitations", "policies"]) {
  assert.match(supportSource, new RegExp(`id="${anchor}"`), `Support is missing #${anchor}.`);
}
assert.match(supportSource, /playcrownlands\.com/);
assert.doesNotMatch(supportSource, /crownland\.netlify\.app/);

for (const page of publicPages) {
  const source = read(page);
  for (const match of source.matchAll(/href="(\/[^"]+)"/g)) {
    const href = match[1];
    if (href === "/" || href.startsWith("/play/") || href.startsWith("/assets/") || href.startsWith("/promo-screenshots/")) continue;
    const [pathname, fragment] = href.split("#");
    if (!pathname.endsWith(".html")) continue;
    const target = pathname.slice(1);
    assert.ok(fs.existsSync(path.join(root, target)), `${page} links to missing ${pathname}.`);
    if (fragment) assert.match(read(target), new RegExp(`id="${fragment}"`), `${page} links to missing ${href}.`);
  }
}

assert.match(roadmapSource, /<title>Crownlands Roadmap<\/title>/);
assert.match(roadmapSource, /See what is playable now, what is being improved, and what is coming next to Crownlands\./);
assert.match(roadmapSource, /Crownlands is in active development\. Roadmap items may change based on testing, balance, performance, and player feedback\./);
assert.match(roadmapSource, /id="roadmapSearch"[^>]*type="search"/);
assert.match(roadmapSource, /id="statusFilters"/);
assert.match(roadmapSource, /id="categoryFilters"/);
assert.match(roadmapSource, /15 Regions Live/);
assert.match(roadmapSource, /Dynamic Expansion In Development/);
assert.doesNotMatch(roadmapSource, /Five Island|island game|island map|portal system/i);
assert.ok((roadmapDataSource.match(/\bid:\s*"[a-z0-9-]+"/g) || []).length >= 32, "Roadmap data needs every approved public feature card.");
assert.match(roadmapDataSource, /id: "achievements"[\s\S]*?status: "Live"/);
assert.match(roadmapDataSource, /id: "inner-castle-gear"[\s\S]*?status: "In Development"/);
assert.match(roadmapDataSource, /id: "dynamic-map-expansion"[\s\S]*?status: "In Development"/);
assert.match(roadmapDataSource, /Each region has its own city capacity and layout balance/);
for (const category of ["World", "Combat", "Progression", "Clans", "UI/Polish", "Events", "Mobile/PWA"]) {
  assert.match(roadmapDataSource, new RegExp(`"${category.replace("/", "\\/")}"`), `Roadmap data is missing ${category}.`);
}
assert.match(roadmapScriptSource, /function itemMatches\(/);
assert.match(roadmapScriptSource, /function toggleCard\(/);
assert.match(roadmapScriptSource, /searchInput\.addEventListener\("input"/);
assert.match(roadmapScriptSource, /aria-expanded/);
assert.match(roadmapStylesSource, /grid-template-columns:\s*repeat\(4/);
assert.match(roadmapStylesSource, /@media \(max-width:\s*700px\)/);
assert.match(roadmapStylesSource, /@media \(prefers-reduced-motion:\s*reduce\)/);

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
