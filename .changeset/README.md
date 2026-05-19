# Changesets

This directory contains changeset fragments — one per PR that warrants a version
bump or changelog entry.

## Workflow

```pwsh
pnpm changeset            # interactive prompt; creates a new .md fragment
git add .changeset/
git commit
```

On release, fragments are consumed and packages are versioned:

```pwsh
pnpm version-packages     # bumps versions and updates CHANGELOG.md per package
```

## Package linkage

`@cg/designer` and `@cg/runtime` are **fixed** — they always release together at
the same version (see `config.json`). All other `@cg/*` packages version
independently.
