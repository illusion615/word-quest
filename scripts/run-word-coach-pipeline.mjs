import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatorPath = resolve(projectRoot, 'scripts/generate-word-coach.mjs');
const args = process.argv.slice(2);
let child = null;
let stopping = false;

for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error) => {
    if (error.code !== 'EPIPE') throw error;
    stopping = true;
    child?.kill('SIGTERM');
  });
}

function run(scriptArgs) {
  return new Promise((resolveRun, rejectRun) => {
    child = spawn(process.execPath, scriptArgs, {
      cwd: projectRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      child = null;
      resolveRun(signal ? 128 + 15 : (code ?? 1));
    });
  });
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    stopping = true;
    child?.kill(signal);
  });
}

const generatorCode = await run([generatorPath, ...args]);
process.exit(stopping ? 143 : generatorCode);