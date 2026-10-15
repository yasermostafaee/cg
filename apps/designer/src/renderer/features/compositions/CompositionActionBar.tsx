import { useState } from 'react';
import type { ExportIssue } from '@cg/shared-ipc';
import type { Scene } from '@cg/shared-schema';
import { CG_CONTROL_TOO_LARGE, type ExportResult } from '../../../shared/designer-bridge.js';
import {
  designerStore,
  scopeSceneToComposition,
  shallowEqual,
  useDesignerSelector,
} from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import { exportFailedLine, exportWrittenLine } from './export-answer.js';
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
  /*
    `BOOK-EXPORT-01` (`B-351`) — a template too large for CG Control refuses `Export .vcg` only:
    the single-file HTML never goes through CG Bridge, so that limit is not its own.
  */
  const htmlErrors = errors.filter((i) => i.code !== CG_CONTROL_TOO_LARGE);
  /**
   * `B-349` — an export in flight: which one, and the share done (`null` until the pipeline
   * reports, e.g. while the save dialog is open). Both buttons wait for it.
   */
  const [busy, setBusy] = useState<{ kind: 'vcg' | 'html'; share: number | null } | null>(null);
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
  const vcgBlocked = hasComp && errors.length > 0;
  const htmlBlocked = hasComp && htmlErrors.length > 0;
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
  function refuse(blocking: readonly ExportIssue[]): void {
    const ids = [...new Set(blocking.map((i) => i.elementId).filter((id) => id !== undefined))];
    if (ids.length > 0) designerStore.setSelection(ids);
    designerStore.setIssuesOpen(true);
    designerStore.showNotice(
      `Export blocked — ${String(blocking.length)} error${blocking.length === 1 ? '' : 's'}. ` +
        `${firstOffenderOf(blocking) ?? 'See the Issues panel'}.`,
    );
  }

  /**
   * 🔴 `BOOK-EXPORT-01` (`B-349`) — **THE ANSWER TO AN EXPORT, WHATEVER IT WAS.** A written file is
   * named with its size; a refusal found by the bridge (its own preflight, run before the save
   * dialog) is answered as the button's own refusal; a failure is a sentence that STAYS until it is
   * dismissed, with the element at fault selected — and the Issues panel opened when the panel
   * holds the cause.
   */
  function answer(result: ExportResult): void {
    switch (result.outcome) {
      case 'written':
        designerStore.showNotice(exportWrittenLine(result.filename, result.bytes));
        return;
      case 'cancelled':
        return;
      case 'blocked':
        refuse(result.issues);
        return;
      case 'failed':
        if (result.elementId !== undefined) designerStore.setSelection([result.elementId]);
        designerStore.showNotice(exportFailedLine(result), { hold: true });
    }
  }

  async function exportVcg(): Promise<void> {
    if (busy !== null) return;
    if (vcgBlocked) {
      refuse(errors);
      return;
    }
    const target = scoped();
    if (target === null) return;
    setBusy({ kind: 'vcg', share: null });
    const off = window.cg.export.onProgress((p) => setBusy({ kind: 'vcg', share: p.progress }));
    try {
      answer(await window.cg.export.runDisk({ scene: target }));
    } catch (err) {
      // The bridge answers every outcome; this is a fault in answering, and still not a silence.
      answerFault(err);
    } finally {
      off();
      setBusy(null);
    }
  }

  async function exportHtml(): Promise<void> {
    if (busy !== null) return;
    if (htmlBlocked) {
      refuse(htmlErrors);
      return;
    }
    const target = scoped();
    if (target === null) return;
    setBusy({ kind: 'html', share: null });
    try {
      const result = await window.cg.export.runSingleFileHtml({ scene: target });
      if (result.outcome === 'failed') {
        if (result.elementId !== undefined) designerStore.setSelection([result.elementId]);
        designerStore.showNotice(
          exportFailedLine({ cause: result.cause, filename: null, file: 'none' }),
          { hold: true },
        );
        return;
      }
      designerStore.showNotice(
        [exportWrittenLine(result.filename, result.bytes), ...result.warnings].join('\n'),
      );
    } catch (err) {
      answerFault(err);
    } finally {
      setBusy(null);
    }
  }

  const exportLabel = (kind: 'vcg' | 'html', idle: string): string => {
    if (busy?.kind !== kind) return idle;
    return busy.share === null
      ? 'Exporting…'
      : `Exporting… ${String(Math.min(99, Math.floor(busy.share * 100)))} %`;
  };

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
          disabled={noComposition || busy !== null}
          aria-busy={busy?.kind === 'vcg' ? true : undefined}
          data-export-blocked={vcgBlocked ? 'errors' : undefined}
          onClick={() => void exportVcg()}
          title={vcgBlocked ? blockedTitleOf(errors) : 'Export this composition to .vcg'}
        >
          {/* <span className={s.glyph} aria-hidden>
            ⤓
          </span> */}
          {exportLabel('vcg', 'Export (.vcg)')}
        </Button>
        <Button
          size="sm"
          className={s.action}
          aria-label="Export HTML"
          disabled={noComposition || busy !== null}
          aria-busy={busy?.kind === 'html' ? true : undefined}
          data-export-blocked={htmlBlocked ? 'errors' : undefined}
          onClick={() => void exportHtml()}
          title={
            htmlBlocked
              ? blockedTitleOf(htmlErrors)
              : 'Download a single self-contained CasparCG .html for this composition'
          }
        >
          {/* <span className={s.glyph} aria-hidden>
            ⤓
          </span> */}
          {exportLabel('html', 'HTML')}
        </Button>
      </div>
    </div>
  );
}

/**
 * `D-157` — the FIRST offender, named. The preflight's own `label()` already put the
 * element's name (else its id) into every message, so the name is lifted from the message
 * rather than re-derived here: two spellings of "which box" is how a tooltip comes to name a
 * different element from the panel it points at.
 */
function firstOffenderOf(blocking: readonly ExportIssue[]): string | undefined {
  return blocking[0]?.message.match(/"([^"]+)"/)?.[1];
}

/** What the control says when it will not export. Names the count AND the box. */
function blockedTitleOf(blocking: readonly ExportIssue[]): string {
  const count = blocking.length;
  const first = firstOffenderOf(blocking);
  return first === undefined
    ? `Export blocked — ${String(count)} validation error${count === 1 ? '' : 's'}. Press to see them.`
    : `Export blocked — ${String(count)} error${count === 1 ? '' : 's'}, starting with “${first}”. Press to see them and select the box.`;
}

/** `B-349` — a throw the bridge did not answer for: said, and held until dismissed. */
function answerFault(err: unknown): void {
  designerStore.showNotice(
    exportFailedLine({
      cause: `the Designer hit an error (${err instanceof Error ? err.message : String(err)})`,
      filename: null,
      file: 'none',
    }),
    { hold: true },
  );
}
