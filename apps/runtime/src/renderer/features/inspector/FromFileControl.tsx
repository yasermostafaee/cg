import { useEffect, useState, useSyncExternalStore } from 'react';
import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { reportCommandError } from '../status/commandFeedback.js';
import type { FieldPath } from './draftStore.js';
import { DEFAULT_DELIMITER } from './delimiterStore.js';
import { splitDefaultFor } from './fieldTargetStore.js';
import { type FromFileFieldKind } from './fromFileContent.js';
import { reloadFromFile, stageFromFile } from './fromFileOps.js';
import { Tag } from '../../ui/Tag.js';
import {
  attachFileSource,
  detachFileSource,
  fromFileState,
  fromFileVersion,
  reconcileAuthoredFileSource,
  setFromFilePermission,
  subscribeFromFile,
} from './fromFileStore.js';
import {
  FILE_SOURCE_NEEDS_PERMISSION_MESSAGE,
  FILE_SOURCE_UNSUPPORTED_MESSAGE,
  fileSourceSupported,
  pickTextFileSource,
  requestReadPermission,
} from './textFileSource.js';
import { FromFilePreviewDialog } from './FromFilePreviewDialog.js';

const styles = {
  // NO `marginTop`: the field's column (or, for a list, its footer ROW) owns the
  // spacing around this control now, from the shared `--r-space-*` scale. A
  // margin here fought the row's `align-items` and offset the button by ~3px
  // against the "Add item" it sits beside.
  /*
   * THE GAP BETWEEN THE TWO LINES — the controls row and the split row beneath it.
   *
   * One step on the scale (8px), not the smallest: 4px read as a single wrapped
   * line and let the checkbox crowd the chip above it, while a larger step would
   * separate two rows that belong to ONE control. It is the same step the field
   * footer uses between its buttons, so the block reads as one cluster with two
   * lines rather than two stacked clusters.
   */
  wrap: { display: 'flex', flexDirection: 'column' as const, gap: 'var(--r-space-2)' },
  row: { display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' as const },
  // `fileName` is GONE — the name lives in `.cg-file-chip__name` now, welded to
  // its detach control. It was a bare muted span that wrapped and pushed the
  // buttons around as the path grew.
  hint: { fontSize: '0.72rem', color: colors.textMuted, margin: 0 },
  error: { fontSize: '0.75rem', color: colors.errorText, margin: 0 },
} as const;

/**
 * R-018 — the "from file" affordance under a text-carrying field (text /
 * multiline / list): pick a text file as the field's source, optionally split
 * list content on a delimiter, and manually RELOAD. Choosing/reloading feeds
 * the EXISTING field-update path (stage → `stack.update`) — the file is just
 * an input method, never a second content pipeline.
 *
 * TEXT-FILE-OPT-01 — it renders only on a field whose AUTHOR GRANTED it a file
 * source (`allowFileSource`). The kind is still the outer condition but no longer
 * the whole one: the gate lives in `Inspector.tsx`'s `fromFileKind`, and this
 * component is mounted only for a field that passed it. Nothing here re-checks the
 * grant — a second copy of that rule is how the two would come to disagree.
 *
 * The operator-owned picker is Chromium-only (File System Access API): where it
 * is unavailable that picker is disabled with a reason. An authored Bridge
 * source does not depend on the browser filesystem API.
 */
export function FromFileControl({
  item,
  path,
  kind,
  fieldId,
  authoredPath,
  authoredDelimiter,
  lockFile = false,
}: {
  item: StackItemState;
  path: FieldPath;
  kind: FromFileFieldKind;
  fieldId: string;
  /** R-102 — the author's Bridge default; it remains replaceable unless locked. */
  authoredPath?: string | undefined;
  /** R-102 — the author's initial delimiter for a list file. */
  authoredDelimiter?: string | undefined;
  lockFile?: boolean;
}): JSX.Element {
  useSyncExternalStore(subscribeFromFile, fromFileVersion);
  const [previewOpen, setPreviewOpen] = useState(false);
  const state = fromFileState(item.itemId, path);
  const lockedPath = lockFile ? authoredPath : undefined;
  const supported = fileSourceSupported();
  const pathKey = JSON.stringify(path);
  const lockedSplit = kind === 'list' && authoredDelimiter !== undefined;

  useEffect(() => {
    reconcileAuthoredFileSource(item.itemId, path, authoredPath, lockFile, {
      split: lockFile
        ? lockedSplit
        : (state?.split ??
          (kind === 'list' &&
            (authoredDelimiter !== undefined || splitDefaultFor(item.templateId, path)))),
      delimiter: lockFile
        ? (authoredDelimiter ?? DEFAULT_DELIMITER)
        : (state?.delimiter ?? authoredDelimiter ?? DEFAULT_DELIMITER),
    });
  }, [
    authoredDelimiter,
    authoredPath,
    item.itemId,
    item.templateId,
    kind,
    lockFile,
    lockedSplit,
    path,
    pathKey,
    state?.delimiter,
    state?.source.bridgePath,
    state?.split,
  ]);

  const choose = async (): Promise<void> => {
    let source;
    try {
      source = await pickTextFileSource();
    } catch (err) {
      reportCommandError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (source === null) return; // operator cancelled — not an error
    // The split default is per-TARGET (resolved from the scene's bindings at
    // import): a sequence's list splits into discrete items; a ticker — and any
    // unknown/ambiguous target — stays whole-text verbatim (Cinegy parity).
    attachFileSource(item.itemId, path, source, {
      split:
        kind === 'list' &&
        (authoredDelimiter !== undefined || splitDefaultFor(item.templateId, path)),
      delimiter: authoredDelimiter ?? DEFAULT_DELIMITER,
    });
    // Initial load STAGES like a hand edit; the operator applies with Update.
    await stageFromFile(item, path, kind);
  };

  if (lockedPath !== undefined && state?.source.bridgePath !== lockedPath) {
    return (
      <div className="cg-from-file" style={styles.wrap}>
        <div style={styles.row}>
          <Tag className="cg-file-chip">
            <span className="cg-file-chip__name" title={lockedPath}>
              {lockedPath}
            </span>
          </Tag>
          <Button variant="secondary" disabled aria-label={`Reload ${fieldId} from file`}>
            Reload
          </Button>
        </div>
      </div>
    );
  }

  if (state === undefined) {
    return (
      <div className="cg-from-file" style={styles.wrap}>
        <div style={styles.row}>
          {/* NEUTRAL IS NOT INVISIBLE. This was a `ghost` (no fill, no border, muted
              text) and read as static text under every text-carrying field — at the
              time, the most PROPAGATED instance of that mistake in the app, since it
              rendered once per text / multiline / list field. TEXT-FILE-OPT-01 cut the
              propagation (it now renders only where the author granted a file source),
              but the styling verdict stands on its own and must not be walked back:
              `neutral` keeps it colourless while giving it the boundary, hover and
              focus ring a control owes. See the `--ghost` warning in `controls.css`. */}
          <Button
            variant="neutral"
            aria-label={`Load ${fieldId} from file`}
            disabled={!supported}
            title={supported ? undefined : FILE_SOURCE_UNSUPPORTED_MESSAGE}
            onClick={() => void choose()}
          >
            From file…
          </Button>
          {!supported && <p style={styles.hint}>{FILE_SOURCE_UNSUPPORTED_MESSAGE}</p>}
        </div>
      </div>
    );
  }

  // B-113 — an attachment restored from a previous session whose read permission
  // the browser did not carry over. The file NAME is shown (the operator needs
  // to know which file was attached), but nothing may be read from it until they
  // re-grant, so Reload is replaced by the gesture that makes reading possible
  // rather than sitting there failing.
  const needsGrant = state.permission !== 'granted';

  const grant = async (): Promise<void> => {
    const handle = state.source.handle;
    if (handle === undefined) return;
    const result = await requestReadPermission(handle);
    setFromFilePermission(item.itemId, path, result);
    if (result === 'denied') {
      reportCommandError(`Access to “${state.source.name}” was refused.`);
    }
  };

  return (
    <div className="cg-from-file" style={styles.wrap}>
      <div style={styles.row}>
        {/* THE FILE, as ONE control: its name and the way to detach it, welded
            together. See `.cg-file-chip` — the short version is that a bare `✕`
            here is the same glyph as the item-delete buttons one row up, doing
            something else, and attaching it to the name is what stops the two
            being confusable. */}
        <Tag className="cg-file-chip">
          <span className="cg-file-chip__name" title={state.source.name}>
            {state.source.name}
          </span>
          {lockedPath === undefined && (
            <button
              type="button"
              className="cg-file-chip__detach"
              aria-label={`Detach ${fieldId} file source`}
              title={`Detach ${state.source.name}`}
              onClick={() => detachFileSource(item.itemId, path)}
            >
              ×
            </button>
          )}
        </Tag>
        {needsGrant ? (
          <AsyncButton
            variant="secondary"
            aria-label={`Grant access to ${fieldId} file`}
            run={async () => {
              await grant();
              return { accepted: true, cancelled: true };
            }}
            onError={() => undefined}
          >
            Grant access
          </AsyncButton>
        ) : (
          /* Reload RE-READS the file and STAGES it — it does not apply. It used to
             apply, which made a read-verb button perform a write that reached the
             graphic on air (owner's report); see `reloadFromFile`. The operator
             commits with Update, exactly as they do after choosing the file.
             Failures are toasted + shown in the inline error line below, so the
             button's own inline error is a duplicate — suppressed, the #334
             pattern. */
          <AsyncButton
            variant="secondary"
            aria-label={`Reload ${fieldId} from file`}
            run={() => reloadFromFile(item, path, kind)}
            onError={() => undefined}
          >
            Reload
          </AsyncButton>
        )}
        {!needsGrant && (
          <Button
            variant="secondary"
            aria-label={`View ${fieldId} file content and fields`}
            onClick={() => setPreviewOpen(true)}
          >
            View content…
          </Button>
        )}
        {/* THE DETACH `✕` MOVED INTO THE FILE CHIP ABOVE — it is part of the file
            now, not a free-standing button at the end of the row. It stood here as
            an `icon`: the same shape and the same glyph as the item-delete buttons
            one row up, doing something else entirely. Do not put it back. */}
      </div>
      {needsGrant && <p style={styles.hint}>{FILE_SOURCE_NEEDS_PERMISSION_MESSAGE}</p>}
      {state.error !== null && (
        <p style={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <FromFilePreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        item={item}
        path={path}
        kind={kind}
        fieldId={fieldId}
        lockFile={lockedPath !== undefined}
      />
    </div>
  );
}
