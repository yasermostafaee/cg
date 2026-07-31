import { useState, useSyncExternalStore } from 'react';
import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { reportCommandError } from '../status/commandFeedback.js';
import type { FieldPath } from './draftStore.js';
import {
  DEFAULT_DELIMITER,
  delimitersVersion,
  listDelimiters,
  subscribeDelimiters,
} from './delimiterStore.js';
import { DelimitersModal, ManageDelimitersButton } from './DelimitersModal.js';
import { splitDefaultFor } from './fieldTargetStore.js';
import { type FromFileFieldKind } from './fromFileContent.js';
import { reloadFromFile, stageFromFile } from './fromFileOps.js';
import {
  attachFileSource,
  detachFileSource,
  fromFileState,
  fromFileVersion,
  setFromFilePermission,
  subscribeFromFile,
  updateSplitConfig,
} from './fromFileStore.js';
import {
  FILE_SOURCE_NEEDS_PERMISSION_MESSAGE,
  FILE_SOURCE_UNSUPPORTED_MESSAGE,
  fileSourceSupported,
  pickTextFileSource,
  requestReadPermission,
} from './textFileSource.js';

const styles = {
  // NO `marginTop`: the field's column (or, for a list, its footer ROW) owns the
  // spacing around this control now, from the shared `--r-space-*` scale. A
  // margin here fought the row's `align-items` and offset the button by ~3px
  // against the "Add item" it sits beside.
  wrap: { display: 'flex', flexDirection: 'column' as const, gap: 'var(--r-space-1)' },
  row: { display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' as const },
  fileName: {
    fontSize: '0.75rem',
    color: colors.textMuted,
    overflowWrap: 'anywhere' as const,
    minWidth: 0,
  },
  hint: { fontSize: '0.72rem', color: colors.textMuted, margin: 0 },
  error: { fontSize: '0.75rem', color: colors.error, margin: 0 },
  splitLabel: {
    display: 'flex',
    gap: '0.3rem',
    alignItems: 'center',
    fontSize: '0.75rem',
    color: colors.textMuted,
  },
  // AUTO width, never a fixed one: the options are NAMES now ("Persian comma"),
  // not one-character values, and an operator can add a longer one at any time.
  // The old 5rem was sized for `\n` and would clip every real label. `maxWidth`
  // keeps a pathologically long custom name from pushing the row wider than the
  // Inspector — it truncates instead, and the full text is still in the menu.
  // Both override `.cg-field`'s `width: 100%`, which is right for a text input
  // and wrong for a select that should be as wide as what it holds.
  delimiter: { width: 'auto', maxWidth: '100%' },
} as const;

/**
 * R-018 — the "from file" affordance under a text-carrying field (text /
 * multiline / list): pick a text file as the field's source, optionally split
 * list content on a delimiter, and manually RELOAD. Choosing/reloading feeds
 * the EXISTING field-update path (stage → `stack.update`) — the file is just
 * an input method, never a second content pipeline.
 *
 * Chromium-only by nature (File System Access API): elsewhere the button
 * renders disabled with the reason — a legible degrade, never a broken control.
 */
export function FromFileControl({
  item,
  path,
  kind,
  fieldId,
}: {
  item: StackItemState;
  path: FieldPath;
  kind: FromFileFieldKind;
  fieldId: string;
}): JSX.Element {
  useSyncExternalStore(subscribeFromFile, fromFileVersion);
  useSyncExternalStore(subscribeDelimiters, delimitersVersion);
  const state = fromFileState(item.itemId, path);
  const supported = fileSourceSupported();
  const [managing, setManaging] = useState(false);
  const delimiters = listDelimiters();

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
      split: kind === 'list' && splitDefaultFor(item.templateId, path),
      delimiter: DEFAULT_DELIMITER,
    });
    // Initial load STAGES like a hand edit; the operator applies with Update.
    await stageFromFile(item, path, kind);
  };

  if (state === undefined) {
    return (
      <div className="cg-from-file" style={styles.wrap}>
        <div style={styles.row}>
          {/* NEUTRAL IS NOT INVISIBLE. This was a `ghost` (no fill, no border, muted
              text) and read as static text under every text-carrying field — the most
              PROPAGATED instance of that mistake in the app, since it renders once per
              text / multiline / list field. `neutral` keeps it colourless while giving
              it the boundary, hover and focus ring a control owes. See the `--ghost`
              warning in `controls.css`. */}
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
        <span style={styles.fileName} title={state.source.name}>
          {state.source.name}
        </span>
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
          /* Reload re-reads and RE-APPLIES this field (the same stack.update path
             as Update, scoped to this field). Failures are toasted + shown in the
             inline error line below, so the button's own inline error is a
             duplicate — suppressed, the #334 pattern. */
          <AsyncButton
            variant="secondary"
            aria-label={`Reload ${fieldId} from file`}
            run={() => reloadFromFile(item, path, kind)}
            onError={() => undefined}
          >
            Reload
          </AsyncButton>
        )}
        {/* `icon`, not `ghost` and not `verb`: the neutral look with a SMALL FIXED
            square. `verb` was the first attempt and it stretched — its `width: 100%`
            is geometry for a sized table column, so in this flex row it fought the
            file name for space. */}
        <Button
          variant="icon"
          aria-label={`Detach ${fieldId} file source`}
          onClick={() => detachFileSource(item.itemId, path)}
        >
          ×
        </Button>
      </div>
      {kind === 'list' && (
        <div style={styles.row}>
          <label style={styles.splitLabel}>
            <input
              type="checkbox"
              checked={state.split}
              onChange={(e) => updateSplitConfig(item.itemId, path, { split: e.target.checked })}
              aria-label={`Split ${fieldId} into items`}
            />
            Split on delimiter
          </label>
          {state.split && (
            <>
              {/* B-113 — a PICKER, not a text box. As a free-text input backed by
                  a <datalist>, this showed only the option matching whatever was
                  already typed: with the default `\n` in the box, the other four
                  delimiters were filtered out and invisible until the operator
                  cleared it. A select lists them all, by NAME, and cannot be
                  typed into — a hand-typed delimiter was only ever a way to
                  produce a split nobody intended.

                  The current value is included even when it is not in the
                  configured list, so removing a delimiter in the modal cannot
                  silently change how an attached field splits. */}
              <select
                className="cg-field"
                style={styles.delimiter}
                value={state.delimiter}
                onChange={(e) =>
                  updateSplitConfig(item.itemId, path, { delimiter: e.target.value })
                }
                aria-label={`${fieldId} split delimiter`}
              >
                {delimiters.every((d) => d.value !== state.delimiter) && (
                  <option value={state.delimiter}>{state.delimiter} (in use)</option>
                )}
                {delimiters.map((d) => (
                  <option key={d.id} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <ManageDelimitersButton onOpen={() => setManaging(true)} />
            </>
          )}
        </div>
      )}
      {kind === 'list' && !state.split && (
        <p style={styles.hint}>Whole file becomes ONE item — separators render exactly as typed.</p>
      )}
      {needsGrant && <p style={styles.hint}>{FILE_SOURCE_NEEDS_PERMISSION_MESSAGE}</p>}
      {state.error !== null && (
        <p style={styles.error} role="alert">
          {state.error}
        </p>
      )}
      {managing && <DelimitersModal onClose={() => setManaging(false)} />}
    </div>
  );
}
