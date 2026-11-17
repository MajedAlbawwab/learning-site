// Setup B: sync Obsidian notes to src/content/blog/.
// - Source: NOTES_LOCAL_PATH (explicit vault folder) or .notes/ clone.
// - Only notes with `publish: true` are copied. Invalid frontmatter is warned + skipped.
// - Incremental: writes only new/changed files; deletes stale files so the
//   destination always matches exactly what the source says is published.
// - Images: `![[image.webp]]`, `![[image.webp|400]]`, `![[image.webp|alt text]]`,
//   `![[folder/image.webp]]` are resolved by filename anywhere in the vault,
//   copied to public/notes-images/{safe-slug} with safe lowercase hyphenated names,
//   the reference is rewritten to standard Markdown `![alt](/notes-images/name.ext)`,
//   and `public/notes-images/`/.sync-images.json is maintained.
// - Wikilinks `[[Note]]` converted when target note is published (slug saved to
//   src/content/blog/.published-slugs.json for Astro to read). Otherwise plain text.
// - Missing images → console.warn + visible placeholder in the markdown.
// Volumes: webp, png, jpg, jpeg, gif, svg, avif.

import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync, unlinkSync } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
const envLocal = path.join(import.meta.dirname, '..', '.env.local');
if (existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*NOTES_LOCAL_PATH\s*=\s*(.+)\s*$/);
    if (m && !process.env.NOTES_LOCAL_PATH) process.env.NOTES_LOCAL_PATH = m[1].trim();
  }
}

const sourceDir = process.argv[2] || process.env.NOTES_LOCAL_PATH || '.notes';
const destDir = process.argv[3] || 'src/content/blog';
const dryRun = process.env.SYNC_DRY_RUN === '1';
const quiet = process.env.SYNC_QUIET === '1';
const isProd = process.env.NODE_ENV === 'production';

const SEED_FILES = ['welcome-en.md', 'welcome-ar.md'];
const IMAGE_EXTS = ['.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.avif'];
const NOTES_IMAGES_DIR = path.join(import.meta.dirname, '..', 'public', 'notes-images');
const SLUGS_PATH = path.join(destDir, '.published-slugs.json');
const IMAGES_MANIFEST = path.join(NOTES_IMAGES_DIR, '.sync-images.json');

function log(...args) {
  if (!quiet) console.log('[sync-notes]', ...args);
}

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;
  const fm = match[1];
  if (!fm) return null;
  const get = (key) => {
    const m = fm.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
    if (!m) return null;
    const v = m[1].trim().replace(/^["']|["']$/g, '');
    return v || null;
  };
  return {
    publish: get('publish') === 'true',
    draft: get('draft') === 'true',
    title: get('title'),
    description: get('description'),
    date: get('date'),
    lang: get('lang'),
    raw: match[0]
  };
}

function validate(fm) {
  const warnings = [];
  if (!fm.title) warnings.push('missing title');
  if (!fm.description) warnings.push('missing description');
  if (!fm.date) warnings.push('missing date');
  if (!fm.lang || !['ar', 'en'].includes(fm.lang)) warnings.push(`lang must be "ar" or "en", got "${fm.lang ?? ''}"`);
  return warnings;
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

async function walkImages(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkImages(full, out);
    else if (IMAGE_EXTS.some((e) => full.toLowerCase().endsWith(e))) out.push(full);
  }
  return out;
}

function baseNameFor(file) {
  return path.basename(file, '.md').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-؀-ۿ]/g, '');
}

function relativeDest(srcFile, destDir) {
  return path.join(destDir, baseNameFor(srcFile) + '.md');
}

function safeSlug(name) {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, ext).toLowerCase().trim().replace(/[^\w\-؀-ۿ]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  return base + ext;
}

function humanizeFilename(filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext).replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  return base || filename;
}

function parseEmbed(content) {
  // ![[target]] or ![[target|alt]] or ![[target|400]] or ![[target|400x300]]
  const m = content.match(/^!\[\[(.+?)\]\]$/);
  if (!m) return null;
  const inner = m[1];
  const pipe = inner.split('|');
  const target = pipe[0].trim();
  let alt = '';
  let width = null;
  let height = null;
  if (pipe[1] !== undefined) {
    alt = pipe[1].trim();
    if (/^\d+$/.test(alt)) {
      width = Number(alt);
      alt = '';
    } else if (/^\d+x\d+$/.test(alt)) {
      const [w, h] = alt.split('x').map(Number);
      width = w;
      height = h;
      alt = '';
    }
  }
  return { target, alt, width, height };
}

function isImageName(name) {
  return IMAGE_EXTS.some((e) => name.toLowerCase().endsWith(e));
}

function sameText(a, b) { return a === b; }

/**
 * Build an index of all images in the vault: basename (lowercase) -> [abs paths]
 */
async function buildImageIndex(sourceRoot) {
  const index = new Map();
  const allImages = await walkImages(sourceRoot);
  for (const abs of allImages) {
    const base = path.basename(abs).toLowerCase();
    const list = index.get(base) ?? [];
    list.push(abs);
    index.set(base, list);
  }
  return index;
}

/**
 * Resolve `![[target]]` where target may be a bare filename or a relative
 * path like `folder/image.webp`. Preference: same folder as the note,
 * then shortest relative depth, then alphabetical.
 */
function resolveImage(target, noteDir, index) {
  const norm = normalizeSlashes(target).toLowerCase();
  const candidates = [];
  const bare = path.basename(norm);
  if (index.has(bare)) candidates.push(...index.get(bare));
  // also try the exact path relative to the vault root if target had a folder
  if (norm.includes('/')) {
    // candidates already covers the basename search above
  }
  if (candidates.length === 0) return null;
  // sort by preference
  candidates.sort((a, b) => {
    const aSameDir = path.dirname(a).toLowerCase() === normalizeSlashes(noteDir).toLowerCase() ? 0 : 1;
    const bSameDir = path.dirname(b).toLowerCase() === normalizeSlashes(noteDir).toLowerCase() ? 0 : 1;
    if (aSameDir !== bSameDir) return aSameDir - bSameDir;
    const aDepth = a.split(path.sep).length;
    const bDepth = b.split(path.sep).length;
    if (aDepth !== bDepth) return aDepth - bDepth;
    return a.localeCompare(b);
  });
  return candidates[0];
}

function normalizeSlashes(p) {
  return p.replace(/\\/g, '/');
}

function escapedAlt(alt) {
  return alt.replace(/\]/g, '');
}

function humanizeAlt(target) {
  return humanizeFilename(path.basename(target));
}

function rewriteEmbeds(text, noteRelPath, noteDir, index, stats, toCopy) {
  let result = text;
  // ![ [ ... ] ]  -> ![alt](/notes-images/slug.ext) or placeholder div
  result = result.replace(/!\[\[(.+?)\]\]/g, (full) => {
    const parsed = parseEmbed(full);
    if (!parsed) return full;
    const { target, alt, width, height } = parsed;
    const basename = path.basename(target);
    const isFolderPath = target.includes('/');
    let found = null;
    let pubPath = null;

    if (isFolderPath) {
      // Try to find by exact folder suffix first
      const suffix = normalizeSlashes(target).toLowerCase();
      for (const [key, list] of index.entries()) {
        for (const abs of list) {
          if (normalizeSlashes(abs).toLowerCase().endsWith(suffix)) {
            found = abs;
            break;
          }
        }
        if (found) break;
      }
      if (!found) found = resolveImage(target, noteDir, index);
    } else {
      found = resolveImage(target, noteDir, index);
    }

    if (!found) {
      stats.missing++;
      stats.missingDetail.push(`${noteRelPath} → ${target}`);
      console.warn(`[sync-notes] missing image: ${noteRelPath} → "${target}"`);
      // Visible placeholder that survives to HTML
      return `<div class="img-missing" role="img" aria-label="Image not found: ${escapedAlt(target)}">Image not found: ${escapedAlt(target)}</div>`;
    }

    stats.found++;
    pubPath = `/notes-images/${safeSlug(path.basename(found))}`;
    if (!toCopy.has(pubPath)) toCopy.add(pubPath);
    const safe = safeSlug(path.basename(found));
    // Record copy pair
    stats.copyPairs.push({ source: found, dest: path.join(NOTES_IMAGES_DIR, safe), url: pubPath });

    const ariaAlt = alt || humanizeAlt(target);
    const attrs = [`alt="${escapedAlt(ariaAlt)}"`, `src="${pubPath}"`, `loading="lazy"`];
    if (width) attrs.push(`width="${width}"`);
    if (height) attrs.push(`height="${height}"`);
    return `![${escapedAlt(ariaAlt)}](${pubPath})<span class="fig-${safe.replace(/[^\w-]/g, '')}"></span>`;
  });

  // Standard markdown images ![alt](path) — copy relative files if present in vault.
  // Detect wiki-links separately in the remark plugin step (handled at build).
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt, p) => {
    const target = p.trim();
    if (target.startsWith('http') || target.startsWith('/notes-images/')) return full;
    const candidate = path.resolve(path.dirname(noteDir), target);
    if (existsSync(candidate) && isImageName(candidate)) {
      const slug = safeSlug(path.basename(candidate));
      const pubPath = `/notes-images/${slug}`;
      stats.found++;
      stats.copyPairs.push({ source: candidate, dest: path.join(NOTES_IMAGES_DIR, slug), url: pubPath });
      return `![${escapedAlt(alt)}](${pubPath})`;
    }
    return full;
  });

  return result;
}

async function main() {
  if (!existsSync(sourceDir)) {
    console.log(`[sync-notes] source ${sourceDir} not found — skipping (local dev mode).`);
    console.log('[sync-notes] src/content/blog already contains sample posts.');
    printSummary({ published: 0, skipped: 0, removed: 0, warnings: [], imagesFound: 0, imagesCopied: 0, imagesMissing: 0 });
    return;
  }

  if (!dryRun) await mkdir(destDir, { recursive: true });
  if (!dryRun) await mkdir(NOTES_IMAGES_DIR, { recursive: true });

  const files = await walk(sourceDir);
  const toPublish = [];
  const skipped = [];
  const warnings = [];

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
    const issues = validate(fm);
    if (issues.length) {
      warnings.push(`${path.relative(sourceDir, file)}: ${issues.join('; ')}`);
      skipped.push(`${path.basename(file)} (${issues.join('; ')})`);
      continue;
    }
    toPublish.push({ file, text, fm });
  }

  // Build vault image index
  const imageIndex = await buildImageIndex(sourceDir);

  // Build published slugs manifest for wikilink conversion at build time
  const publishedSlugs = toPublish.map((entry) => baseNameFor(entry.file));
  if (!dryRun) {
    await writeFile(SLUGS_PATH, JSON.stringify(publishedSlugs, null, 2), 'utf-8');
  }

  const stats = { found: 0, missing: 0, missingDetail: [], copyPairs: [] };
  const toCopyUrls = new Set();

  // Prepare rewritten texts first (dry-run doesn't write)
  const rewritten = [];
  for (const entry of toPublish) {
    const rel = path.relative(sourceDir, entry.file);
    const noteDir = path.dirname(entry.file);
    const newText = rewriteEmbeds(entry.text, rel, noteDir, imageIndex, stats, toCopyUrls);
    rewritten.push({ ...entry, newText, rel });
  }

  if (dryRun) {
    console.log(`[sync-notes] DRY RUN — ${toPublish.length} note(s) would be published:`);
    for (const entry of toPublish) console.log(`  + ${path.relative(sourceDir, entry.file)}`);
    for (const s of skipped) console.log(`  - ${s}`);
    if (warnings.length) {
      console.log(`[sync-notes] warnings:`);
      for (const w of warnings) console.log(`  ! ${w}`);
    }
    printSummary({ published: toPublish.length, skipped: skipped.length, removed: 0, warnings, imagesFound: stats.found, imagesCopied: 0, imagesMissing: stats.missing });
    return;
  }

  // Prune: destination must exactly match the publish set.
  const wantFiles = new Set(toPublish.map((entry) => path.basename(relativeDest(entry.file, destDir))));
  const wantImages = new Set(toCopyUrls);
  let removed = 0;
  if (existsSync(destDir)) {
    for (const name of await readdir(destDir)) {
      if (name === '.published-slugs.json') continue;
      if (!name.endsWith('.md')) continue;
      if (!wantFiles.has(name)) {
        unlinkSync(path.join(destDir, name));
        removed++;
        log(`pruned ${name} (not in publish set)`);
      }
    }
    for (const seed of SEED_FILES) {
      const seedPath = path.join(destDir, seed);
      if (existsSync(seedPath)) {
        unlinkSync(seedPath);
        removed++;
        log(`removed seed ${seed}`);
      }
    }
  }

  // Copy images (incremental)
  let copiedImages = 0;
  const copiedSet = new Set();
  for (const pair of stats.copyPairs) {
    if (copiedSet.has(pair.dest)) continue;
    // Compare bytes
    if (existsSync(pair.dest)) {
      const a = await readFile(pair.source);
      const b = await readFile(pair.dest);
      if (Buffer.compare(a, b) === 0) continue;
    }
    await copyFile(pair.source, pair.dest);
    copiedSet.add(pair.dest);
    copiedImages++;
    log(`copied image ${pair.url}`);
  }

  // Prune public/notes-images to only referenced images (keep manifest file)
  if (existsSync(NOTES_IMAGES_DIR)) {
    for (const name of await readdir(NOTES_IMAGES_DIR)) {
      if (name === '.sync-images.json') continue;
      const url = `/notes-images/${name}`;
      if (!wantImages.has(url)) {
        unlinkSync(path.join(NOTES_IMAGES_DIR, name));
        removed++;
        log(`pruned ${url}`);
      }
    }
  }

  // Write manifest
  await writeFile(IMAGES_MANIFEST, JSON.stringify([...wantImages], null, 2), 'utf-8');

  // Write notes (incremental)
  let published = 0;
  for (const entry of rewritten) {
    const destFile = relativeDest(entry.file, destDir);
    if (existsSync(destFile)) {
      const current = await readFile(destFile, 'utf-8');
      if (sameText(current, entry.newText)) continue;
    }
    await writeFile(destFile, entry.newText, 'utf-8');
    published++;
    log(`published ${path.basename(entry.file)}`);
  }

  printSummary({ published, skipped: skipped.length, removed, warnings, imagesFound: stats.found, imagesCopied: copiedImages, imagesMissing: stats.missing, missingDetail: stats.missingDetail });
}

function printSummary({ published, skipped, removed, warnings, imagesFound, imagesCopied, imagesMissing, missingDetail }) {
  const parts = [`${published} published`, `${skipped} skipped`, `${removed} removed`];
  if (imagesFound !== undefined) parts.push(`${imagesFound} image(s) found`, `${imagesCopied} copied`, `${imagesMissing} missing`);
  console.log(`[sync-notes] summary: ${parts.join(' · ')}`);
  if (missingDetail?.length) {
    console.log('[sync-notes] missing images:');
    for (const m of missingDetail) console.log(`  ! ${m}`);
  }
  if (warnings?.length) {
    console.log(`[sync-notes] warnings:`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
