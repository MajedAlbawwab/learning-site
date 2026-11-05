// Setup B: copies publishable notes from a sibling notes repo checkout
// into src/content/blog/. Only notes with `publish: true` are copied.
// Usage: node scripts/sync-notes.mjs [.notes] [src/content/blog]
// Set SYNC_DRY_RUN=1 to list what would be published without copying.

import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const sourceDir = process.argv[2] || '.notes';
const destDir = process.argv[3] || 'src/content/blog';
const dryRun = process.env.SYNC_DRY_RUN === '1';
const isProd = process.env.NODE_ENV === 'production';

// Seed posts that only exist when no .notes checkout is present (local dev).
const SEED_FILES = ['welcome-en.md', 'welcome-ar.md'];

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;
  const fm = match[1];
  if (!fm) return null;
  const get = (key) => {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  };
  return {
    publish: get('publish') === 'true',
    draft: get('draft') === 'true',
    raw: match[0]
  };
}

async function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      await walk(full, out);
    } else if (entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

async function copyAttachments(srcDir, destRoot) {
  const imagesDir = path.join(srcDir, 'images');
  if (existsSync(imagesDir)) {
    await mkdir(path.join(destRoot, 'images'), { recursive: true });
    for (const file of await readdir(imagesDir)) {
      if (dryRun) {
        console.log(`[sync-notes] would copy image images/${file}`);
        continue;
      }
      await copyFile(path.join(imagesDir, file), path.join(destRoot, 'images', file));
    }
  }
}

async function main() {
  if (!existsSync(sourceDir)) {
    console.log(`[sync-notes] source ${sourceDir} not found — skipping (local dev mode).`);
    console.log('[sync-notes] src/content/blog already contains sample posts.');
    return;
  }
  if (!dryRun) await mkdir(destDir, { recursive: true });

  const files = await walk(sourceDir);
  const toPublish = [];
  const skipped = [];
  for (const file of files) {
    const text = await readFile(file, 'utf-8');
    const fm = parseFrontmatter(text);
    if (!fm?.publish) {
      skipped.push(`${path.basename(file)} (no publish: true)`);
      continue;
    }
    if (fm.draft && isProd) {
      skipped.push(`${path.basename(file)} (draft, prod)`);
      continue;
    }
    toPublish.push({ file, text });
  }

  if (dryRun) {
    console.log(`[sync-notes] DRY RUN — ${toPublish.length} note(s) would be published:`);
    for (const { file } of toPublish) console.log(`  + ${path.relative(sourceDir, file)}`);
    for (const s of skipped) console.log(`  - ${s}`);
    console.log(`[sync-notes] dry run — no files copied.`);
    return;
  }

  // Prune: remove files in destDir that aren't in the publish set,
  // plus local-dev seed files (welcome-*) — real notes are the source of truth.
  if (existsSync(destDir)) {
    const keep = new Set();
    for (const { file } of toPublish) {
      const base = path.basename(file, '.md').toLowerCase().trim().replace(/\s+/g, '-');
      keep.add(`${base}.md`);
    }
    for (const name of await readdir(destDir)) {
      if (!name.endsWith('.md')) continue;
      if (!keep.has(name)) {
        unlinkSync(path.join(destDir, name));
        console.log(`[sync-notes] pruned ${name} (not in publish set)`);
      }
    }
    for (const seed of SEED_FILES) {
      const seedPath = path.join(destDir, seed);
      if (existsSync(seedPath)) {
        unlinkSync(seedPath);
        console.log(`[sync-notes] removed seed ${seed}`);
      }
    }
  }

  let copied = 0;
  for (const { file, text } of toPublish) {
    const base = path.basename(file, '.md').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-؀-ۿ]/g, '');
    await writeFile(path.join(destDir, `${base}.md`), text, 'utf-8');
    await copyAttachments(path.dirname(file), destDir);
    copied++;
    console.log(`[sync-notes] published ${base}.md`);
  }
  console.log(`[sync-notes] done — ${copied} file(s) published.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
