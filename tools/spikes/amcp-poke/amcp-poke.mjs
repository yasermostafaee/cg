#!/usr/bin/env node
// AMCP poke — a TCP CLI to a CasparCG server. REPL by default; can also feed
// commands from a file. Logs every send/recv line to NDJSON.
//
// Usage:
//   node amcp-poke.mjs                                  # localhost:5250, REPL, default log
//   node amcp-poke.mjs --host caspar.lan --port 5250
//   node amcp-poke.mjs --script commands.txt            # send commands from file
//   node amcp-poke.mjs --log C:\m1-captures\session.ndjson
//   node amcp-poke.mjs --no-log                         # disable logging
//
// In REPL: type AMCP commands, Enter to send. Ctrl+C exits.

import net from 'node:net';
import fs from 'node:fs';
import readline from 'node:readline';
import process from 'node:process';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const HOST = String(args.host ?? 'localhost');
const PORT = Number(args.port ?? 5250);
const SCRIPT = args.script ? String(args.script) : null;
const NO_LOG = Boolean(args['no-log']);
const LOG_PATH =
  NO_LOG
    ? null
    : args.log
      ? String(args.log)
      : `amcp-${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_')}.ndjson`;

const log = LOG_PATH ? fs.createWriteStream(LOG_PATH, { flags: 'a' }) : null;

const client = net.createConnection({ host: HOST, port: PORT }, () => {
  console.error(`[amcp-poke] connected to ${HOST}:${PORT}`);
  if (LOG_PATH) console.error(`[amcp-poke] logging to ${path.resolve(LOG_PATH)}`);
});

let inbuf = '';
client.setEncoding('utf-8');

client.on('data', (chunk) => {
  inbuf += chunk;
  let idx;
  while ((idx = inbuf.indexOf('\r\n')) >= 0) {
    const line = inbuf.slice(0, idx);
    inbuf = inbuf.slice(idx + 2);
    record('recv', line);
    process.stdout.write(`< ${line}\n`);
  }
});

client.on('close', () => {
  console.error('[amcp-poke] connection closed');
  if (log) log.end();
  process.exit(0);
});

client.on('error', (err) => {
  console.error(`[amcp-poke] error: ${err.message}`);
  if (log) log.end();
  process.exit(1);
});

if (SCRIPT) {
  // Feed commands from file, one per line. Empty lines and # comments ignored.
  // Special directive: `# sleep <ms>` pauses before the next line (useful
  // when CEF needs hundreds of ms to load an HTML producer before INVOKE).
  fs.promises.readFile(SCRIPT, 'utf-8').then(
    (text) => {
      const lines = text.split(/\r?\n/);
      let i = 0;
      const next = () => {
        if (i >= lines.length) {
          // Give the server a moment to flush final replies, then close.
          setTimeout(() => client.end(), 500);
          return;
        }
        const raw = lines[i++].trim();
        if (!raw) {
          next();
          return;
        }
        const sleepMatch = /^#\s*sleep\s+(\d+)\s*$/i.exec(raw);
        if (sleepMatch) {
          const ms = parseInt(sleepMatch[1], 10);
          console.error(`[amcp-poke] sleep ${ms}ms`);
          setTimeout(next, ms);
          return;
        }
        if (raw.startsWith('#')) {
          next();
          return;
        }
        send(raw);
        // Small pacing — 50 ms between commands keeps the wire readable in logs.
        setTimeout(next, 50);
      };
      next();
    },
    (err) => {
      console.error(`[amcp-poke] could not read script: ${err.message}`);
      client.end();
      process.exit(1);
    },
  );
} else {
  // REPL
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (trimmed) send(trimmed);
    rl.prompt();
  });
  rl.on('close', () => {
    client.end();
  });
}

function send(line) {
  record('send', line);
  process.stdout.write(`> ${line}\n`);
  client.write(`${line}\r\n`);
}

function record(dir, line) {
  if (!log) return;
  const entry = { ts: new Date().toISOString(), dir, line };
  log.write(`${JSON.stringify(entry)}\n`);
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
