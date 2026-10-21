"use strict";
const W=1448,H=1086;
const n=value=>Number(value.toFixed(3));
function ribbon(points) {
  const shapes = [];
  points.forEach(([x, y, width], i) => {
    shapes.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(width / 2)}"/>`);
    if (!i) return;
    const [px, py, pw] = points[i - 1];
    const length = Math.hypot(x - px, y - py);
    if (!length) return;
    const nx = (y - py) / length, ny = (px - x) / length;
    const corners = [[px + nx * pw / 2, py + ny * pw / 2], [x + nx * width / 2, y + ny * width / 2],
      [x - nx * width / 2, y - ny * width / 2], [px - nx * pw / 2, py - ny * pw / 2]];
    shapes.push(`<polygon points="${corners.map(p => p.map(n).join(",")).join(" ")}"/>`);
  });
  return shapes.join("");
}

function roadsSvg(roads, material, seed = 0) {
  const phase = (seed % 65536) / 1000;
  // Uneven, translucent shoulders stay inside the existing road envelope. The
  // underlying meadow shows between worn dirt patches; there is no outline.
  const shoulders = [[1, 32], [.97, 100], [.91, 181], [.84, 232], [.73, 255]].map(([scale, shade]) => {
    const painted = roads.map(points => ribbon(points.map(([x, y, width]) => {
      const wear = Math.max(0, .8 + .65 * Math.sin(x * .61 + y * .37 + phase)
        + .35 * Math.sin(x * 1.37 - y * .83 - phase));
      return [x, y, width * scale - wear];
    }))).join("");
    return `<g fill="rgb(${shade},${shade},${shade})">${painted}</g>`;
  }).join("");
  const tracks = roads.flatMap(points => [-1, 1].map(side => {
    const line = points.map(([x, y, width], i) => {
      const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
      const dx = after[0] - before[0], dy = after[1] - before[1], len = Math.hypot(dx, dy) || 1;
      return `${n(x + side * dy / len * width * .22)},${n(y - side * dx / len * width * .22)}`;
    }).join(" ");
    return `<polyline points="${line}" fill="none" stroke="#8a743f" stroke-width=".8" stroke-dasharray="3 29 7 41" stroke-dashoffset="${seed % 29}" opacity=".12"/>`;
  })).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <mask id="road">${shoulders}</mask>
      <pattern id="earth" width="384" height="384" patternUnits="userSpaceOnUse" x="${seed % 384}" y="${(seed >>> 8) % 384}">
        <image href="data:image/png;base64,${material.toString("base64")}" width="384" height="384"/>
      </pattern>
    </defs>
    <g mask="url(#road)">
      <rect width="${W}" height="${H}" fill="#c8ae70"/>
      <rect width="${W}" height="${H}" fill="url(#earth)" opacity=".65"/>
      ${tracks}
    </g>
  </svg>`);
}

module.exports={roadsSvg};
