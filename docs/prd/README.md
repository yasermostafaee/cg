# PRD — feature & bug backlog

This folder is the **inbox / backlog** for the CG platform. You write what you
want (short, human); Claude turns each item into an **OpenSpec change**
(proposal → spec → tasks → implementation → archive). The PRD stays light —
detailed specs live in `openspec/`.

```
docs/prd/
├── README.md     ← this file (format + processing contract)
├── designer.md   ← Designer (visual editor) features
├── runtime.md    ← Runtime (playout controller) features
├── caspar.md     ← CasparCG control / the local bridge
├── platform.md   ← cross-cutting / infra / tooling / tests
└── bugs.md       ← bug reports (always include a repro)
```

## Item format

Copy this block for each item. Keep it short — Claude expands it into the change.

```md
## [ ] D-001 — Short title ⟨priority: high⟩

**What:** One or two sentences on the desired behavior.
**Why:** The problem / motivation.
**Acceptance:**

- WHEN <action/condition> THEN <observable outcome>
- WHEN <…> THEN <…>
  **Notes:** Optional — links, constraints, files you already know are involved.
```

### Rules

- **ID** = category prefix + zero-padded number, never reused:
  `D-` designer · `R-` runtime · `C-` caspar · `P-` platform · `B-` bugs.
- **Status checkbox** (in the `##` heading):
  - `[ ]` queued
  - `[~]` in progress / in review (change implemented, not yet archived)
  - `[x]` done (archived — link the change dir)
  - `[!]` blocked (add a one-line reason)
- **Priority**: `high` · `medium` · `low` (drives "do the next high item").
- **Acceptance** drives the spec: write each line as **WHEN … THEN …** so it
  maps 1:1 to an OpenSpec `#### Scenario`. This is the most important field —
  it's how we both know when the item is done.
- **Bugs** (`bugs.md`) must include **Repro / Expected / Actual** instead of
  Acceptance, plus a regression-test note.

## Processing contract (what Claude does)

When the user says e.g. _"implement D-001"_, _"do the next high-priority
designer item"_, or _"work through the high items in caspar.md"_, Claude MUST,
for each chosen item:

1. **Locate** the item and set it to `[~]`.
2. **Create a change**: `pnpm openspec new change <kebab-name>` (derive the
   name from the title, e.g. `D-001 Add image import` → `add-image-import`).
3. **Author artifacts** from the item:
   - `proposal.md` — Why (from **Why**), What Changes (from **What**),
     Capabilities (pick/extend a capability in `openspec/specs/`), Impact.
   - `design.md` — only the key decisions/risks (brief for small items).
   - `specs/<capability>/spec.md` — one `### Requirement` per behavior; each
     **Acceptance** line becomes a `#### Scenario` with WHEN/THEN. Use
     `## MODIFIED Requirements` when editing an existing living spec.
   - `tasks.md` — the implementation checklist.
4. **Validate**: `pnpm openspec validate <name> --strict` (fix until green).
5. **Implement** following `CLAUDE.md` → "Where features go". No renderer →
   Node imports; bridge changes go through `src/shared/*-bridge.ts`.
6. **Green gate** for the affected workspaces:
   `typecheck` + `lint` + `test` + `build`. Add tests that cover the Acceptance
   scenarios.
7. **Commit** (conventional, e.g. `feat(designer): …`) and **push**.
8. **Update the PRD item**: set `[~]` and note the change dir
   (`openspec/changes/<name>/`).
9. **Archive** only when the user confirms (or if they said _"and archive"_):
   `pnpm openspec archive <name> -y` → folds the spec into `openspec/specs/`,
   then set the item to `[x]` with a link to
   `openspec/changes/archive/<date>-<name>/`.

### Guardrails

- One PRD item → one OpenSpec change. Don't batch unrelated items into one change.
- If an item is ambiguous or the Acceptance is missing, ask before coding.
- Respect the constraints in `CLAUDE.md` (no backend, browser-only, RTL, strict TS).
- Never delete or renumber existing IDs; mark obsolete items `[!]` with a reason.

## How to invoke (examples)

- "Implement **D-001**."
- "Do the **next high-priority** item in `runtime.md`."
- "Work through the **high** items in `caspar.md`, one change each."
- "Implement **D-003 and archive** it."
- "Triage **B-002**: reproduce, fix, add a regression test."
