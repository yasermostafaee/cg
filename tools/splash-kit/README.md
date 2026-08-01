# @cg/splash-kit

The two things the Designer's and the Runtime's startup splashes must agree on.

Both apps show a splash on their first frame. Nearly everything about them differs — one is a
playout instrument, the other a working artboard — but two things must not, and this package is
where those two live so there is exactly one of each:

- **`timing.ts`** — the arithmetic. When the splash may dismiss, and what the progress readout
  says. Two copies of a timing rule is two rules that drift.
- **`buildStamp.ts`** — the vite plugin that computes `{ version, sha, builtAt }` ONCE and feeds
  both consumers of it. What an operator reads off a splash and repeats down a phone line has to
  identify the running build exactly; two independently-derived stamps are two stamps that can
  disagree about which build is on the box.

## What is deliberately NOT here

The **floors, the session key and the phase labels** stay in each app. They are genuinely
different — the Runtime holds a warm reload for 600 ms because it only needs to stop a flash, the
Designer for 3000 ms because the owner wants the brand moment on every load — and pretending
otherwise would mean one app reading the other's number. Each app passes its own to the functions
here.

So does each app's **`declare global`** for `window.__CG_SPLASH__`: the phase key union is the
app's own list, and typing it here would let either app report a phase the other one has.

## Why this package resolves to SOURCE, not `dist/`

Every other `@cg/*` package exports its built `dist/`. This one exports `src/` directly, and the
reason is specific rather than a preference: `buildStamp.ts` is imported by each app's
`vite.config.ts`, which vite loads **before anything has been built**. `pnpm --filter @cg/designer
dev` runs `vite` directly — turbo's `dev` task has no `dependsOn: ["^build"]` — so a `dist/`
export would make the dev server fail on a clean checkout until someone remembered to build a
package they had no reason to know about. Vite and vitest both transform the TS on the way in, so
source resolution costs nothing here.

There is therefore no `build` script, and that is intentional. Do not add one and repoint the
exports without re-checking that `dev` still starts on a clean tree.
