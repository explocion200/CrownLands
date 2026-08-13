const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validate(styles, label) {
  const required = [
    ["owned city banner", ".city-owner-column", "background: #176cb7;"],
    ["owned troop count", ".city-army-count", "background: #247dce;"],
    ["enemy city", ".city-node.enemy .foreign-city-shield", "background: var(--enemy-city-ui);"],
    ["alternate player city", ".city-node.player2 .foreign-city-shield", "background: #6946a9;"],
    ["friendly player city", ".city-node.player3 .foreign-city-shield", "background: #287e4c;"],
    ["neutral city", ".city-node.neutral .foreign-city-shield", "background: #6b655b;"],
    ["clan ally city", ".city-node.clan-ally .foreign-city-shield", "background: #267a43;"],
    ["alternate player flag", ".city-node.player2 .owner-flag", "background: #9d75ff;"],
    ["friendly player flag", ".city-node.player3 .owner-flag", "background: #56d486;"],
  ];
  for (const [name, selector, declaration] of required) {
    assert(styles.includes(selector), `${label}: missing ${name} selector.`);
    assert(styles.includes(declaration), `${label}: missing original ${name} color.`);
  }

  const removedCityOverrides = [
    /\.city-node\.enemy \.foreign-city-shield,[\s\S]{0,320}background:\s*linear-gradient\(180deg, #88482c, #58262a\)/,
    /\.city-node\.clan-ally \.foreign-city-shield,[\s\S]{0,520}background:\s*linear-gradient\(180deg, #647047, #354127\)/,
    /\.city-node\.player2 \.foreign-city-shield,[\s\S]{0,380}background:\s*linear-gradient\(180deg, #59697a, #303941\)/,
    /\.city-node\.neutral \.foreign-city-shield,[\s\S]{0,380}background:\s*linear-gradient\(180deg, #756d5f, #3c3830\)/,
  ];
  for (const pattern of removedCityOverrides) {
    assert(!pattern.test(styles), `${label}: a muted city ownership color override is still active.`);
  }
}

validate(`${fs.readFileSync(path.join(root, "styles.css"), "utf8")}\n${fs.readFileSync(path.join(root, "interface-theme.css"), "utf8")}`, "source");
const distStyles = path.join(root, "dist", "styles.css");
const distInterfaceTheme = path.join(root, "dist", "interface-theme.css");
if (fs.existsSync(distStyles) && fs.existsSync(distInterfaceTheme)) {
  validate(`${fs.readFileSync(distStyles, "utf8")}\n${fs.readFileSync(distInterfaceTheme, "utf8")}`, "production artifact");
}

console.log("City UI color rollback validation passed.");
