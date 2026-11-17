// Starts `astro dev` and, in the background, pulls .notes/ + syncs every 30s
// so local dev mirrors the Obsidian vault (or the GitHub notes repo) without
// a manual step. If NOTES_LOCAL_PATH is set, the poller reads that folder
// directly (no git at all) — handy for previewing unpushed notes.
// Usage: pnpm dev:notes
// Ctrl+C kills both the watcher and the dev server.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
const envLocal = path.join(import.meta.dirname, '..', '.env.local');
if (existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*NOTES_LOCAL_PATH\s*=\s*(.+)\s*$/);
    if (m && !process.env.NOTES_LOCAL_PATH) process.env.NOTES_LOCAL_PATH = m[1].trim();
  }
}

const repoRoot = path.join(import.meta.dirname, '..');
const notesDir = process.env.NOTES_LOCAL_PATH ? path.join(process.env.NOTES_LOCAL_PATH) : path.join(repoRoot, '.notes');
const isLocalVault = Boolean(process.env.NOTES_LOCAL_PATH);
const POLL_MS = 30_000;

let lastHead = null;
let lastMtimes = null;

function getHead() {
  if (isLocalVault || !existsSync(path.join(notesDir, '.git'))) return null;
  const r = spawnSync('git', ['-C', notesDir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  return r.stdout?.trim() || null;
}

function getMtimes(dir, acc = new Map()) {
  if (!existsSync(dir)) return acc;
  for (const name of require('node:fs').readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name.startsWith('.') || name.name === 'node_modules') continue;
      getMtimes(full, acc);
    } else if (name.name.endsWith('.md') || /\.(png|jpg|jpeg|gif|webp|svg|avif)$/i.test(name.name)) {
      acc.set(full, statSync(full).mtimeMs);
    }
  }
  return acc;
}

function mtimesChanged(a, b) {
  if (!a || !b) return a !== b;
  if (a.size !== b.size) return true;
  for (const [k, v] of a) if (b.get(k) !== v) return true;
  return false;
}

function runUpdate(label) {
  console.log(`\n[dev:notes] ${label} — pulling notes + syncing…`);
  const res = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'notes-update.mjs')], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000
  });
  process.stdout.write(res.stdout ?? '');
  if (res.stderr?.trim()) process.stderr.write(res.stderr);
  if (res.status !== 0) {
    console.warn(`[dev:notes] notes:update exited ${res.status} — dev server keeps last good content.`);
  }
}

function snapshot() {
  lastHead = getHead();
  lastMtimes = getMtimes(notesDir);
}

async function main() {
  console.log(`[dev:notes] notes source: ${isLocalVault ? `local vault ${notesDir}` : `.notes/ (${notesDir})`}`);
  runUpdate('initial');
  snapshot();

  console.log('[dev:notes] starting astro dev…');
  const dev = spawn('pnpm', ['astro', 'dev'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  });
  dev.stdout.on('data', (d) => process.stdout.write(d));
  dev.stderr.on('data', (d) => process.stderr.write(d));
  dev.on('error', (err) => {
    console.error(`[dev:notes] failed to start astro dev: ${err.message}`);
    clearInterval(timer);
    process.exit(1);
  });
  dev.on('exit', (code) => {
    console.log(`[dev:notes] astro dev exited (code ${code}). Stopping watcher.`);
    clearInterval(timer);
    process.exit(code ?? 0);
  });

  const timer = setInterval(() => {
    const head = getHead();
    const mtimes = getMtimes(notesDir);
    const changed = head !== lastHead || mtimesChanged(lastMtimes, mtimes);
    if (!changed) return;
    lastHead = head;
    lastMtimes = mtimes;
    runUpdate('change detected');
  }, POLL_MS);

  const shutdown = () => {
    console.log('\n[dev:notes] shutting down…');
    clearInterval(timer);
    dev.kill('SIGTERM');
    setTimeout(() => process.exit(0), 2000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(`[dev:notes] error: ${err.message}`);
  process.exit(1);
});
