#!/usr/bin/env node
/**
 * P-010 — the thin CLI half of the `.husky/pre-push` guard. Reads git's pre-push stdin
 * and prints ONE word: `skip` (every ref is a deletion) or `gate` (anything else).
 *
 * All decidable logic lives in the pure `isDeletionOnlyPush` next door, where the unit
 * tests pin it; this file is only plumbing. It is fail-closed by construction: a TTY, a
 * read error, or a thrown parse all print `gate`, and the shell additionally treats any
 * output that is not exactly `skip` as `gate`.
 */
import { isDeletionOnlyPush } from './pre-push-decision.mjs';

async function readAll(stream) {
  let text = '';
  stream.setEncoding('utf8');
  for await (const chunk of stream) text += chunk;
  return text;
}

async function main() {
  // No pipe attached ⇒ nothing to decide from, and reading would block. Gate.
  if (process.stdin.isTTY) return 'gate';
  return isDeletionOnlyPush(await readAll(process.stdin)) ? 'skip' : 'gate';
}

main().then(
  (decision) => process.stdout.write(`${decision}\n`),
  () => process.stdout.write('gate\n'),
);
