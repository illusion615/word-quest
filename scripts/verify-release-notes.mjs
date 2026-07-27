import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const packageDocument = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));
const releaseDocument = JSON.parse(await readFile(
  resolve(projectRoot, 'src/data/release-notes.json'),
  'utf8',
));
const changelog = await readFile(resolve(projectRoot, 'CHANGELOG.md'), 'utf8');
const releases = Array.isArray(releaseDocument.releases) ? releaseDocument.releases : [];
const current = releases.find((release) => release.version === packageDocument.version);

if (!current) {
  throw new Error(`release-notes.json is missing version ${packageDocument.version}.`);
}
if (!current.title?.trim() || !current.summary?.trim() || !Array.isArray(current.highlights)) {
  throw new Error(`Release ${packageDocument.version} is missing user-facing content.`);
}
if (current.highlights.length < 1 || current.highlights.some((item) => (
  !item.title?.trim() || !item.description?.trim()
))) {
  throw new Error(`Release ${packageDocument.version} needs complete user-facing highlights.`);
}
if (!changelog.includes(`## ${packageDocument.version} -`)) {
  throw new Error(`CHANGELOG.md is missing version ${packageDocument.version}.`);
}
if (new Set(releases.map((release) => release.version)).size !== releases.length) {
  throw new Error('release-notes.json contains duplicate versions.');
}

function gitChangedFiles(...arguments_) {
  try {
    return execFileSync('git', arguments_, { cwd: projectRoot, encoding: 'utf8' })
      .split('\n')
      .map((path) => path.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function gitFile(reference, path) {
  try {
    return execFileSync('git', ['show', `${reference}:${path}`], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
  } catch {
    return '';
  }
}

const workingChanges = [
  ...gitChangedFiles('diff', '--name-only', 'HEAD'),
  ...gitChangedFiles('ls-files', '--others', '--exclude-standard'),
];
const comparisonReference = workingChanges.length > 0 ? 'HEAD' : 'HEAD^';
const changedFiles = workingChanges.length > 0
  ? [...new Set(workingChanges)]
  : gitChangedFiles('diff', '--name-only', 'HEAD^', 'HEAD');
const userFacingChange = changedFiles.some((path) => (
  (/^src\/.*\.(?:css|ts|tsx)$/u.test(path) && !/\.test\.(?:ts|tsx)$/u.test(path))
  || /^public\/data\/(?:exam-banks|lexicon|word-coach)\//u.test(path)
));

if (userFacingChange) {
  const required = [
    'CHANGELOG.md',
    'package-lock.json',
    'package.json',
    'src/data/release-notes.json',
  ];
  const missing = required.filter((path) => !changedFiles.includes(path));
  if (missing.length > 0) {
    throw new Error(
      `User-facing changes must update version, What's New, and changelog in the same commit. Missing: ${missing.join(', ')}`,
    );
  }
  const previousPackageText = gitFile(comparisonReference, 'package.json');
  const previousVersion = previousPackageText
    ? JSON.parse(previousPackageText).version
    : null;
  if (previousVersion === packageDocument.version) {
    throw new Error(
      `User-facing changes must bump the app version. Current and previous version are both ${packageDocument.version}.`,
    );
  }
}

console.log(`Verified user-facing release notes for ${packageDocument.version}.`);