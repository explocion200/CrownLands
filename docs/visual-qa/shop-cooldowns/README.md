# Shop cooldown verification

The Shop interval updated only ad countdown text. Provision purchase deadlines and the UTC daily reset did not update a stationary Shop. Ad daily limits did not refresh at midnight, and opening the ad disclosure stopped the interval permanently until the Shop was reopened.

The existing one-second Shop timer now patches current controls without replacing the selection or focused details. It pauses during the ad disclosure and resumes afterward. Ad eligibility is refreshed from the server when the cooldown expires or its UTC day changes. Failed checks keep rewards disabled and retry at most once per 30 seconds, with one request in flight. Closing the Shop stops the timer; delayed responses cannot replace another dialog.

Purchase limits, prices, rewards and server authority are unchanged. No production data or ad configuration is changed.

## Verification

- `validate-shop-cooldowns-browser.js` uses the real interval callback, a controlled clock and synthetic API responses at 1440 × 900, 844 × 390 and 568 × 320. It checks every provision and the Common Gear Box at the cap and exact UTC boundary, closing/reopening, shared Gold/Troop ad cooldowns, stable controls, disclosure cancellation, ad daily resets, cooldowns crossing midnight, failed reads, bounded retries and leaving the Shop during a pending read.
- `validate-utc-cooldowns.js` runs both the actual client and server purchase-status functions across midnight for every configured item limit, alongside legacy migration checks.
- `validate-rewarded-ads.js` covers the server's 30-minute boundary, daily cap/reset and reward-claim guards.
- Existing Shop and cosmetics browser validators cover desktop/landscape presentation, purchase rejection/retry, pending actions, tab navigation, Skins and modal handoff. Shop screenshots are generated under `release-artifacts/shop-ui/`.

The repository's `ads-config.js` has an empty `productionAdUnitPath`. Ad timer checks therefore use synthetic responses; a live Google ad completion was not tested. Production deployment requires separate verification.
