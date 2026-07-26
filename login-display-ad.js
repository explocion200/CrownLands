(() => {
  "use strict";

  const rootConfig = window.CROWNLANDS_ADS_CONFIG || {};
  const config = rootConfig.loginDisplayAd || {};
  const region = document.getElementById("loginDisplayAd");
  const mount = document.getElementById("loginDisplayAdMount");
  const setupScreen = document.getElementById("setupScreen");
  if (!region || !mount || !setupScreen || config.enabled !== true) return;

  const hostname = String(window.location.hostname || "").trim().toLowerCase();
  const isLocalHost = hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname.endsWith(".localhost");
  const approvedHosts = new Set(
    Array.isArray(rootConfig.approvedProductionHosts)
      ? rootConfig.approvedProductionHosts.map(host => String(host || "").trim().toLowerCase())
      : [],
  );
  const publisherId = String(config.publisherId || "").trim();
  const slotId = String(config.slotId || "").trim();
  const hasValidPublisherId = /^ca-pub-\d+$/.test(publisherId);
  const hasValidSlotId = /^\d+$/.test(slotId);
  const isApprovedProductionHost = approvedHosts.has(hostname);
  const desktopRailQuery = window.matchMedia(
    "(min-width: 1200px) and (min-height: 700px) and (min-aspect-ratio: 5/3)",
  );

  function showLocalPreview() {
    if (!isLocalHost || config.showLocalPreview !== true) return false;
    region.classList.add("is-preview");
    mount.replaceChildren();
    const preview = document.createElement("span");
    preview.className = "login-display-ad-preview";
    preview.textContent = hasValidSlotId
      ? "Responsive AdSense side-rail preview"
      : "Add the Display ad unit slot ID in ads-config.js";
    mount.append(preview);
    region.hidden = false;
    return true;
  }

  function requestDisplayAd() {
    if (
      !desktopRailQuery.matches
      || !setupScreen.classList.contains("visible")
      || region.dataset.adRequested === "true"
    ) return;
    if (!hasValidPublisherId || !hasValidSlotId || !isApprovedProductionHost) {
      showLocalPreview();
      return;
    }

    region.classList.remove("is-preview");
    mount.replaceChildren();
    const ad = document.createElement("ins");
    ad.className = "adsbygoogle";
    ad.style.display = "block";
    ad.dataset.adClient = publisherId;
    ad.dataset.adSlot = slotId;
    ad.dataset.adFormat = "vertical";
    ad.dataset.fullWidthResponsive = "true";
    mount.append(ad);
    region.hidden = false;

    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
      region.dataset.adRequested = "true";
    } catch (error) {
      region.hidden = true;
      console.warn("Crownlands login display ad could not be requested.", error);
    }
  }

  desktopRailQuery.addEventListener?.("change", event => {
    if (event.matches) requestDisplayAd();
  });
  requestDisplayAd();
})();
