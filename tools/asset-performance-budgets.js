"use strict";
// Existing approved shell limit, shared by both validators to prevent drift.
// The allowance history is documented in validate-asset-performance-budgets.js.
// Knight catalog/painter integration adds at most 24 KiB; city art stays lazy.
// Inner Castle HUD entry adds 1,442 normalized bytes across both HTML entries,
// game.js and HUD CSS. Bound that shell growth at 2 KiB; its art stays lazy.
// Guild entry declarations and its report API add less than 2 KiB to the shell.
// The four Guild modules and all 42 paintings load only with the estate UI.
// Marauder targets and the permanent stamina HUD add five compact shell files
// plus order/report wiring. Measured shell: 4,512,281 bytes (19,993 above
// the previous cap). Bound this feature at one 24 KiB step; NPC art stays lazy.
const MAX_INSTALL_PRECACHE_BYTES = (3784 + 36 + 44 + 32 + 100 + 40 + 16 + 128 + 4 + 4 + 3 + 52 + 4 + 64 + 48 + 24 + 2 + 2 + 24) * 1024;
module.exports = { MAX_INSTALL_PRECACHE_BYTES };
