import { TEMPLATE_COMPLETE_PATH } from '@cg/shared-schema';
import type { SelfEndEvent, TemplateRuntime } from '../types.js';

/**
 * 🔴 `SELF-STOP-24` / `C-013` + `C-017` — **THE COMPLETION CHANNEL OUT OF CEF, page side.**
 *
 * `C-013` names its own substance: *"there is NO CHANNEL today for that knowledge to reach the
 * bridge from inside CEF. That transport is the substance of this item."* This is that
 * transport, and it is deliberately the smallest thing that can be: one POST, to the origin that
 * served this page, carrying the token that names the run which just ended.
 *
 * ── THIS IS THE ONLY OUTBOUND SOCKET IN A BROADCAST TEMPLATE ──────────────────────────────────
 *
 * `SECURITY.md` says templates ship blocking outbound network calls and *"do not relax this
 * without strong justification"*, and until this change the served page's CSP named no
 * `connect-src` at all — so it fell back to `default-src 'none'` and nothing here could have
 * worked in any engine. The relaxation to `connect-src 'self'` is `C-017`'s own direction plus
 * the owner's decision of 2026-09-15, and every guard below is what keeps it narrow:
 *
 * 1. **NO TOKEN, NO CONNECTION.** The token is the ARMING KEY, not merely the name of the run.
 *    It arrives only inside `__cg`, which only this bridge writes, so a template opened anywhere
 *    else — a `.vcg` single-file dropped into CasparCG over `file://`, a third-party host, the
 *    Designer's own preview — opens no socket at all. That property, rather than the CSP, is
 *    what makes the relaxation safe.
 * 2. **`file://` IS REFUSED SEPARATELY.** An opaque origin has nothing to post to, and `C-017`
 *    scopes the manually-dropped artifact out in so many words: *"there is no origin to ping"*.
 *    Belt to the token's braces, because the two failures are independent.
 * 3. **EVERY FAILURE IS SWALLOWED.** A page that throws towards air is worse than a row that
 *    goes on claiming it. A CSP refusal, a dead bridge, a 500 and a rejected promise are all
 *    the same silent outcome, and none of them is retried — `C-013`'s degrade-to-today's.
 * 4. **ONCE PER TOKEN.** A second `self-end` on the same token sends nothing; a NEW token
 *    re-arms, so a row taken, finished and taken again reports each run exactly once.
 *
 * ── CEF BASELINE ──────────────────────────────────────────────────────────────────────────────
 *
 * Chromium 71 (CasparCG 2.3 LTS, the declared floor) has `fetch` since Chromium 42 and
 * `XMLHttpRequest` since forever; neither is in `CEF_BANNED_BUILTINS`. The XHR fallback is not
 * decoration: this is the one piece of the feature whose failure mode is *nothing happens,
 * nowhere, with no error*, so the `B-066` rule — verify, never assume — argues for a second
 * route rather than a second assumption. **Whether CasparCG's CEF honours the round trip at all
 * is a PLANT check and is not claimed here.**
 */
export function installCompletionPing(
  runtime: TemplateRuntime,
  win: Window & typeof globalThis = window,
): () => void {
  /*
    The tokens already reported. A SET rather than a last-seen string: the two differ only if a
    take token is ever re-issued after another has been in force, and a set costs nothing to be
    right about a case a later bridge change could introduce without anyone thinking about it.
  */
  const reported = new Set<string>();

  return runtime.on('self-end', (event: SelfEndEvent) => {
    const take = event.take;
    // Guard 1 — unarmed. Not an error: most pages in the world are in this state.
    if (take === undefined || take === '') return;
    // Guard 4 — this run has already been reported.
    if (reported.has(take)) return;
    // Guard 2 — no origin to report to.
    const protocol = win.location.protocol;
    if (protocol !== 'http:' && protocol !== 'https:') return;
    reported.add(take);
    post(win, win.location.origin + TEMPLATE_COMPLETE_PATH, JSON.stringify({ take }));
  });
}

/**
 * Send the report and forget it.
 *
 * ⚠ **The answer is never read, and that is the contract rather than laziness.** There is
 * nothing the page could usefully DO with a `404`: the bridge has already decided the report is
 * stale, and a page that reacted to the answer would be a second place where a take's liveness
 * is judged — the two-spellings failure this tree keeps paying for. The page states a fact once;
 * the bridge decides what it means.
 */
function post(win: Window & typeof globalThis, url: string, body: string): void {
  try {
    const f = (win as { fetch?: unknown }).fetch;
    if (typeof f === 'function') {
      const sending = (f as (u: string, i: Record<string, unknown>) => unknown)(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        // The page is not navigating away, so this is belt-and-braces — but a CEF host that
        // tears the page down on CLEAR mid-request would otherwise drop the report silently.
        keepalive: true,
      });
      // A REJECTION IS AN UNHANDLED REJECTION unless it is caught here, and an unhandled
      // rejection inside a broadcast page is exactly the noise-towards-air this file forbids.
      if (sending !== null && typeof sending === 'object' && 'catch' in sending) {
        (sending as { catch: (f: () => void) => unknown }).catch(() => undefined);
      }
      return;
    }
    const Xhr = (win as { XMLHttpRequest?: unknown }).XMLHttpRequest;
    if (typeof Xhr !== 'function') return;
    const xhr = new (Xhr as new () => {
      open: (m: string, u: string, async?: boolean) => void;
      setRequestHeader: (k: string, v: string) => void;
      send: (b?: string) => void;
    })();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.send(body);
  } catch {
    // Guard 3. A CSP refusal throws synchronously in some engines and rejects in others; both
    // land here or in the catch above, and both mean the same thing — the row stays as it is
    // today, which is the documented degrade.
  }
}
