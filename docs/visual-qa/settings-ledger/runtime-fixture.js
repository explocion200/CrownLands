/* Local actual-game review. Never loaded by the production client. */
(async function () {
  if (!["127.0.0.1", "localhost"].includes(location.hostname) || !window.__CROWNLANDS_BENCHMARK__) throw Error("Local benchmark required");
  const deadline = Date.now() + 60000;
  while (window.__CROWNLANDS_BENCHMARK__.getStatus().status !== "ready") {
    if (Date.now() > deadline) throw Error("Benchmark did not initialize");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  showProfileScreen();
  showProfileSettings();
  document.documentElement.dataset.settingsRuntimeReady = "true";
})();
