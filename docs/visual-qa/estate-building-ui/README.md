# Building service interface review

Run `node tools/estate-building-ui-preview.js`, then open [the loopback preview](http://127.0.0.1:8890/). Close the building window to change its building/state selectors, then choose Services or Build / Upgrade. All twenty sites are available. Sample states cover ready, insufficient materials, active work, a Hall prerequisite, unbuilt and Level 100.

This preview uses disposable server-calculated estate data. It has no player authentication or Firebase connection, and refuses every paid commit. Review screens and navigation cannot spend Gold, materials or Crowns. The preview is development-only and is excluded from the production artifact.

`node tools/validate-estate-building-ui-browser.js` checks all twenty service layouts, four manual producers and six construction states at 1440×900, 844×390 and 568×320. It verifies image loading, viewport fit, absence of horizontal overflow, visible 44px footer actions, quantity/draft restoration, prerequisite Back, Escape return and reduced motion. Screenshots and its verification record are written under ignored `release-artifacts/estate-building-ui/source/`.

After a production build, add `--built` to exercise the delivered runtime CSS/JavaScript and illustrations with the same disposable review data. The existing `tools/validate-estate-economy-browser.js` separately exercises actual game integration, server-quote payment/retry, Gear round trips, focus, storage, production, recruitment, quests and scene cleanup. An automated browser is not evidence of physical-device or authenticated live gameplay verification.
