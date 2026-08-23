# Holding Tower Fix Visual QA

These captures validate the pre-merge Holding Tower UI rework and the Treasury allowance states. They were generated from the local `towerQa` fixtures only; no live-world state was activated or written.

## Production visual language reused

- Clan hero, integrated Clan shield, Clan name/tag, section headings, roster rows, and Clan gift/form hierarchy
- city and Stronghold stat panels, fortification state, city level-up controls, and action-button treatments
- Clan quest progress tracks for Wall durability, repair, upgrade timing, and donation allowance
- existing parchment, dark-blue Clan surfaces, burgundy/green/charcoal actions, ivory text, restrained gold, Cinzel family, borders, shadows, and spacing

The rework introduces no dashboard cards, SaaS controls, pill-heavy layout, new font, or portrait-specific variant.

## Fresh capture set

1. `screenshots/01-clan-owned-tower.jpg`
2. `screenshots/02-wall-repair-ui.jpg`
3. `screenshots/03-active-upgrade-queue.jpg`
4. `screenshots/04-veil-of-silence.jpg`
5. `screenshots/05-clan-treasury.jpg`
6. `screenshots/06-allowance-before-first-donation.jpg`
7. `screenshots/07-allowance-after-lock.jpg`
8. `screenshots/08-desktop-1440x900.jpg`
9. `screenshots/09-landscape-mobile-844x390.jpg`

`metrics.json` records the scenario, viewport, root/modal bounds, and scroll dimensions for every capture. The QA harness asserts no body or modal horizontal overflow, no unexpected browser-console errors, and the exact `844×390` mobile viewport.
