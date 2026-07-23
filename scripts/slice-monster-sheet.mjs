/**
 * Split a square 2x2 monster pose sheet into four optimized WebP frames.
 *
 * Layout:
 *   aloof       | challenge
 *   vanquished  | triumphant
 *
 * Usage:
 *   npm run assets:slice-monster -- <sheet.png> <output-directory>
 *   npm run assets:slice-monster -- --quality 86 --max 512 <sheet.png> <output-directory>
 *   npm run assets:slice-monster -- --mask-spec <mask.json> <sheet.png> <output-directory>
 *
 * Requires cwebp (brew install webp).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POSES = [
  { name: 'aloof', column: 0, row: 0 },
  { name: 'challenge', column: 1, row: 0 },
  { name: 'vanquished', column: 0, row: 1 },
  { name: 'triumphant', column: 1, row: 1 },
];

const args = process.argv.slice(2);
const paths = [];
let cropSpecPath;
let maskSpecPath;
let maxDimension = 512;
let quality = 86;

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--max') maxDimension = Number(args[index += 1]);
  else if (args[index] === '--quality') quality = Number(args[index += 1]);
  else if (args[index] === '--crop-spec') cropSpecPath = resolve(projectRoot, args[index += 1]);
  else if (args[index] === '--mask-spec') maskSpecPath = resolve(projectRoot, args[index += 1]);
  else paths.push(args[index]);
}

if (paths.length !== 2) {
  console.error('用法：npm run assets:slice-monster -- <sheet.png> <output-directory>');
  process.exit(1);
}

if (cropSpecPath && maskSpecPath) {
  console.error('--crop-spec 与 --mask-spec 不能同时使用。');
  process.exit(1);
}

if (!Number.isInteger(maxDimension) || maxDimension <= 0) {
  console.error('--max 必须是正整数。');
  process.exit(1);
}

if (!Number.isFinite(quality) || quality < 0 || quality > 100) {
  console.error('--quality 必须在 0 到 100 之间。');
  process.exit(1);
}

try {
  execFileSync('cwebp', ['-version'], { stdio: 'ignore' });
  execFileSync('swift', ['--version'], { stdio: 'ignore' });
} catch {
  console.error('切图需要 cwebp 与 macOS Swift 工具链。');
  process.exit(1);
}

const source = resolve(projectRoot, paths[0]);
const outputDirectory = resolve(projectRoot, paths[1]);
const png = readFileSync(source);

if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
  console.error('母版必须是有效的 PNG 文件。');
  process.exit(1);
}

const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
if (width !== height || width % 2 !== 0) {
  console.error(`母版必须是边长为偶数的正方形，当前为 ${width}x${height}。`);
  process.exit(1);
}

const frameDimension = width / 2;
const finalDimension = Math.min(frameDimension, maxDimension);
const defaultCrops = Object.fromEntries(POSES.map((pose) => [pose.name, {
  x: pose.column * frameDimension,
  y: pose.row * frameDimension,
  width: frameDimension,
  height: frameDimension,
}]));
const crops = maskSpecPath
  ? undefined
  : cropSpecPath
    ? JSON.parse(readFileSync(cropSpecPath, 'utf8'))
    : defaultCrops;
const maskConfiguration = maskSpecPath
  ? JSON.parse(readFileSync(maskSpecPath, 'utf8'))
  : undefined;

if (crops) {
  for (const pose of POSES) {
    const crop = crops[pose.name];
    if (!crop
        || ![crop.x, crop.y, crop.width, crop.height].every(Number.isInteger)
        || crop.x < 0
        || crop.y < 0
        || crop.width <= 0
        || crop.height <= 0
        || crop.x + crop.width > width
        || crop.y + crop.height > height) {
      console.error(`无效的 ${pose.name} 裁区。`);
      process.exit(1);
    }
  }
}

mkdirSync(outputDirectory, { recursive: true });
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'wordbuddy-monster-'));

try {
  if (maskConfiguration) {
    execFileSync('swift', [
      resolve(projectRoot, 'scripts/mask-monster-sheet.swift'),
      source,
      temporaryDirectory,
      String(finalDimension),
      JSON.stringify(maskConfiguration),
    ], { stdio: 'inherit' });
  } else {
    execFileSync('swift', [
      resolve(projectRoot, 'scripts/normalize-monster-sheet.swift'),
      source,
      temporaryDirectory,
      String(finalDimension),
      '4',
      JSON.stringify(crops),
    ]);
  }

  for (const pose of POSES) {
    const output = resolve(outputDirectory, `${pose.name}.webp`);
    execFileSync('cwebp', [
      '-quiet',
      '-q', String(quality),
      '-alpha_q', '100',
      '-alpha_filter', 'best',
      '-m', '6',
      resolve(temporaryDirectory, `${pose.name}.png`),
      '-o', output,
    ]);

    const sizeKb = Math.round(statSync(output).size / 1024);
    console.log(`${relative(projectRoot, output)}  ${finalDimension}x${finalDimension}  ${sizeKb} KB`);
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}