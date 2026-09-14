import { useState, useSyncExternalStore } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import { colors, cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { displayLabel } from '../library/templateName.js';
import { TemplateDefaultsDialog } from './TemplateDefaultsDialog.js';
import { appliedPlateSources } from './livePlates.js';
import { sourcesVersion, subscribeSources } from '../sources/sourceStore.js';

/**
 * 🔴 **`SOURCE-DEFAULTS-20` — THE DOOR TO THE TEMPLATE'S SOURCE DEFAULTS.**
 *
 * The reference draws it as a `link-btn` at the trailing end of a section caption, above the
 * frame selects (gh2, owner 2026-09-14) — one control, in the head of the section whose values
 * it configures.
 *
 * ⚠ **IT IS ONE COMPONENT BECAUSE IT HAS TWO HOSTS, and exactly one of them renders it at a
 * time.** The owner's instruction is that the link belongs with the frames rather than in a
 * section of its own; ours is in `LOOK INPUTS` for a template that declares looks. But that
 * section does not exist for a template WITHOUT looks — and this is the only surface in the
 * product that binds a plate to a source, so such a template would have no door at all and
 * every fresh row of it would start unbound with its take refused (`live-source-unassigned`).
 * That is the trap session BO fell into and reverted. So `LIVE PLATES` carries it in exactly
 * that case, and never alongside.
 */
export function SourceDefaultsLink({
  templateId,
  info,
  plates,
}: {
  templateId: string;
  info: TemplateInfo | null;
  plates: readonly NonNullable<TemplateInfo['liveSources']>['sources'][number][];
}): JSX.Element {
  const [open, setOpen] = useState(false);
  /*
    Re-read when the catalogue or the assignments move: a plate that gains a source must stop
    warning without the operator reselecting the row, and one ORPHANED by a source being
    deleted must start.
  */
  useSyncExternalStore(subscribeSources, sourcesVersion);
  /*
    🔴 **THE DOOR SAYS WHEN IT NEEDS OPENING — owner, 2026-09-14:** «اگر مقادیر دیفالت
    ایرادی داشتن … یه هشدار کوچیک کنار لینک مودال نشون بده که اپراتور متوجه بشه باید
    روش کلیک کنه.»

    ⚠ **THIS IS NOT DECORATION — IT IS THE SIGNAL THE INLINE BLOCK USED TO CARRY.** Each plate
    row used to say `needs a source` beside its own select, in this same amber. Putting the
    editor behind a link took that warning off the panel with it, and an unassigned plate is
    not cosmetic: a take of it is REFUSED (`live-source-unassigned`). Without the mark the
    operator meets that refusal at the take instead of seeing it while building the rundown.

    The CONDITION is unchanged and is asked of the same join the dialog and the take read
    (`appliedPlateSources`), never re-derived — so the dot, the dialog's blank option and the
    refusal cannot disagree about which plate is owed a source.
  */
  const needing = plates.filter(
    (plate) => (appliedPlateSources(templateId, plates).get(plate.sourceId) ?? null) === null,
  ).length;
  const warning =
    needing === 0
      ? undefined
      : needing === 1
        ? '1 plate still needs a source — a take of it will be refused.'
        : `${String(needing)} plates still need a source — a take of them will be refused.`;
  return (
    <>
      {/*
        §3 — **NO ELLIPSIS.** `design.md` §32.1: a trailing `…` means the control hands the
        operator to a BROWSE window — the OS file chooser — and nothing else. This opens an
        in-app dialog, exactly like the status bar's `Lock` and the picker's `Import a .vcg`,
        both of which lost their dots for that reason.

        A `ghost` Button rather than a hand-styled anchor: it is pressable, so it is a real
        control with the focus ring the primitive bakes in.
      */}
      <Button
        variant="ghost"
        style={styles.link}
        data-open-template-defaults=""
        {...(warning !== undefined && { 'data-defaults-needed': String(needing) })}
        {...(warning !== undefined && { title: warning })}
        onClick={() => setOpen(true)}
      >
        Source defaults
        {warning !== undefined && (
          /*
            ⚠ **NEVER COLOUR ALONE.** The dot is amber — this palette's ATTENTION role, the
            same token the `needs a source` line wore, and deliberately NOT red: nothing is
            broken, the work is simply not done yet. But an operator who cannot separate the
            hues must lose nothing, so the COUNT and the consequence are on the control's
            `title` and on the mark's accessible name. The dot is the glance; the sentence is
            the answer.
          */
          <span style={styles.warn} aria-label={warning}>
            {' ●'}
          </span>
        )}
      </Button>
      <TemplateDefaultsDialog
        open={open}
        onClose={() => setOpen(false)}
        templateId={templateId}
        /*
          The operator's word for this template, through the ONE composition (`displayLabel`
          — the file name, else the authored name). `info` is nullable (the registry may not
          have resolved yet) and `displayLabel` takes the two PARTS rather than a whole
          `TemplateInfo`, which is the shape that lets a nullable one be asked without
          inventing a second fallback. Never the `templateId`: that rides the hover.
        */
        templateName={displayLabel(info ?? {}) ?? 'Unnamed template'}
        plates={plates}
      />
    </>
  );
}

const styles = {
  /** ATTENTION, not alarm — `colors.pending`, the token the `needs a source` line used. */
  warn: { color: colors.pending, fontSize: '0.7rem', lineHeight: 1 },
  /**
   * The reference's `link-btn`: a small trailing control in a section caption. It reads as a
   * link while being a real button underneath.
   */
  link: {
    flex: '0 0 auto',
    alignSelf: 'center',
    padding: 0,
    minHeight: 0,
    height: 'auto',
    border: 'none',
    background: 'transparent',
    color: cssVars['--r-accent'],
    fontSize: 'var(--r-text-sm)',
    textDecoration: 'underline',
  },
} as const;
