/* exported ensureOptionalUiStyle, ensureOptionalUiScripts */
// Optional screens download their styles when opened. Keep a shared request per
// sheet, but a separate owner per host so late loads cannot replace another view.
const optionalUiStyleRequests = new Map();
const optionalUiStyleHosts = new WeakMap();
const optionalUiScriptRequests = new Map();

function optionalUiScripts(names) {
  return [...document.querySelectorAll("script[data-optional-ui-script]")]
    .filter(entry => names.includes(entry.dataset.optionalUiScript));
}

function loadOptionalUiScript(entry) {
  if (entry.dataset.ready === "true") return Promise.resolve();
  const src = entry.dataset.src;
  if (optionalUiScriptRequests.has(src)) return optionalUiScriptRequests.get(src);
  const request = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => { entry.dataset.ready = "true"; resolve(); };
    script.onerror = () => {
      script.remove();
      optionalUiScriptRequests.delete(src);
      reject(new Error("Screen code could not load."));
    };
    document.head.append(script);
  });
  optionalUiScriptRequests.set(src, request);
  return request;
}

function ensureOptionalUiScripts(names, host, onReady) {
  return ensureOptionalUiResources([], Array.isArray(names) ? names : [names], host, onReady);
}
function loadOptionalUiStyle(name) {
  const link = document.querySelector(`link[data-optional-ui-style="${name}"]`);
  if (!link) return Promise.reject(new Error("Screen styles are unavailable. Please reload."));
  if (link.dataset.ready === "true") return Promise.resolve();
  if (optionalUiStyleRequests.has(name)) return optionalUiStyleRequests.get(name);
  const request = new Promise((resolve, reject) => {
    let timer;
    const finish = error => {
      clearTimeout(timer);
      link.removeEventListener("load", loaded);
      link.removeEventListener("error", failed);
      if (error) {
        link.rel = "crownlands-optional-stylesheet";
        reject(error);
      } else {
        link.dataset.ready = "true";
        resolve();
      }
    };
    const loaded = () => finish();
    const failed = () => finish(new Error("Screen could not load. Check your connection and retry."));
    link.addEventListener("load", loaded, { once: true });
    link.addEventListener("error", failed, { once: true });
    timer = setTimeout(failed, 15000);
    link.rel = "stylesheet";
  }).catch(error => {
    optionalUiStyleRequests.delete(name);
    throw error;
  });
  optionalUiStyleRequests.set(name, request);
  return request;
}

function ensureOptionalUiStyle(names, host, onReady) {
  const sheets = Array.isArray(names) ? names : [names];
  return ensureOptionalUiResources(sheets, sheets, host, onReady);
}

function ensureOptionalUiResources(sheets, groups, host, onReady) {
  const scripts = optionalUiScripts(groups);
  if (sheets.every(name => document.querySelector(`link[data-optional-ui-style="${name}"]`)?.dataset.ready === "true")
      && scripts.every(entry => entry.dataset.ready === "true")) return true;
  const key = `${sheets.join("/")}:${groups.join("/")}`;
  const existing = optionalUiStyleHosts.get(host);
  if (existing?.key === key && host.contains(existing.panel)) {
    existing.onReady = onReady;
    return false;
  }
  const panel = document.createElement("section");
  panel.className = "optional-ui-loading";
  panel.style.padding = "24px";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.textContent = "Loading screen…";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Retry";
  retry.style.minHeight = "44px";
  retry.hidden = true;
  panel.append(status, retry);
  host.replaceChildren(panel);
  const owner = { key, panel, onReady };
  optionalUiStyleHosts.set(host, owner);
  const current = () => optionalUiStyleHosts.get(host) === owner && host.contains(panel);
  const start = () => {
    retry.hidden = true;
    status.textContent = "Loading screen…";
    // Classic scripts can define shared globals: preserve declaration order and
    // keep one in-flight script even after a UI timeout, preventing double execution.
    const code = scripts.reduce((pending, entry) => pending.then(() => loadOptionalUiScript(entry)), Promise.resolve());
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Screen loading timed out.")), 15000);
    });
    Promise.race([Promise.all([...sheets.map(loadOptionalUiStyle), code]), timeout]).then(() => {
      if (current()) owner.onReady();
    }).catch(() => {
      if (!current()) return;
      status.textContent = "Screen could not load. Check your connection and retry.";
      retry.hidden = false;
    }).finally(() => clearTimeout(timer));
  };
  retry.addEventListener("click", start);
  start();
  return false;
}
