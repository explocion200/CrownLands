# Responsive War Room

The October 22 owner request applies the earlier mobile draft to the real War Room on both PC and phones. The old draft branch is not merged: this update replaces the current presentation and keeps current controls and services.

## Layout and behavior

The existing Clan frame/tabs stay in place. Target, section, rally state and active count form a compact header, alongside Intelligence and Details. The roster uses the full width with Participant, Troops and Status / arrival columns. Exact troop numbers remain readable. Launch, Cancel, Join, Withdraw or Recall stay in the fixed footer according to existing role/state rules. A Clan Leader can still contribute while managing another member's rally.

Details holds the assembly shortcut, creator, breakdowns, rules and existing manual Boss readiness check. The target selector opens an in-game active-rally list; Back restores focus. Repeated authoritative updates preserve the selected rally, roster scroll and focused control. Changing rally/sheet deliberately starts the new view; removed rallies fall back to the next available rally, and account/clan scope changes clear stale selection.

No new API, subscription, polling, stored player data, artwork or gameplay rule. Kingdom Activity retains its existing renderer. Every action still uses the existing handlers, confirmations, request lock and server authorization.

## Reproducible checks

Run Node 22 with `CHROME_PATH` pointing to Chromium. Build with `node tools/build-production-client.js`, then run `node tools/validate-war-room-responsive-browser.js`. It exercises actual source and delivered production renderers/handlers with fictional data through the loopback-only benchmark harness. External services are blocked. Generated screenshots and measurements are ignored under `release-artifacts/war-room-responsive/`.

At 1440×900, 844×390 and 568×320, check five-member Boss and 20-member ordinary rosters, five active rallies, full troop values, readiness, scroll/focus retention, removed/empty rallies, role-appropriate controls, busy requests and launch confirmation cancellation/acceptance. PC uses mouse input; landscape sizes use simulated touch. Screenshots include Boss, crowded roster, Details and three-control Clan Leader states.

Observed source layout: roster heights 389 / 139 / 85 CSS pixels respectively; five / five / three complete Boss rows visible. The narrow roster scrolls to the remaining participants. Action targets stay at least 44 pixels high with no horizontal overflow or covered footer.

Affected checks also cover rally creation, source selection, confirmed joins, assembly map navigation, staging defense, role/quorum logic and shared Clan/modal refresh behavior. The assembly unit fixture includes the current Stables preview scope dependency; no movement behavior changes.

Asset limits: delivered offline shell grows by 2,890 bytes to 4,646,721, bounded by a 3 KiB allowance; game.js grows 2,614 bytes within a 3 KiB increase. The lazy Clan stylesheet grows 3,658 bytes after removing obsolete War Room styles and remains below 88 KiB. No new installed assets or dependencies.

## Release

This is a static client change based on `e1656f0a99ebdb0805483bc48a5582827f146dd6`. That base includes the separately reviewed daily-stamina backend (PR #705); its server must be installed and verified before the matching client is published. The configured publisher compatibility checks remain mandatory. No additional backend change or migration is introduced by this PR. Merge and deployment are separately verified in the delivery report; this document does not claim live publication.
