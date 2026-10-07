/* Development reference for painting the estate; never shipped as scene art. */
const fs = require('node:fs');
const path = require('node:path');
const estate = require('../inner-city-estate');
const target = path.resolve(__dirname, '../docs/art-sources/inner-city-estate/layout-guide.svg');
const scale = ([x, y]) => [x * 14.48, y * 10.86];
const point = p => scale(p).join(',');
const roads = estate.roads.map(r => `<path d="M${r.points.map(point).join(' L')}"/>`).join('');
const wall = 'M449,510 L449,381 L492,316 L579,261 L869,261 L970,326 L999,533 L941,630 L796,663 M652,663 L507,620 L449,510';
const plots = estate.buildings.map(b => {
  const x = b.hotspot.left * 14.48, y = b.hotspot.top * 10.86;
  const w = b.footprint.width * 14.48, h = b.footprint.height * 10.86;
  return `<rect x="${x-w/2}" y="${y-h/2}" width="${w}" height="${h}" rx="14" fill="#e7d5a3" stroke="#9e543f" stroke-width="2"/>`;
}).join('');
const cottages = estate.cottages.map(c => `<rect x="${c.hotspot.left*14.48-9}" y="${c.hotspot.top*10.86-9}" width="18" height="18" rx="4" fill="#a88243"/>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1448" height="1086" viewBox="0 0 1448 1086"><rect width="1448" height="1086" fill="#b1ad68"/><path d="M0,0H1448V140Q1200,100 900,160T400,130T0,160Z" fill="#8f8772"/><path d="M0,160Q240,130 220,320T330,640Q100,780 0,760Z" fill="#6c7945"/><path d="M0,710Q150,660 260,730T500,890L580,1086H0Z" fill="#c8af69"/><g fill="none" stroke="#d0b986" stroke-width="9" stroke-linejoin="round" stroke-linecap="round">${roads}</g><path d="${wall}" fill="none" stroke="#ece0bc" stroke-width="18" stroke-linejoin="round"/>${cottages}${plots}</svg>`;
fs.writeFileSync(target, svg);
console.log(target);
