/**
 * Convert monster / logo PNGs to optimized WebP for the web build.
 *
 * The battle art is authored large (1024²) but the deployed site only ever shows
 * it small, so shipping PNG wastes bandwidth. WebP with alpha cuts each frame by
 * ~90% at the same size and even more when downscaled. Every modern browser
 * (Chrome, Edge, Safari 14+, Firefox) supports WebP.
 *
 * Workflow:
 *   1. Drop the source PNG(s) into src/assets/... (these stay local; *.png under
 *      src/assets is gitignored so masters never bloat the repo).
 *   2. Run this script; it writes an optimized .webp next to each .png.
 *   3. The app imports the .webp; commit those.
 *
 * Usage:
 *   npm run assets:optimize                 # all src/assets PNGs → WebP, max 512px
 *   npm run assets:optimize -- --max 1024   # keep large frames (single-monster art)
 *   npm run assets:optimize -- --quality 86 src/assets/monsters/elite
 *
 * Requires cwebp (brew install webp). Only a local authoring step — never runs in CI.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ROOTS = [resolve(projectRoot, 'src/assets')];

const args = process.argv.slice(2);
let maxDimension = 512;
let quality = 82;
const explicitPaths = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--max') maxDimension = Number(args[index += 1]);
  else if (args[index] === '--quality') quality = Number(args[index += 1]);
  else explicitPaths.push(resolve(projectRoot, args[index]));
}
const roots = explicitPaths.length > 0 ? explicitPaths : DEFAULT_ROOTS;

function assertCwebp() {
  try {
    execFileSync('cwebp', ['-version'], { stdio: 'ignore' });
  } catch {
    console.error('缺少 cwebp。请先安装：brew install webp');
    process.exit(1);
  }
}

function collectPngs(target) {
  const stats = statSync(target);
  if (stats.isFile()) return target.toLowerCase().endsWith('.png') ? [target] : [];
  return readdirSync(target, { recursive: true })
    .filter((name) => typeof name === 'string' && name.toLowerCase().endsWith('.png'))
    .map((name) => join(target, name));
}

/** PNG stores width as a big-endian uint32 at byte offset 16 of the IHDR chunk. */
function pngWidth(file) {
  return readFileSync(file).readUInt32BE(16);
}

assertCwebp();

const pngFiles = [...new Set(roots.flatMap(collectPngs))].sort();
if (pngFiles.length === 0) {
  console.log('没有找到需要优化的 PNG。');
  process.exit(0);
}

let originalTotal = 0;
let webpTotal = 0;
for (const png of pngFiles) {
  const webp = png.replace(/\.png$/i, '.webp');
  const width = pngWidth(png);
  const resize = width > maxDimension ? ['-resize', String(maxDimension), '0'] : [];
  execFileSync('cwebp', ['-quiet', '-q', String(quality), ...resize, png, '-o', webp]);

  const originalSize = statSync(png).size;
  const webpSize = statSync(webp).size;
  originalTotal += originalSize;
  webpTotal += webpSize;
  const saved = Math.round((1 - webpSize / originalSize) * 100);
  const finalWidth = width > maxDimension ? maxDimension : width;
  console.log(
    `${relative(projectRoot, webp)}  ${Math.round(webpSize / 1024)} KB `
    + `(${finalWidth}px, -${saved}%)`,
  );
}

console.log(
  `\n合计：${(originalTotal / 1048576).toFixed(1)} MB → `
  + `${(webpTotal / 1048576).toFixed(2)} MB `
  + `(省 ${Math.round((1 - webpTotal / originalTotal) * 100)}%，共 ${pngFiles.length} 张)`,
);
