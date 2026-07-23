const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

requireMatch(serverSource, /recordCrownCitadelControlChange[\s\S]*?totalHeldMs[\s\S]*?currentHeldSinceMs/, "Missing server-authoritative Citadel reign accumulation.");
requireMatch(serverSource, /recordCrownCitadelControlChange[\s\S]*?worldId: ONLINE_WORLD_ID[\s\S]*?resetGeneration: RESET_GENERATION/, "Citadel reign scores are not scoped to the current world reset.");
requireMatch(serverSource, /if \(isCrownCitadel\(target\)\)[\s\S]*?recordCrownCitadelControlChange/, "Citadel captures do not update the Reign Ledger.");
requireMatch(serverSource, /if \(isCrownCitadel\(source\)\)[\s\S]*?recordCrownCitadelControlChange/, "Relinquishing the Citadel does not close the current reign.");
requireMatch(rulesSource, /match \/crownCitadelReigns\/\{uid\}[\s\S]*?allow read: if signedIn\(\);[\s\S]*?allow create, update, delete: if false;/, "Citadel reign scores must be public to signed-in players and server-owned.");
requireMatch(firebaseClientSource, /loadCrownCitadelReignLeaderboard[\s\S]*?crownCitadelReigns/, "Missing public Reign Ledger loader.");
requireMatch(firebaseClientSource, /subscribeCrownCitadel[\s\S]*?onCitadel/, "Missing lightweight Crown Citadel control listener.");
requireMatch(clientSource, /Reign Ledger/, "Crown Citadel info is missing the Reign Ledger tab.");
requireMatch(clientSource, /data-citadel-reign-score/, "Citadel reign scores do not update while the current reign is active.");
requireMatch(clientSource, /cityOwnerHoldsCrownCitadel[\s\S]*?citadel-city-crown/, "Cities owned by the Citadel ruler do not receive crown markers.");
requireMatch(stylesSource, /\.citadel-city-crown/, "Citadel city crown styling is missing.");
requireMatch(stylesSource, /\.citadel-reign-row\.current/, "Current Citadel ruler styling is missing.");

console.log("Validated Crown Citadel Reign Ledger authority, public scoring, live control sync, and city crown markers.");
