# One message region for every modal, enforced rather than remembered

## Why

The `Live sources` modal's validation message is dark red on a dark panel: `colors.error`
(`#991B1B`) as a FOREGROUND on the modal surface (`#111827`) measures **2.13:1**, below even
the 3:1 large-text floor. Three explanatory paragraphs above it share one muted grey, so
nothing on the surface stood out even before the colour question.

**This was already solved, and the new modal went around the solution.** The dialog wave that
introduced the `Modal` primitive gave it a MESSAGE REGION pinned outside the scrolling body and
immediately above the action row, because a refusal appended to scrollable content is a refusal
the operator never sees — he presses Apply with the list at the top, nothing happens, and the
reason is below the fold. `Candidate layers — configuration` was moved onto it and reads at
**11.21:1**.

The audit found the pattern half-adopted, which is the worst state a shared rule can be in:

| dialog                             | region?          | treatment                        |
| ---------------------------------- | ---------------- | -------------------------------- |
| `Candidate layers — configuration` | yes              | local amber box (11.21:1)        |
| `Live sources`                     | yes              | local `colors.error` (2.13:1)    |
| `Server connection`                | yes              | FOUR local spellings, one 2.13:1 |
| `Text file delimiters`             | **no** — in body | local `colors.error` (2.13:1)    |

The region took a `ReactNode`, so it asked every caller to decide what a message looks like,
and four callers gave four answers. `Text file delimiters` skipped it entirely and rendered
`<p role="alert">` as the last child of its scrolling body — the exact defect the region
exists to prevent, in a dialog that is otherwise ON the primitive.

## What changes

- **The message region takes DATA, not a node.** `message?: ModalMessage | ModalMessage[]`
  where `ModalMessage` is `{ role, text, detail? }` with STRING fields. There is no seam to
  pass a `style` through, so a call site cannot spell a treatment even by accident.
- **Two message roles, and the ROLE decides the treatment** — the same rule the action-button
  roles already follow. `refusal` (why it did not happen) and `notice` (what happened when it
  worked). The treatment lives in exactly one place, `renderer/ui/Notice.tsx`.
- **No new colour.** `refusal` IS `Candidate layers`' existing amber box, moved. The three red
  spellings are DELETED rather than replaced: per `theme.ts`, red means error or destructive
  intent, and a refusal is neither — it is the ATTENTION case, which is amber.
- **A lint rule closes the placement hole** the type system cannot see: `role="alert"` inside a
  `<Modal>` subtree, mirroring the Designer's raw-`<button>` / raw-`<select>` guard.
- **The `Live sources` prose is cut** from three paragraphs to the one fact that changes what
  the operator does; the band's rule becomes a hint on the band control. No wording is
  rewritten for the new sources model — that follows `TASK A5`.
- **The dialog wave's owed in-viewport E2E is written** and its debt entry discharged.

## Impact

- Affected specs: `runtime-ui`
- Affected code: `apps/runtime/src/renderer/ui/{Modal,Notice}.tsx`, the four dialogs above,
  `apps/runtime/eslint.config.mjs`
- **Partial discharge only** of `DEBT.md:2079` ("no OpenSpec artifacts for the `Modal`
  contract"): this covers the MESSAGE region and its roles. The three action-button roles and
  the chrome migration of five dialogs remain unspecified and still owe their own artifacts.
