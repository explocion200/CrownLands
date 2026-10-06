/* Bounded runtime adapter for the approved medieval preview scenery. */
(function (root) {
"use strict";

// Miniature scenery uses a 400-unit city square. The shared cosmetic scheduler
// supplies the clock and handles visibility, pause and reduced motion.
const ORDER_LIVERY = Object.freeze({
  templar: { cloth: "#ded5b7", shadow: "#9b9277", emblem: "#a82d23", cloak: "#8c2a22" },
  hospitaller: { cloth: "#292c29", shadow: "#131a18", emblem: "#eee5ce", cloak: "#292d28" },
  teutonic: { cloth: "#d7d9cc", shadow: "#909d9c", emblem: "#22292b", cloak: "#48595d" },
  santiago: { cloth: "#e4ccb0", shadow: "#a08361", emblem: "#af3025", cloak: "#9d4330" }
});

function medievalEmblem(ctx, order, x, y, size) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 20, size / 20);
  ctx.fillStyle = ORDER_LIVERY[order].emblem;
  if (order === "hospitaller") {
    ctx.beginPath();
    for (let arm = 0; arm < 4; arm++) {
      const angle = arm * Math.PI / 2;
      for (const [px, py] of [[-3, -3], [-9, -10], [0, -6], [9, -10], [3, -3]]) {
        const u = px * Math.cos(angle) - py * Math.sin(angle), v = px * Math.sin(angle) + py * Math.cos(angle);
        ctx.lineTo(u, v);
      }
    }
    ctx.closePath(); ctx.fill();
  } else if (order === "santiago") {
    ctx.beginPath(); ctx.moveTo(-2, -7); ctx.lineTo(-5, -10); ctx.lineTo(0, -14); ctx.lineTo(5, -10); ctx.lineTo(2, -7);
    ctx.lineTo(2, -2); ctx.lineTo(7, -3); ctx.lineTo(9, -6); ctx.lineTo(12, -1); ctx.lineTo(8, 3);
    ctx.lineTo(2, 1); ctx.lineTo(2, 9); ctx.lineTo(0, 15); ctx.lineTo(-2, 9); ctx.lineTo(-2, 1);
    ctx.lineTo(-8, 3); ctx.lineTo(-12, -1); ctx.lineTo(-9, -6); ctx.lineTo(-7, -3); ctx.lineTo(-2, -2); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillRect(-3, -10, 6, 20); ctx.fillRect(-10, -3, 20, 6);
  }
  ctx.restore();
}

function medievalStandard(ctx, order, x, y, t, facing, phase) {
  const colors = ORDER_LIVERY[order], height = 83, width = 45, clothHeight = 31;
  ctx.save(); ctx.translate(x, y); ctx.scale(facing, 1);
  ctx.fillStyle = "#080d0990"; ctx.beginPath(); ctx.ellipse(2, 2, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#63472c"; ctx.fillRect(-2, -height, 4, height);
  ctx.fillStyle = "#b4a17b"; ctx.fillRect(-1, -height, 1, height);
  ctx.fillStyle = "#bab4a0"; ctx.beginPath(); ctx.moveTo(-4, -height); ctx.lineTo(0, -height - 9); ctx.lineTo(4, -height); ctx.closePath(); ctx.fill();
  const wave = u => Math.sin(u * 6 - t * 3.2 + phase) * u * 4;
  // Cloth flexes from its fixed hoist, with lit folds across each fabric strip.
  for (let column = 0; column < 24; column++) {
    const u = column / 24, v = (column + 1) / 24, a = wave(u), b = wave(v);
    const gradient = ctx.createLinearGradient(0, -height, 0, -height + clothHeight);
    gradient.addColorStop(0, colors.cloth); gradient.addColorStop(1, colors.shadow);
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.moveTo(2 + u * width, -height + 7 + a); ctx.lineTo(2 + v * width, -height + 7 + b);
    ctx.lineTo(2 + v * width, -height + 7 + clothHeight + b); ctx.lineTo(2 + u * width, -height + 7 + clothHeight + a); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(12,15,11,${.06 + (1 + Math.sin(u * 6 - t * 3.2 + phase)) * .075})`; ctx.fill();
  }
  ctx.save(); ctx.translate(2 + width * .47, -height + 7 + clothHeight * .5 + wave(.47));
  ctx.transform(1, Math.cos(2.8 - t * 3.2 + phase) * .13, 0, 1, 0, 0);
  medievalEmblem(ctx, order, 0, 0, 17); ctx.restore();
  ctx.strokeStyle = "#807354"; ctx.lineWidth = .65; ctx.beginPath(); ctx.moveTo(0, -height + 5); ctx.lineTo(-15, 1); ctx.stroke();
  ctx.restore();
}

function medievalSmoke(ctx, x, y, t, seed, scale = 1) {
  for (let i = 0; i < 8; i++) {
    const age = (t * .16 + i / 8 + seed) % 1;
    const px = x + (age * 26 + Math.sin(age * 8 + seed) * 5) * scale;
    const py = y - age * 90 * scale, radius = (3 + age * 16) * scale;
    const puff = ctx.createRadialGradient(px, py, 0, px, py, radius);
    puff.addColorStop(0, `rgba(150,150,128,${Math.sin(age * Math.PI) * .18})`); puff.addColorStop(1, "rgba(130,135,119,0)");
    ctx.fillStyle = puff; ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill();
  }
}

function medievalFire(ctx, x, y, t, size = 1, brazier = false) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
  const glow = ctx.createRadialGradient(0, -6, 0, 0, -6, 28);
  glow.addColorStop(0, "#f8a74455"); glow.addColorStop(1, "#f8a70000"); ctx.fillStyle = glow;
  ctx.beginPath(); ctx.ellipse(0, -6, 28, 22, 0, 0, Math.PI * 2); ctx.fill();
  if (brazier) {
    ctx.strokeStyle = "#77634b"; ctx.lineWidth = 2.4;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * 7, 17); ctx.lineTo(side * 3, 0); ctx.stroke(); }
    ctx.fillStyle = "#322e25"; ctx.beginPath(); ctx.ellipse(0, 0, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (let layer = 0; layer < 3; layer++) {
    const sway = Math.sin(t * 7 + layer * 1.7) * (3 - layer), height = 21 - layer * 5 + Math.sin(t * 11 + layer) * 3;
    ctx.fillStyle = ["#bb4d20", "#efa52e", "#fff0a0"][layer];
    ctx.beginPath(); ctx.moveTo(-7 + layer * 2, 0);
    ctx.bezierCurveTo(-9 + layer, -height * .4, 3 + sway, -height * .55, sway, -height);
    ctx.bezierCurveTo(9 + sway, -height * .55, 8 - layer, -4, 5 - layer, 1); ctx.closePath(); ctx.fill();
  }
  for (let i = 0; i < 6; i++) {
    const age = (t * .35 + i / 6) % 1;
    ctx.globalAlpha = Math.sin(age * Math.PI) * .7; ctx.fillStyle = "#e9a85b";
    ctx.fillRect(Math.sin(i * 7 + age * 5) * (2 + age * 9), -14 - age * 33, .8, 1.7);
  }
  ctx.restore();
}

function medievalGuard(ctx, order, x, y, t, phase, facing, lantern) {
  const colors = ORDER_LIVERY[order], stride = Math.sin(t * 5 + phase), bob = Math.abs(stride) * .7;
  ctx.save(); ctx.translate(x, y); ctx.scale(facing, 1);
  ctx.fillStyle = "#070d0a80"; ctx.beginPath(); ctx.ellipse(0, 1, 8, 2.7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineCap = "round"; ctx.lineWidth = 3; ctx.strokeStyle = "#383c37";
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(side * 2, -9); ctx.lineTo(side * 2 + stride * side * 2.5, -4); ctx.lineTo(side * 3 - stride * side * 2.5, 0); ctx.stroke();
  }
  ctx.translate(0, -bob);
  ctx.fillStyle = colors.cloak; ctx.beginPath(); ctx.moveTo(-5, -23); ctx.quadraticCurveTo(-8 - stride, -14, -8 + stride * 2, -7); ctx.lineTo(3, -9); ctx.lineTo(4, -23); ctx.closePath(); ctx.fill();
  const tunic = ctx.createLinearGradient(-5, 0, 5, 0); tunic.addColorStop(0, colors.shadow); tunic.addColorStop(.55, colors.cloth); tunic.addColorStop(1, colors.shadow);
  ctx.fillStyle = tunic; ctx.beginPath(); ctx.moveTo(-4, -23); ctx.lineTo(4, -23); ctx.lineTo(6, -9); ctx.lineTo(-5, -9); ctx.closePath(); ctx.fill();
  medievalEmblem(ctx, order, 0, -17, 6);
  ctx.fillStyle = "#565f5a"; ctx.beginPath(); ctx.ellipse(0, -27, 4.4, 5.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#a8ada0"; ctx.beginPath(); ctx.ellipse(-1, -29, 3, 2.4, -.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#202821"; ctx.fillRect(-2.5, -27, 5, 1.4);
  ctx.strokeStyle = "#7e8575"; ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(4, -22); ctx.lineTo(8, -16 + stride); ctx.lineTo(11, -20); ctx.stroke();
  ctx.strokeStyle = "#685136"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(11, -16); ctx.lineTo(12, -34); ctx.stroke();
  if (lantern) {
    ctx.fillStyle = "#473d2b"; ctx.fillRect(8, -34, 8, 10);
    ctx.fillStyle = `rgba(255,202,106,${.8 + Math.sin(t * 6) * .1})`; ctx.fillRect(10, -32, 4, 6);
  } else medievalFire(ctx, 12, -34, t + phase, .3);
  ctx.restore();
}

function medievalBird(ctx, x, y, t, phase) {
  const wing = Math.sin(t * 4 + phase) * 5;
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = "#1a201c";
  ctx.beginPath(); ctx.moveTo(0, 1); ctx.quadraticCurveTo(-4, -7 - wing, -10, -2 - wing);
  ctx.quadraticCurveTo(-5, -1, -1, 3); ctx.lineTo(0, 6); ctx.lineTo(1, 3);
  ctx.quadraticCurveTo(5, -1, 10, -2 - wing); ctx.quadraticCurveTo(4, -7 - wing, 0, 1); ctx.fill(); ctx.restore();
}

function drawMedievalOutskirts(ctx, skin, t, width, height, citySize, left, top) {
  const scale = citySize / 400;
  const tier = skin.stage || 5, patrolCount = Math.ceil(tier / 2);
  ctx.save(); ctx.translate(left, top); ctx.scale(scale, scale);
  for (const [x, y, rx, ry] of [[190, 413, 225, 21], [-10, 327, 22, 8], [407, 369, 26, 42]]) {
    ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry);
    const ground = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    ground.addColorStop(0, "#78654465"); ground.addColorStop(.6, "#65563e35"); ground.addColorStop(1, "#65563e00");
    ctx.fillStyle = ground; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
  }
  medievalStandard(ctx, skin.id, -10, 327, t, -1, .5);
  if (tier >= 3) medievalStandard(ctx, skin.id, 408, 342, t, 1, 2.4);
  // Existing painted camp: left=-18%, top=64%; its fire is
  // anchored to the source illustration at (45%, 71.5%).
  const campWidth = 400 * (skin.camp || .42);
  const fireX = -72 + campWidth * .45, fireY = 256 + campWidth * .715;
  medievalSmoke(ctx, fireX, fireY - 7, t, .1, .8);
  medievalFire(ctx, fireX, fireY, t, .65);
  medievalSmoke(ctx, 403, 378, t, .4, .75);
  medievalFire(ctx, 403, 383, t + .8, .8, true);
  for (let i = 0; i < patrolCount; i++) {
    const phase = t * .18 + i * .48, travel = Math.sin(phase);
    const x = 185 + travel * 144, y = 412 + Math.cos(phase) * 4 + i * 4;
    medievalGuard(ctx, skin.id, x, y, t, i * 2, Math.cos(phase) >= 0 ? 1 : -1, skin.id === "hospitaller");
  }
  for (let i = 0; i < patrolCount; i++) {
    const phase = t * .15 + i * .5;
    medievalBird(ctx, 200 + Math.sin(phase) * 175, -10 + Math.cos(phase) * 9 + i * 8, t, i);
  }
  if (skin.id === "teutonic") {
    for (let i = 0; i < 28; i++) {
      const age = (t * (.045 + (i % 3) * .008) + i / 28) % 1;
      const x = -left / scale + ((i * .618 + age * .13) % 1) * width / scale;
      const y = -top / scale + age * height / scale;
      ctx.fillStyle = `rgba(212,225,225,${Math.sin(age * Math.PI) * .45})`;
      ctx.beginPath(); ctx.arc(x, y, .75 + (i % 3) * .25, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

const camps = [.32, .35, .38, .40, .42];
function markup(order, stage) {
  if (!ORDER_LIVERY[order]) return "";
  const tier = Math.max(1, Math.min(5, Number(stage) || 1));
  return `<span class="knight-city-effects" data-knight-order="${order}" data-knight-stage="${tier}" aria-hidden="true"><img class="knight-camp" src="assets/optimized/camp-troops-384x384-2f712333e891.webp" alt="" style="width:${camps[tier - 1] / 1.4 * 100}%"><canvas width="1" height="1"></canvas></span>`;
}
function paint(layer, seconds, preview = false) {
  const canvas = layer.querySelector("canvas");
  if (!canvas) return;
  // Fixed bitmap sizes bound memory and paint work; no per-frame layout reads.
  const size = preview ? 384 : 256;
  if (canvas.width !== size) canvas.width = canvas.height = size;
  const context = canvas.getContext("2d"), stage = Number(layer.dataset.knightStage);
  context.clearRect(0, 0, size, size);
  drawMedievalOutskirts(context, { id: layer.dataset.knightOrder, stage, camp: camps[stage - 1] }, seconds, size, size, size / 1.4, size / 7, size / 7);
}
function release(layer) {
  const canvas = layer.querySelector("canvas");
  if (canvas && canvas.width !== 1) canvas.width = canvas.height = 1;
}
root.CrownlandsKnightCityEffects = Object.freeze({ markup, paint, release });
})(globalThis);
