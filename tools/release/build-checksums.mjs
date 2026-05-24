#!/usr/bin/env node
// Build checksums.txt from the release output directory.
//
// Walks the given directory (default: `release/`) and emits one
// `<sha256>  <relative-path>\n` line per regular file. The output
// path defaults to `release/checksums.txt` and is excluded from the
// scan so re-runs are idempotent.
//
// Phase 8 §14 M11 deliverable: "checksums.txt published" alongside
// each release artifact set.
//
// Usage:
//   node tools/release/build-checksums.mjs                  # scans release/
//   node tools/release/build-checksums.mjs --dir dist       # alternate dir
//   node tools/release/build-checksums.mjs --out sums.txt   # alternate out file

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

function parseArgs(argv) {
  let dir = 'release';
  let outPath;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--dir' && i + 1 < argv.length) {
      dir = argv[++i];
    } else if (flag === '--out' && i + 1 < argv.length) {
      outPath = argv[++i];
    } else if (flag === '--help' || flag === '-h') {
      console.log(
        'Usage: build-checksums.mjs [--dir <release-dir>] [--out <checksums-path>]',
      );
      process.exit(0);
    } else {
      console.error(`unknown arg: ${flag}`);
      process.exit(2);
    }
  }
  return { dir, outPath: outPath ?? path.join(dir, 'checksums.txt') };
}

async function walk(root, predicate) {
  const out = [];
  async function visit(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(full);
      } else if (entry.isFile() && predicate(full)) {
        out.push(full);
      }
    }
  }
  await visit(root);
  return out;
}

function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function main() {
  const { dir, outPath } = parseArgs(process.argv.slice(2));
  const absDir = path.resolve(dir);
  const absOut = path.resolve(outPath);

  // Verify the input directory exists. ENOENT here is a deployment
  // bug, not "no files to hash" — fail loudly.
  let stat;
  try {
    stat = await fs.stat(absDir);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`[build-checksums] directory not found: ${absDir}`);
      process.exit(1);
    }
    throw err;
  }
  if (!stat.isDirectory()) {
    console.error(`[build-checksums] not a directory: ${absDir}`);
    process.exit(1);
  }

  const files = (
    await walk(absDir, (p) => p !== absOut)
  ).sort();
  if (files.length === 0) {
    console.error(`[build-checksums] no artifacts in ${absDir}`);
    process.exit(1);
  }

  const lines = [];
  for (const file of files) {
    const hash = await sha256OfFile(file);
    const rel = path.relative(absDir, file).split(path.sep).join('/');
    lines.push(`${hash}  ${rel}`);
  }

  await fs.mkdir(path.dirname(absOut), { recursive: true });
  await fs.writeFile(absOut, `${lines.join('\n')}\n`, 'utf-8');
  console.log(
    `[build-checksums] wrote ${path.relative(process.cwd(), absOut)} (${String(lines.length)} files)`,
  );
}

await main();
