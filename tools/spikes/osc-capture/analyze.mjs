// One-shot analyzer for spike-b NDJSON. Aggregates address patterns,
// prints frequencies + samples. Not part of the package; thrown away
// in M1.10.
import fs from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node analyze.mjs <path-to.ndjson>');
  process.exit(1);
}

const lines = fs.readFileSync(path, 'utf-8').split('\n').filter(Boolean);
const patterns = new Map();
const samples = new Map();

for (const line of lines) {
  try {
    const obj = JSON.parse(line);
    const pattern = obj.address.replace(/\/\d+/g, '/N');
    patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
    if (!samples.has(pattern)) samples.set(pattern, obj);
  } catch {
    // skip malformed
  }
}

const sorted = [...patterns.entries()].sort((a, b) => b[1] - a[1]);

console.log('Total lines:', lines.length);
console.log('Unique address patterns:', patterns.size);
console.log('');
console.log('ALL PATTERNS BY FREQUENCY:');
for (const [p, c] of sorted) {
  const sample = samples.get(p);
  const argStr = JSON.stringify(sample.args).slice(0, 60);
  console.log(`${String(c).padStart(7)} | ${p.padEnd(70)} | args=${argStr}`);
}
