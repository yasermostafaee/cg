# DEBT — startup splash screen (R-031)

Things this change NOTICED and deliberately did not do. Filed here, in the change dir,
rather than in a root `DEBT.md`: `main` has no such file (the one on `dev` is that
branch's own fast-mode handover log), and creating a second root file with the same path
and different content would be a merge collision waiting to happen.

None of these is discharged by this PR.

## 1. 🔴 A Linux `gate:e2e` is OWED

This change alters UI and rendering. A green Windows `gate:e2e` is a signal and never the
discharge — it is non-authoritative for pixel and geometry. Must run before archive.

## 2. The APASAI mark and the brand colours are PLACEHOLDERS

The owner stated the logo and brand colours are not final. The swap point is deliberately a
single documented location: the `<svg class="cg-splash__mark">` BRAND SLOT in
`apps/runtime/index.html`. Replacing the brand is replacing that element and nothing else —
keep the class, the 56×56 viewBox and `aria-hidden`, and keep every colour a `--r-*` token
value (`tests/splashCss.test.ts` enforces the last part).

## 3. No in-app about / version surface

The build stamp is computed once in `vite.config.ts` and exposed BOTH as the HTML the
splash paints and as the `__CG_BUILD__` compile-time global. Nothing reads the global yet.

When an about or status-bar version surface is built, it MUST read `__CG_BUILD__`. It must
not re-derive a version, a SHA or a date: two derivations are two answers, and the whole
point of the stamp is that what the operator reads on the first frame and what they read in
the app are the same string.

Also owed at that point: the decision about `version`. The splash prints `sha · builtAt`
only, because `0.0.0` is a placeholder rather than a release identity. When the project
starts tagging releases, prefix `v${version}` at the ONE render site — the comment beside
`#cg-splash-version` in `index.html` says so and names itself as the only place.

## 4. The Runtime's UI font still comes off a CDN

`apps/runtime/index.html` links Vazirmatn from jsdelivr. The Designer self-hosts its fonts,
and this app ALREADY ships the same Vazirmatn faces in `src/renderer/fonts.css` — but that
file is imported only as `?inline` for template delivery, so the app UI reads Persian off
the network.

This change did the minimum its own acceptance required and no more: the link is now
non-render-blocking (`media="print"` until `onload`), because in its previous form it
blocked the FIRST PAINT until the CDN answered or the socket timed out — and on a LAN-only
broadcast machine it never answers, which would have made "the splash paints on the first
frame" false in the deployment that matters most.

What is still owed is the actual fix: point the app UI at the self-hosted faces and drop
the CDN link. That is a font-loading change with Persian/RTL consequences, so it belongs in
its own item with its own verification, not smuggled into a boot screen.

## 5. `reducedMotion` as a Playwright context option did not reach the page

`test.use({ reducedMotion: 'reduce' })` was applied in `tests/e2e/splash.spec.ts` and the
page still reported `matchMedia('(prefers-reduced-motion: reduce)').matches === false`;
every entrance animation ran. `page.emulateMedia({ reducedMotion: 'reduce' })` works, and is
what the spec now uses.

Not investigated further — it is a harness question, not a product one, and the spec has a
working mechanism plus a guard assertion that fails loudly if the emulation ever stops
being applied. Worth knowing before someone reaches for the context option in another spec
and writes a test that passes for the wrong reason.
