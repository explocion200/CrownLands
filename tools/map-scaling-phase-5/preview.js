"use strict";

const fs = require("node:fs");
const path = require("node:path");

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[character]));
}

function createPlayerPreviewSvg(fixture, relativeMapPath) {
  const result = fixture.result;
  const packageValue = result.package;
  const starts = new Set(packageValue.startingCandidates.map(candidate => candidate.cityId));
  const connections = packageValue.topology;
  const edgeLabels = [
    ["north", 724, 28], ["east", 1390, 543], ["south", 724, 1060], ["west", 58, 543],
  ].map(([side, x, y]) => {
    const open = connections[side].state === "open";
    return `<g><rect x="${x - 42}" y="${y - 14}" width="84" height="28" rx="8" fill="${open ? "#315f42" : "#713f35"}" opacity=".92"/><text x="${x}" y="${y + 5}" text-anchor="middle" fill="#fff6dc" font-size="13">${side.toUpperCase()} ${open ? "OPEN" : "GATED"}</text></g>`;
  }).join("");
  const blockers = packageValue.blockers.map(blocker => (
    `<ellipse cx="${blocker.x}" cy="${blocker.y}" rx="${blocker.rx}" ry="${blocker.ry}" fill="none" stroke="#ef5b4f" stroke-width="4" stroke-dasharray="10 6"><title>${escapeHtml(blocker.id)} (${escapeHtml(blocker.type)})</title></ellipse>`
  )).join("");
  const roads = [...packageValue.roads.edgeRoads, ...packageValue.roads.branches].map(road => (
    `<polyline points="${road.points.map(point => `${point.x},${point.y}`).join(" ")}" fill="none" stroke="#ffe68a" stroke-width="5" opacity=".9"><title>${escapeHtml(road.id)}</title></polyline>`
  )).join("");
  const cities = packageValue.cities.map(city => (
    `<circle cx="${city.x}" cy="${city.y}" r="${starts.has(city.id) ? 10 : 6}" fill="${starts.has(city.id) ? "#ffdf62" : "#f5f0dc"}" stroke="#352c22" stroke-width="2"><title>${escapeHtml(city.id)}${starts.has(city.id) ? " starting candidate" : ""}</title></circle>`
  )).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1448" height="1086" viewBox="0 0 1448 1086">
  <image href="${escapeHtml(relativeMapPath)}" width="1448" height="1086"/>
  ${roads}${blockers}${cities}${edgeLabels}
  <g><rect x="18" y="18" width="420" height="86" rx="10" fill="#1c211b" opacity=".84"/>
  <text x="34" y="47" fill="#fff4d3" font-size="22">${escapeHtml(packageValue.profile.replace(/_/g, " "))}</text>
  <text x="34" y="73" fill="#d6dfc3" font-size="15">40 cities • ${packageValue.startingCandidates.length} starting candidates • Layer ${packageValue.coordinate.worldLayer}</text>
  <text x="34" y="95" fill="#d6dfc3" font-size="13">Yellow roads • red blocker geometry • gold starting candidates</text></g>
</svg>`;
}

function createCorePreviewSvg(corePackage) {
  const cellSize = 180;
  const padding = 48;
  const cells = corePackage.cells.map(cell => {
    const x = padding + (cell.gridX + 2) * cellSize;
    const y = padding + (cell.gridY + 2) * cellSize;
    const tower = cell.cellState === "reserved_holding_tower";
    const active = Boolean(cell.regionId);
    const citadel = cell.regionId === "center";
    const objectiveCount = (cell.objectives || []).length + (cell.camps || []).length;
    const fill = citadel ? "#8b6a2d" : active ? "#506b45" : tower ? "#6b4d73" : "#4a4d50";
    return `<g><rect x="${x}" y="${y}" width="160" height="160" rx="12" fill="${fill}" stroke="#d9c894" stroke-width="3"/>
      <text x="${x + 80}" y="${y + 26}" text-anchor="middle" fill="#fff4d3" font-size="15">${cell.gridX},${cell.gridY}</text>
      <text x="${x + 80}" y="${y + 62}" text-anchor="middle" fill="#ffffff" font-size="16">${escapeHtml(cell.regionName || (tower ? "Holding Tower" : "Reserved"))}</text>
      <text x="${x + 80}" y="${y + 88}" text-anchor="middle" fill="#e0dbc9" font-size="12">${escapeHtml(cell.purpose || cell.reservedPurpose)}</text>
      <text x="${x + 80}" y="${y + 116}" text-anchor="middle" fill="#f1ddb0" font-size="12">${active ? `${cell.cityCount} cities • ${objectiveCount} objectives` : "no cities • non-spawnable"}</text>
      <text x="${x + 80}" y="${y + 140}" text-anchor="middle" fill="#d8ecd0" font-size="11">${active ? cell.regionId : cell.towerSlotId || "future support"}</text></g>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="996" height="996" viewBox="0 0 996 996">
  <rect width="996" height="996" fill="#252722"/>
  <text x="498" y="30" text-anchor="middle" fill="#fff4d3" font-size="22">Permanent Crownlands Core Template • 5×5 • development QA</text>
  ${cells}
</svg>`;
}

function writePhase5Previews(outputRoot, suite) {
  const previewDirectory = path.join(outputRoot, "previews");
  fs.mkdirSync(previewDirectory, { recursive: true });
  const links = [];
  for (const fixture of suite.playerProfiles) {
    const fileName = `${fixture.kind}.svg`;
    const relativeMapPath = `../packages/${fixture.kind}/map.webp`;
    fs.writeFileSync(path.join(previewDirectory, fileName), createPlayerPreviewSvg(fixture, relativeMapPath));
    links.push(`<article><h2>${escapeHtml(fixture.kind.replace(/_/g, " "))}</h2><a href="${fileName}"><img src="${fileName}" alt="${escapeHtml(fixture.kind)} Phase 5 QA preview"></a></article>`);
  }
  fs.writeFileSync(path.join(previewDirectory, "core-overview.svg"), createCorePreviewSvg(suite.corePackage));
  links.unshift('<article><h2>Permanent Core overview</h2><a href="core-overview.svg"><img src="core-overview.svg" alt="Permanent Core QA overview"></a></article>');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Crownlands Phase 5 QA</title><style>body{margin:0;background:#171914;color:#f4ead1;font:16px system-ui;padding:24px}header{max-width:980px;margin:auto}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:20px}article{background:#252820;border:1px solid #5d604d;border-radius:12px;padding:14px}img{display:block;width:100%;height:auto;background:#111}code{color:#f2d27f}</style></head><body><header><h1>Phase 5 development-only map composition QA</h1><p>Procedural, watermarked placeholders. Not production art. White/gold circles are runtime overlays and are not baked into map WebPs.</p></header><main>${links.join("")}</main></body></html>`;
  fs.writeFileSync(path.join(previewDirectory, "index.html"), html);
  return { previewDirectory, files: ["index.html", "core-overview.svg", ...suite.playerProfiles.map(fixture => `${fixture.kind}.svg`)] };
}

module.exports = Object.freeze({
  createPlayerPreviewSvg,
  createCorePreviewSvg,
  writePhase5Previews,
});
