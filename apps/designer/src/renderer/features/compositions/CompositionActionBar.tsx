import type { ExportIssue } from '@cg/shared-ipc';
import type { Scene } from '@cg/shared-schema';
import {
  designerStore,
  scopeSceneToComposition,
  shallowEqual,
  useDesignerSelector,
} from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import * as s from './CompositionActionBar.css.js';

interface Props {
  /** Validation issues for the open composition — exports block on error-severity. */
  issues: readonly ExportIssue[];
}

/**
 * D-086 Phase B — per-composition action footer pinned at the bottom of the left
 * rail. Holds Preview / Export .vcg / Export HTML for the OPEN composition. Every
 * action scopes to the active composition + its nested closure via Phase A's
 * `scopeSceneToComposition` (read live from the store). Living off the canvas keeps
 * the editing surface full-height. Preview just sets the store's `previewScene`; the
 * modal is RENDERED by the in-canvas `PreviewHost` (the preview iframe's live updates
 * only work inside the canvas subtree), and only that host re-renders on open — never
 * this bar or the editor. The playout-target selector is deferred to a real 2nd
 * target (C-001); the persisted `Composition.playoutTarget` field is its seam.
 *
 * The compact buttons carry an explicit `aria-label` (the canonical name) so their
 * accessible name stays stable while the visible label is a short icon + word.
 */
export function CompositionActionBar({ issues }: Props): JSX.Element {
  const { compName, hasComp } = useDesignerSelector((st) => {
    const comp =
      st.activeCompositionId === null
        ? undefined
        : st.scene?.compositions?.find((c) => c.id === st.activeCompositionId);
    return { compName: comp?.name ?? null, hasComp: comp !== undefined };
  }, shallowEqual);

  const errors = issues.filter((i) => i.severity === 'error');
  const errorCount = errors.length;
  /*
    ⭐ `D-157` — TWO DIFFERENT REFUSALS, and collapsing them into one boolean is what made this
    control mute.

    - **No composition open** — there is nothing to export and NO ISSUE TO EXPLAIN, so the button
      is genuinely `disabled`. A click would have nothing to say.
    - **Validation errors** — there IS something to say, and the old code said it into a void: the
      same `errorCount > 0` that produced the `window.alert` also set `disabled`, so the alert
      could never fire, and the `title` sat on a natively disabled button where browsers suppress
      tooltips and the app's own `pointerover` tooltip never fires either.

    So an error-blocked button stays fully OPERABLE. See {@link refuse}.

    ⚠ **AND IT IS NOT `aria-disabled` EITHER — that was the first draft and it was wrong.** The
    intent was "announce it as unavailable while keeping it clickable", but `aria-disabled` is
    honoured by assistive technology and by tooling alike: a screen-reader user is told not to
    press it, so they never reach the explanation pressing it would give them — which is this
    item's own defect, reproduced for the users least able to work around it. (Playwright agrees:
    it treats `aria-disabled="true"` as disabled and refuses to click.)

    The honest description is that the action IS available and reports a problem: pressing it
    tells you what is wrong and takes you to it. The refusal lives in the accessible NAME and the
    title, and the "blocked" appearance in `data-export-blocked`.
  */
  const noComposition = !hasComp;
  const blockedByErrors = hasComp && errorCount > 0;

  /**
   * `D-157` — the FIRST offender, named. The preflight's own `label()` already put the
   * element's name (else its id) into every message, so the name is lifted from the message
   * rather than re-derived here: two spellings of "which box" is how a tooltip comes to name a
   * different element from the panel it points at.
   */
  const firstOffender = errors[0]?.message.match(/"([^"]+)"/)?.[1];
  /** What the control says when it will not export. Names the count AND the box. */
  const blockedTitle =
    firstOffender === undefined
      ? `Export blocked — ${String(errorCount)} validation error${errorCount === 1 ? '' : 's'}. Press to see them.`
      : `Export blocked — ${String(errorCount)} error${errorCount === 1 ? '' : 's'}, starting with “${firstOffender}”. Press to see them and select the box.`;
  /*
    🔴 The refusal reaches assistive technology through `title`, and that only works BECAUSE the
    button is no longer disabled.

    A `title` on an enabled control is exposed as its accessible DESCRIPTION, so a screen-reader
    user hears the canonical name and then the reason. On the old disabled button it was exposed
    to nobody — which is the whole defect. The `aria-label` is deliberately left CANONICAL and
    stable (this component's docstring makes that a contract), so the refusal rides the
    description rather than mutating the handle every surface finds the button by.
  */

  /** The active composition scoped to its nested closure (Phase A), or null. */
  function scoped(): Scene | null {
    const st = designerStore.get();
    return scopeSceneToComposition(st.scene, st.activeCompositionId);
  }

  /** Open the Preview modal (rendered by the in-canvas PreviewHost off the store). */
  function openPreview(): void {
    const target = scoped();
    if (target !== null) designerStore.setPreviewScene(target);
  }

  /**
   * ⭐ `D-157` — **ANSWER the press instead of swallowing it.**
   *
   * The refusal does three things, and the order is the point:
   *
   * 1. **SELECT the offenders**, so the canvas marks (`ErrorMarkOverlay`) are the boxes under
   *    the author's eye — the answer to "which one is wrong" is on the thing that is wrong.
   * 2. **OPEN the Issues panel**, which is the one-click route from the control that was
   *    actually refused to the full message. It used to be reachable only from a status-bar
   *    pill that exists only while there are issues, in the opposite corner of the window.
   * 3. **NAME the count and the first offender** in a short notice.
   *
   * ⚠ The notice is deliberately SHORT and is not the whole reason: `showNotice` is a 5-second
   * transient, and `B-173` records that designed refusal sentences need longer than a toast
   * gives them. The panel holds the full text for as long as the author wants it; the toast
   * only has to say what just happened.
   */
  function refuse(): void {
    const ids = [...new Set(errors.map((i) => i.elementId).filter((id) => id !== undefined))];
    if (ids.length > 0) designerStore.setSelection(ids);
    designerStore.setIssuesOpen(true);
    designerStore.showNotice(
      `Export blocked — ${String(errorCount)} error${errorCount === 1 ? '' : 's'}. ` +
        `${firstOffender ?? 'See the Issues panel'}.`,
    );
  }

  async function exportVcg(): Promise<void> {
    if (blockedByErrors) {
      refuse();
      return;
    }
    const target = scoped();
    if (target === null) return;
    await window.cg.export.runDisk({ scene: target });
  }

  async function exportHtml(): Promise<void> {
    if (blockedByErrors) {
      refuse();
      return;
    }
    const target = scoped();
    if (target === null) return;
    const { warnings } = await window.cg.export.runSingleFileHtml({ scene: target });
    if (warnings.length > 0) designerStore.showNotice(warnings.join('\n'));
  }

  return (
    <div className={s.bar} aria-label="Composition actions" data-testid="composition-action-bar">
      {compName !== null && (
        <span className={s.label} title={compName}>
          {compName}
        </span>
      )}
      <div className={s.actions}>
        <Button
          size="sm"
          className={s.action}
          aria-label="Preview"
          disabled={!hasComp}
          onClick={openPreview}
          title="Preview this composition with live data (simulated CasparCG output)"
        >
          <span className={s.glyph} aria-hidden>
            ▷
          </span>
          Preview
        </Button>
        <Button
          size="sm"
          className={s.action}
          aria-label="Export .vcg"
          disabled={noComposition}
          data-export-blocked={blockedByErrors ? 'errors' : undefined}
          onClick={() => void exportVcg()}
          title={blockedByErrors ? blockedTitle : 'Export this composition to .vcg'}
        >
          {/* <span className={s.glyph} aria-hidden>
            ⤓
          </span> */}
          Export (.vcg)
        </Button>
        <Button
          size="sm"
          className={s.action}
          aria-label="Export HTML"
          disabled={noComposition}
          data-export-blocked={blockedByErrors ? 'errors' : undefined}
          onClick={() => void exportHtml()}
          title={
            blockedByErrors
              ? blockedTitle
              : 'Download a single self-contained CasparCG .html for this composition'
          }
        >
          {/* <span className={s.glyph} aria-hidden>
            ⤓
          </span> */}
          HTML
        </Button>
      </div>
    </div>
  );
}
