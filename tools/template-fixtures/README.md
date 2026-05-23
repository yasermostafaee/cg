# @cg/template-fixtures

Generates the starter `.vcg` fixtures other packages rely on for tests and
manual CasparCG validation.

## Build

```pwsh
pnpm --filter @cg/template-fixtures build
```

Produces, under `fixtures/templates/` at the repo root:

```
persian-lower-third/                # unpacked (point CasparCG at this)
├── index.html
├── cg.js                           # bundled @cg/template-runtime
├── cg.css                          # baseline template styles
└── template.json                   # the Scene

persian-lower-third.vcg             # packed (for vcg-format end-to-end tests)
```

The outputs are **gitignored** — regenerable from the build script.

## Use the unpacked output in CasparCG

Copy the `persian-lower-third/` folder somewhere CasparCG can reach
(per the M1 spike, OneDrive paths can fail; copy to `C:\cg-templates\`
or similar), then in amcp-poke:

```
PLAY 1-30 [HTML] "file:///C:/cg-templates/persian-lower-third/index.html"
```

The lower-third auto-plays after ~500 ms (no CG PLAY needed — Spike D
established that command's behavior with HTML producer is fragile).

## Adding a new fixture

1. Add a `<name>.scene.mjs` next to `build.mjs` exporting `scene`,
   `manifestExtras`, `cgCss`.
2. Add an entry to `FIXTURES` in `build.mjs`.
3. Re-run the build.
