const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourceGame = fs.readFileSync(path.join(root, "game.js"), "utf8");
const sourceStyles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validate(game, styles, label) {
  assert(
    game.includes('const armyIcon = attack.kind === "transfer" ? "\\u265E" : "\\u2694";'),
    `${label}: traveling and attacking armies must use the original knight and crossed-swords glyphs.`
  );
  assert(
    game.includes('if (attack.kind === "scout") {'),
    `${label}: scout rendering must remain independent from the troop icon rollback.`
  );
  assert(
    styles.includes('.army-token.player { background: linear-gradient(#4fb2ff, #175ea9); }'),
    `${label}: player army tokens must retain their original blue treatment.`
  );
  assert(
    styles.includes('.army-token.enemy { background: linear-gradient(#ff766d, #9c2b26); }'),
    `${label}: enemy attack tokens must retain their original red treatment.`
  );
  assert(styles.includes('border-radius: 999px;'), `${label}: army tokens must retain their original pill silhouette.`);
  assert(
    !styles.includes('.army-token.player { background: linear-gradient(180deg, #a17832, #5b3a24); }'),
    `${label}: a recent brown player-token override is still active.`
  );
  assert(
    !styles.includes('.army-token.enemy { background: var(--cl-oxblood-panel); }'),
    `${label}: a recent oxblood enemy-token override is still active.`
  );
}

validate(sourceGame, sourceStyles, "source");

const distGamePath = path.join(root, "dist", "game.js");
const distStylesPath = path.join(root, "dist", "styles.css");
if (fs.existsSync(distGamePath) && fs.existsSync(distStylesPath)) {
  validate(fs.readFileSync(distGamePath, "utf8"), fs.readFileSync(distStylesPath, "utf8"), "production artifact");
}

console.log("Army token visual rollback validation passed.");
