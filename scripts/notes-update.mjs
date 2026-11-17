// Pulls the notes repo and syncs publishable notes to src/content/blog/.
// Usage: pnpm notes:update      (or: node scripts/notes-update.mjs)
// Env:   NOTES_LOCAL_PATH — absolute vault folder. When set, skip git entirely.
// Env:   NOTES_REPO (default: MajedAlbawwab/learning_journy) — not used; clone is local.
// Prints: git status, sync summary, and any validation warnings.
// Exit code: 0 on success, 1 on git/pull failure (but never crashes the dev server).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function printSection(title, stdout, stderr) {
  if (stdout?.trim()) {
    console.log(`\n=== ${title} ===`);
    console.log(stdout.trim());
  }
  if (stderr?.trim()) {
    console.warn(`[notes:update] ${title} stderr:\n${stderr.trim()}`);
  }
}

function readState() {
  const statePath = path.join(repoRoot, '.sync-state.json');
  if (!existsSync(statePath)) return {};
  try {
    return JSON.parse(readFileSync(statePath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    state.lastSync = new Date().toISOString();
    writeFileSync(path.join(repoRoot, '.sync-state.json'), JSON.stringify(state, null, 2));
  } catch {}
}

async function main() {
  console.log(`[notes:update] source: ${isLocalVault ? `local vault ${notesDir}` : `.notes (${notesDir})`}`);

  if (isLocalVault) {
    if (!existsSync(notesDir)) {
      console.warn(`[notes:update] NOTES_LOCAL_PATH not found: ${notesDir}`);
      console.warn(`[notes:update] Nothing synced — keeping last good content.`);
      writeState(readState());
      return;
    }
    console.log('[notes:update] local-vault mode — skipping git…');
  } else {
    if (!existsSync(notesDir)) {
      console.warn(`[notes:update] .notes/ not found at ${notesDir}`);
      console.warn(`[notes:update] Run: git clone https://github.com/MajedAlbawwab/learning_journy.git .notes`);
      console.warn(`[notes:update] Keeping last good content.`);
      return;
    }
    const pull = run('git', ['-C', notesDir, 'pull', '--ff-only']);
    printSection('git pull --ff-only', pull.stdout, pull.stderr);
    if (pull.status !== 0) {
      console.warn(`[notes:update] git pull failed (exit ${pull.status}) — offline or conflict.`);
      console.warn(`[notes:update] — keeping last good content. Run "git -C .notes pull" manually to inspect.`);
      return;
    }
    const status = run('git', ['-C', notesDir, 'status', '--porcelain']);
    if (status.stdout?.trim()) {
      console.log('\n[notes:update] local .notes/ changes (not pulled):');
      console.log(status.stdout.trim());
    }
  }

  // Sync — spawn the incremental sync script so its summary is printed verbatim.
  const sync = run(process.execPath, [path.join(repoRoot, 'scripts', 'sync-notes.mjs'), notesDir, path.join(repoRoot, 'src', 'content', 'blog')], {
    cwd: repoRoot,
    env: { ...process.env, SYNC_QUIET: '1' }
  });
  process.stdout.write(sync.stdout);
  if (sync.stderr?.trim()) console.warn(sync.stderr);
  if (sync.status !== 0) {
    console.warn(`[notes:update] sync failed (exit ${sync.status}) — check warnings above.`);
    console.warn(`[notes:update] Keeping last good content.`);
    return;
  }
  writeState(readState());
  console.log('[notes:update] done. Astro dev (if running) will hot-reload on changed files.');
}

main().catch((err) => {
  console.error(`[notes:update] unexpected error: ${err.message}`);
  console.warn('[notes:update] Keeping last good content.');
  process.exit(1);
});
