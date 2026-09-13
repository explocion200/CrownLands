# Player Profile draft review

Reviewed September 13, 2026 using the local preview server and the Codex in-app browser. All profile values and interactions were synthetic. No production account was accessed.

## Completed checks

- Desktop 1440 × 900: full composition inspected; ruler identity, six statistics, included production bonuses, clan, seasonal progress, navigation, and both primary actions are present.
- Landscape 844 × 390: identity, statistics, and achievements panes have matching client/scroll heights (298, 192, 192 px respectively). Inner Castle and View Achievements are each 44 px high and fully within the window.
- Small landscape 568 × 320: identity/statistics/achievements client and scroll heights match (251, 159, 159 px). Both main actions remain 44 px high. Normal content and the seasonal-reset note fit without scrolling.
- Large numbers and long ruler/clan names inspected at 568 × 320; full values remain readable, with wrapping for the long identity text. No truncation of displayed statistic values.
- Edited Aldric to Eleanor and saved locally. The name and public-profile action label updated. Reset restored the original sample.
- Opened flag samples, selected Burgundy & linen, and confirmed the banner changed locally. Reset restored the original sample.
- Opened Gold production: base 192,000/h + included bonus 76,800/h = total 268,800/h. The popover explicitly explains that the bonus is already included.
- New ruler: no clan affiliation row, zero XP, one city, zero achievement progress, and no Ready badge.
- All collected: 40/40 complete and claimed, with no Ready badge. Loading and unavailable labels render; the unavailable Achievements action is disabled.
- Inner Castle action opens the local navigation explanation. View Achievements opens the summary and links to the existing Achievements draft; Reset example successfully returns to Player Profile.
- Closing and reopening the Profile retains the visible draft and actions.
- No browser warning/error logs were reported during the checked interactions.

## Approved integration checks

The actual Profile screen was checked through the local benchmark fixture with mock services, without a production account.

- Desktop 1440 × 900: identity, statistic grid, and achievement content have matching client/scroll dimensions; saved flag crown, colors/pattern and actual clan shield render.
- Landscape 844 × 390: all information and bottom actions fit. Gold details show 192K/h base + 76K/h included bonus = 268K/h total; troop details show 14K/h + 5.7K/h = 19K/h using the existing abbreviated formatter. Closing by button or Escape preserves the underlying Profile.
- Small landscape 568 × 320 with long ruler/clan names and large totals: identity, statistic grid and achievements have equal client/scroll heights of 253, 161 and 161 px; both primary actions remain 44 px tall. Production bonuses remain visible.
- Existing name editor saved Eleanor through the mock identity handler. Flag editor opened and cancelled successfully; Profile styling was removed while editing.
- Skills, Settings and Clan tabs retain their current screens; returning restores the overview. View Achievements opens the actual achievement ledger and closing it restores Profile. Inner Castle opens the existing Main City Royal Bailey.
- No-clan affiliation is hidden, zero XP displays correctly, Loading remains actionable, and Unavailable disables the achievement button.
- No browser warning/error logs during these checks. Temporary viewport override was reset.
- Production artifact build and validation passed: 601 files, 26.16 MiB base plus 16.68 MiB lazy world. Profile reuses the packaged heraldry sprite and approved art.

Required local and GitHub release checks are recorded by prepare-pr and the release receipt. No production-account mutations or physical-device test were performed.
