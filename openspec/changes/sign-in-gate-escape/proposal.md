# sign-in-gate-escape

## Why

The owner's CG Control `0.11.4` (2026-10-10, `SIGNIN-ESCAPE-01`). He installed CG Bridge on his own PC
(`192.168.21.93`) to test, and the console ended up pointed at it. That CG Bridge answered, advertised
`auth: playout`, and named its Playout `http://127.0.0.1:8080`, where nothing runs. So the console opened on the
sign-in gate, the check's one line locked the fields, and the card offered nothing else: no Change, no Set up
again, no ✕. The NOT CONNECTED banner's `Set up again` exists only while CG Bridge cannot be reached, and it could.
Reinstalling changed nothing, because the station record (`cg.runtime.station.v1`) lives in the WebView2 profile,
outside the install folder. He could only get out by deleting that profile by hand (`B-320`).

The gate's one line named an address the card did not show: the card said `http://192.168.21.93:8080` and the line
said `127.0.0.1 answers, but nothing listens on port 8080.` Before a sign-in, the console asks CG Bridge's check
for the Playout by the address CG Bridge knows it by: `B-317`'s `playoutAsBridgeNamesIt` turns `.93` into
`127.0.0.1`. CG Bridge then words its answer in that name. The console renamed the question and never renamed the
answer back (`B-321`).

## What changes

- **`B-320` — the gate's way back to Set up.** Inside CG Control, the sign-in gate's foot offers `Set up again`
  under `Sign in`. It is the banner's own control (`SetUpAgain`, one component for both), so it forgets this
  console's station and starts it again on Set up's question. It is always offered, never locked with the fields,
  sends nothing to CG Bridge or CasparCG, and has no confirm and no prose. A browser has no such control. Signing
  in, the order above `LockOverlay`, the focus trap and every refusal condition are unchanged.
- **`B-321` — the answer in the name the console was given.** The rename and its reverse are one function
  (`checkByBridgeName`), used at both places a check is asked (the console's own socket and a check's own
  socket), so one cannot run without the other. In the lines about the Playout and CasparCG, the host and origin
  the console asked by read as the ones it was given. CG Bridge's lines about its own machine (`route`, `proxy`)
  keep its words. No CG Bridge change: the cause and the fix are the console's.

## Decisions

- **Not in `decidingLine`.** The gate's `decidingLine` only picks which line to show. The renaming happens where
  the check is asked, and first-run's full check meets the same mismatch. Fixing it in the filter would have fixed
  one surface and left the other two disagreeing with it.
- **In the foot, under `Sign in`.** The address row already holds `Address`, the address and `Check`. A fourth
  item there would crowd a card the owner reads under pressure. The ruled foot already holds the gate's action,
  and the second control's place in it is measured in Chromium.
- **Not a way past the gate.** The modal census's rule ("a gate with a way out is not a gate") is about ✕,
  Escape and the backdrop, which uncover the console behind. `Set up again` uncovers nothing: it starts the
  console again on another gate.

## Out of scope

- The Servers tab's typed-but-unconnected address and the rest of that card (`SERVERS-SIMPLIFY-01`).
- Why the graphic does not render on `192.168.21.32` (needs that machine's logs; nothing is guessed here).

## Impact

- `apps/runtime/src/renderer/features/shell/SetUpAgain.tsx` (new), `features/auth/SignInOverlay.tsx`,
  `features/status/ConnectionBanner.tsx`, `ui/controls.css`.
- `apps/runtime/src/platform/checkAt.ts`, `WebSocketRuntime.ts`.
- Tests: `signInOverlay.dom.test.ts`, `checkAt.test.ts`, `tests/e2e/sign-in-gate-escape.spec.ts` (new), the
  release acceptance's `stuck-station` phase (`tests/desktop/release-acceptance.mjs`,
  `acceptance-station.mjs`), and `.github/workflows/desktop.yml`'s `acceptance-fresh`.
