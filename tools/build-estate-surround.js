/* Encode only the reviewed outpainting; never rewrite approved estate art. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const sourceDir = 'docs/art-sources/inner-city-estate/';
async function main() {
  const recipe = JSON.parse(fs.readFileSync(path.join(root, sourceDir, 'surround-v5-prompts.json'), 'utf8'));
  const art = JSON.parse(fs.readFileSync(path.join(root, sourceDir, 'art-record.json'), 'utf8'));
  for (const [key, crop] of Object.entries(recipe.crops)) {
    const file = 'assets/inner-city-estate/terrain-surround-' + key + '.webp';
    await sharp(path.join(root, sourceDir, recipe.output)).extract(crop).webp({quality:recipe.webpQuality}).toFile(path.join(root, file));
    await record(file, art.runtime);
  }
  for (const file of [recipe.guide, recipe.output, 'surround-v5-prompts.json']) await record(sourceDir + file, art.sources);
  art.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(root, sourceDir, 'art-record.json'), JSON.stringify(art, null, 2) + '\n');
}
async function record(file, entries) {
  const bytes = fs.readFileSync(path.join(root, file)), text = file.endsWith('.json');
  const entry = {path:file,sha256:crypto.createHash('sha256').update(text ? bytes.toString('utf8').replace(/\r\n/g, '\n') : bytes).digest('hex')};
  if (text) entry.hashEncoding = 'utf8-lf';
  else {const m = await sharp(bytes).metadata(); Object.assign(entry, {width:m.width,height:m.height,hasAlpha:m.hasAlpha});}
  const index = entries.findIndex(item => item.path === file);
  if (index < 0) entries.push(entry); else entries[index] = entry;
  entries.sort((a,b) => a.path.localeCompare(b.path));
}
main().catch(error => {console.error(error);process.exitCode=1;});
