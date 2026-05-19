#!/usr/bin/env node
// UDP listener for CasparCG OSC bundles. Prints addresses + args to stdout.
// Optionally writes NDJSON to a file for later analysis / fixture replay.
//
// Usage:
//   node osc-capture.mjs                       # listens on 0.0.0.0:6250, stdout only
//   node osc-capture.mjs --port 6251           # different port
//   node osc-capture.mjs --ndjson session.ndjson    # also append-write NDJSON
//   node osc-capture.mjs --filter /channel/1   # only show addresses matching prefix
//   node osc-capture.mjs --silent              # suppress stdout (useful with --ndjson)

import dgram from 'node:dgram';
import fs from 'node:fs';
import process from 'node:process';
import { parsePacket, flatten } from './osc.mjs';

const args = parseArgs(process.argv.slice(2));
const PORT = Number(args.port ?? 6250);
const HOST = String(args.host ?? '0.0.0.0');
const NDJSON_PATH = args.ndjson ? String(args.ndjson) : null;
const FILTER = args.filter ? String(args.filter) : null;
const SILENT = Boolean(args.silent);

const ndjson = NDJSON_PATH ? fs.createWriteStream(NDJSON_PATH, { flags: 'a' }) : null;

const socket = dgram.createSocket('udp4');

socket.on('error', (err) => {
  console.error(`[osc-capture] socket error: ${err.message}`);
  socket.close();
  process.exit(1);
});

socket.on('message', (msg, rinfo) => {
  const recvTs = new Date().toISOString();
  const packet = parsePacket(msg);
  if (!packet) {
    if (!SILENT) console.error(`[osc-capture] unparseable packet from ${rinfo.address}:${rinfo.port}`);
    return;
  }
  const messages = flatten(packet);
  for (const m of messages) {
    if (FILTER && !m.address.startsWith(FILTER)) continue;
    const entry = {
      ts: recvTs,
      from: `${rinfo.address}:${rinfo.port}`,
      address: m.address,
      args: m.args.map(serializableArg),
    };
    if (ndjson) ndjson.write(`${JSON.stringify(entry)}\n`);
    if (!SILENT) {
      const argsStr = entry.args.length ? ` ${JSON.stringify(entry.args)}` : '';
      console.log(`${entry.ts}  ${entry.address}${argsStr}`);
    }
  }
});

socket.on('listening', () => {
  const addr = socket.address();
  console.error(`[osc-capture] listening on ${addr.address}:${addr.port}`);
  if (NDJSON_PATH) console.error(`[osc-capture] appending to ${NDJSON_PATH}`);
  if (FILTER) console.error(`[osc-capture] filter: address.startsWith(${JSON.stringify(FILTER)})`);
});

socket.bind(PORT, HOST);

process.on('SIGINT', () => {
  console.error('\n[osc-capture] stopping');
  socket.close();
  if (ndjson) ndjson.end();
  process.exit(0);
});

function serializableArg(a) {
  if (typeof a === 'bigint') return { $bigint: a.toString() };
  if (Buffer.isBuffer(a)) return { $blob: a.toString('base64') };
  if (typeof a === 'number' && !Number.isFinite(a)) return { $inf: a > 0 ? '+' : '-' };
  return a;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}
