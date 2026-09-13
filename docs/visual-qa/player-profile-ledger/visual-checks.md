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

## Scope and remaining work

This is an approval draft, not an integrated runtime test. Flag and clan shield artwork demonstrates framing using synthetic heraldry; production integration must retain the actual renderers and stored heraldry. Navigation previews for Clan, Skills, Settings, public profiles, and Inner Castle do not implement those screens. The source interface's production total/bonus calculation and achievement seasonal rules remain the integration source of truth.

Review the design before implementation. Then wire the approved layout to existing state/actions, test actual-game navigation and synchronization, and run the repository's required release workflow before proposing a merge. No pull request, merge, or deployment has occurred for this draft.
