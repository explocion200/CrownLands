# Crownlands - Medieval Island Conquest Prototype V16

Landscape / horizontal medieval island-conquest prototype.

## New in V16

- One island now contains exactly 100 cities.
- New games randomly choose far-apart starting towns for Player 1, Player 2, Player 3, and one NPC.
- Player 1 is controlled locally for now.
- Player 2 and Player 3 are placeholder real-player slots until multiplayer accounts are added.
- The NPC is the active AI kingdom in this single-player prototype.
- Older 48-city saves are replaced with the new 100-city medieval painted island layout.

## Previous V14 changes

- Removed the total-owned-city cap.
- City counter now shows owned city count only, not a 30 max.
- Daily neutral town capture limit remains at 30 per day.
- Trying to target a neutral town after the daily limit opens a closeable message and cancels the action.
- Added a main character level system.
- Character level appears as a badge attached to the portrait placeholder.
- Character XP appears under the gold display.
- There is no character level cap.
- XP needed per level scales hard; by around level 150 the next level requires roughly 1M XP.
- Level-up rewards automatically grant a lump sum of gold and troops.
- Troop rewards are added to the main city. If the original main city is lost, the reward goes to the first player-owned city.
- XP is currently earned from:
  - Capturing neutral/enemy cities.
  - Leveling up your cities.
  - Successfully defending against enemy attacks.

## Core gameplay included

- Big island map.
- Lakes and mountains block movement.
- Cities are not placed on water or mountains.
- Any city can target any other city.
- Troops path around blocked terrain.
- Moving armies show a route marker and countdown.
- Player starts with 1 main city and 50 soldiers.
- The NPC starts with 1 city, and Player 2 / Player 3 each start with 1 placeholder city.
- Gray cities start with 10 defending soldiers.
- All cities start at level 1 and max at level 100.
- Player can capture up to 30 neutral towns per local calendar day.
- There is no max owned-city count.
- Mouse wheel zoom on PC.
- Pinch zoom on phone.
- Drag/pan map movement.

## Deploy on Netlify

Upload the full folder or zip to Netlify Drop. Keep `index.html`, `styles.css`, `game.js`, and `manifest.webmanifest` together in the same folder.



## Version 20 map rules

- The map now uses the generated medieval island image as the playable background.
- The island still contains 100 cities.
- Cities are placed on open land or clearings only.
- Cities are not placed on ocean, lakes, mountains, dense forests, or swamp.
- Troops cannot walk through ocean, lakes, or mountains.
- Troops can walk through forests and swamp at normal speed.
- Route markers only appear after troops are sent.


## Version 20 update
- Starting test gold is set to 100,000,000.
- XP counter was removed from the main HUD; the level badge remains on the portrait.
