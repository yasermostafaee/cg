# Third-Party Licenses

This document lists every third-party dependency that ships with a v1.0.0 release artifact — either bundled inside the Designer / Runtime installers or embedded in the broadcast-template runtime (`@cg/template-runtime`).

Dev-only dependencies (test runners, build tooling, type packages) are not enumerated here unless their bundled output ships to operators. The authoritative list of every `node_modules/*` license is generated at build time by `pnpm licenses ls` and emitted into the release archive as `licenses.json`.

## Fonts

| Family           | License           | Source                                   |
| ---------------- | ----------------- | ---------------------------------------- |
| Vazirmatn        | SIL Open Font 1.1 | https://github.com/rastikerdar/vazirmatn |
| Noto Sans Arabic | SIL Open Font 1.1 | https://fonts.google.com/noto            |
| Inter            | SIL Open Font 1.1 | https://github.com/rsms/inter            |

The Designer's preview iframe + the broadcast template runtime fall back to these in that order for Persian / Arabic / Latin text. Bundled `.woff2` files ship with each `.vcg` whose `manifest.fontDeps[].source === 'bundled'`.

## Runtime libraries

| Package        | Version | License | Source                                 |
| -------------- | ------- | ------- | -------------------------------------- |
| `lottie-web`   | ^5.12.2 | MIT     | https://github.com/airbnb/lottie-web   |
| `zod`          | ^3.23.8 | MIT     | https://github.com/colinhacks/zod      |
| `react`        | ^18.3.1 | MIT     | https://github.com/facebook/react      |
| `react-dom`    | ^18.3.1 | MIT     | https://github.com/facebook/react      |
| `lucide-react` | ^1.21.0 | ISC     | https://github.com/lucide-icons/lucide |

`lucide-react` ships only inside the Designer SPA (the editor UI's icons); it is
imported per-icon (tree-shaken) and is not embedded in `@cg/template-runtime` or
any exported `.vcg` / single-file HTML.

## Electron + build tooling (shipped inside the installers)

| Package            | Version  | License | Source                                                |
| ------------------ | -------- | ------- | ----------------------------------------------------- |
| `electron`         | ^32.2.7  | MIT     | https://github.com/electron/electron                  |
| `electron-vite`    | ^2.3.0   | MIT     | https://github.com/alex8088/electron-vite             |
| `electron-builder` | ^24.13.3 | MIT     | https://github.com/electron-userland/electron-builder |
| `vite`             | ^5.4.11  | MIT     | https://github.com/vitejs/vite                        |
| `esbuild`          | ^0.24.0  | MIT     | https://github.com/evanw/esbuild                      |

Electron's runtime carries its own bundled dependencies (Chromium, Node, V8, libuv, …); each is governed by its own license. The Electron team's `LICENSES.chromium.html` is reproduced verbatim in the release archive at `licenses/chromium.html`.

## Animation engine (deferred)

The Phase 3 §5 animation presets carry GSAP-compatible easing names but the GSAP runtime itself does not ship in v1 — the runtime stub absorbs preset values and the M3.2-β substantive playback engine is deferred. When GSAP integration lands:

| Package | License                                                    | Source           |
| ------- | ---------------------------------------------------------- | ---------------- |
| `gsap`  | Standard "No Charge" + GreenSock Membership for use beyond | https://gsap.com |

Broadcast use generally requires a Business GreenSock membership; the v1.1 GSAP integration will be opt-in and pull the library as a peer dep so operators can supply their own licensed copy.

## License compliance audit (v1.0.0)

A v1.0 audit reviewed every package in `pnpm-lock.yaml` against an allowlist of MIT / Apache 2.0 / BSD-2 / BSD-3 / ISC / SIL OFL. Findings:

- No copyleft (GPL / LGPL / AGPL) dependencies ship with the installers.
- No "source-available but not OSI" licenses ship with the installers.
- Two dev-only packages carry CC-BY-4.0 — they don't ship and are exempt.

Re-running the audit on a future release: `pnpm licenses ls --prod --recursive --json > release/licenses.json` produces the machine-readable manifest; a human reviewer compares the license field against the allowlist before signing the release.
