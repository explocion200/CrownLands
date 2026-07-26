window.CROWNLANDS_ADS_CONFIG = Object.freeze({
  schemaVersion: 1,
  enabled: true,
  rewardMinutes: 30,
  cooldownMinutes: 30,
  dailyLimit: 20,
  testAdUnitPath: "/22639388115/rewarded_web_example",
  approvedProductionHosts: Object.freeze([
    "crownland.netlify.app",
  ]),
  loginDisplayAd: Object.freeze({
    enabled: true,
    publisherId: "ca-pub-6031755025291372",
    // AdSense > Ads > By ad unit > Display ads. Paste only the numeric
    // data-ad-slot value here after Crownlands is approved for ads.
    slotId: "",
    showLocalPreview: true,
  }),
  // Google Ad Manager > Inventory > Ad units. Use the full path:
  // /NETWORK_CODE/CROWNLANDS_REWARDED_AD_UNIT
  productionAdUnitPath: "",
});
