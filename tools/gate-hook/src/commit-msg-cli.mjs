#!/usr/bin/env node
/**
 * `P-025` — REFUSE a commit whose message begins with a byte-order mark.
 *
 * git passes the message file's path as `$1`. Exit 0 = the message may stand.
 * Exit 1 = refuse, with the one line saying what to do instead.
 *
 * ⚠ **FAIL-OPEN on anything that is not a detected BOM.** No path, an unreadable file, a
 * missing argument — all pass. This is a guard against one specific byte sequence, and it
 * must never be the reason a commit cannot be made at all.
 *
 * The decision itself is `commit-msg-decision.mjs`, which is what the tests import.
 */
import fs from 'node:fs';
import { commitMsgVerdict } from './commit-msg-decision.mjs';

function main() {
  const messagePath = process.argv[2];
  if (messagePath === undefined) return 0;

  let bytes;
  try {
    bytes = fs.readFileSync(messagePath);
  } catch {
    return 0; // unreadable — fail open
  }

  const verdict = commitMsgVerdict(bytes);
  if (verdict.ok) return 0;

  console.error(
    `\n[commit-msg] COMMIT REFUSED — the message begins with a ${verdict.mark} byte-order mark (P-025).`,
  );
  console.error(
    'Write the message file WITHOUT a BOM and pass it with `git commit -F <file>` — in PowerShell that means',
  );
  console.error(
    "  node -e \"require('fs').writeFileSync(process.argv[1], process.argv[2])\" msg.txt \"feat(x): …\"",
  );
  console.error(
    'because `Out-File`/`Set-Content -Encoding utf8` and `>` all prepend one on Windows PowerShell 5.1.\n',
  );
  return 1;
}

process.exit(main());
