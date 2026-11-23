import { useUiText } from '../../i18n/locale.js';
import { useState, useSyncExternalStore } from 'react';
import type { ControlLiveLayout, LiveSourceDeclaration } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { plateDisplayName } from '../../ui/operatorNaming.js';
import { SourcePicker } from '../sources/SourcePicker.js';
import { InputCatalogueServer } from '../sources/InputCatalogueServer.js';
import { MediaPlaybackControl } from '../sources/MediaPlayback.js';
import { controlLiveLayoutDefaults, withChannelDefaults } from '@cg/shared-ipc';
import {
  commitSourceAssignments,
  currentSourceAssignments,
  currentSourceCatalog,
  sourcesVersion,
  subscribeSources,
} from '../sources/sourceStore.js';
import { appliedPlateSources } from './livePlates.js';

/**
 * 🔴 **`SOURCE-DEFAULTS-20` — THE TEMPLATE'S SOURCE DEFAULTS, BEHIND A LINK.**
 *
 * This is a RELOCATION, not a new capability. The same values were editable inline in the
 * Inspector's LIVE PLATES section, under the heading _"The DEFAULT every row using this
 * template starts from."_ — a per-plate select list that occupied a permanent slice of a
 * 396 px panel. The reference does not put it in the panel: it is a link in the section head
 * that opens a dialog, and that is what this is.
 *
 * **Nothing about the data changes.** Same store, same channel, same refusal.
 *
 * ── 🔴 THE SCOPE — PER CHANNEL, AND THE TITLE SAYS SO ───────────────────────
 *
 * `CHANNEL-SOURCES-01` decision 2 (the owner, 2026-09-28): **Source defaults belong to a
 * channel.** The owner changed CH 2's defaults and CH 1's changed with them, because the store
 * was keyed `(template, plate)` alone. It is keyed `(channel, template, plate)` now
 * (`TemplateSourceAssignmentSchema.channel`), so this dialog edits the defaults of the channel
 * it was opened from — the row's — and its title names that channel, as the reference always
 * did (`Channel N · source defaults`). This header used to explain why the title must NOT name a
 * channel: then, the scope was the whole station, and a channel in the title would have been a
 * surface lying about its scope. The scope moved; the title moved with it.
 *
 * ── WHAT THIS DIALOG MAY NOT DO ─────────────────────────────────────────────
 *
 * 🔴 It sends NOTHING to CasparCG. An assignment is read when a row is TAKEN; it never
 * re-composites a graphic already on the channel, and a row that has been taken has FROZEN
 * this value (`caspar-runtime.ts` `#frozenAssignments`) so the edit reaches it at its next
 * take and never inside a switch. Golden rule 10: this is a configuration verb, and the footer
 * says so where the operator can read it.
 *
 * 🔴 Row overrides are a DIFFERENT LEVEL and are untouched. The resolution chain is the row's
 * emergency patch, then the row's per-look input, then this default; writing here cannot reach
 * either of the two above it.
 */
export function TemplateDefaultsDialog({
  open,
  onClose,
  templateId,
  templateName,
  plates,
  channel,
  layout,
}: {
  open: boolean;
  onClose: () => void;
  templateId: string;
  /** For the subtitle — the operator's word for this template, isolated like every name. */
  templateName: string;
  /** The template's DECLARED plates, in declaration order. */
  plates: readonly LiveSourceDeclaration[];
  /** `CHANNEL-SOURCES-01` — the channel whose defaults this dialog edits: the row's. */
  channel: number;
  layout?: ControlLiveLayout | undefined;
}): JSX.Element | null {
  const localizeUi = useUiText();
  useSyncExternalStore(subscribeSources, sourcesVersion);
  /*
    The edit is LOCAL to this dialog and committed by its own button — it does not ride the
    Inspector's draft store. That is deliberate and it is the whole point of the move: the
    value is TEMPLATE-wide, so staging it beside a ROW's field edits would put an
    installation-level change into a row's Update, which is the scope confusion the inline
    block's own header warned about. `Cancel` therefore discards by closing, with nothing
    staged anywhere.
  */
  const [draft, setDraft] = useState<ReadonlyMap<string, string> | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  /*
    🔴 **CLOSING DISCARDS — and this had to be written down because the obvious spelling is
    wrong.** `open` only makes this component return `null`; the component itself stays
    MOUNTED, so `useState` survives a close. Handing `onClose` straight to Cancel and to the
    ✕ therefore left the abandoned edit in place, and the next open showed the operator the
    value they had just declined to save. Caught by the Cancel spec, which reopens and reads
    the box rather than trusting the press.

    ⚠ The refusal goes with it: a sentence about a value that is no longer staged is a
    sentence about nothing.
  */
  const close = (): void => {
    setDraft(null);
    setRefusal(null);
    onClose();
  };

  if (!open) return null;

  const explicit = appliedPlateSources(templateId, plates, channel);
  const authoredDefaults = controlLiveLayoutDefaults(layout);
  const valueOf = (plateId: string): string => draft?.get(plateId) ?? explicit.get(plateId) ?? '';
  const stage = (plateId: string, sourceId: string): void => {
    setDraft((prev) => {
      const next = new Map(prev ?? []);
      next.set(plateId, sourceId);
      return next;
    });
    // A new edit supersedes the last refusal's subject; leaving it up would pin a sentence
    // about a value the operator has already changed.
    setRefusal(null);
  };

  async function commit(): Promise<{ accepted: boolean }> {
    if (draft === null) return { accepted: true };
    /*
      🔴 **THIS CHANNEL'S ENTRIES, AND NOTHING ELSE — `CHANNEL-SOURCES-01` decision 2.** The write
      is `@cg/shared-ipc`'s `withChannelDefaults`: the staged plates are written ON THIS CHANNEL,
      every other channel's entries and every other template's stay as they are, and a plate set
      to `None` loses this channel's entry (an assignment naming nothing is a state nothing
      downstream can read).

      ⚠ **THE EXISTING ENTRY IS STILL SPREAD, NOT REBUILT FROM THREE FIELDS** — inside that
      function now. `TemplateSourceAssignment` carries an optional `fitMode` (`C-028`), and a
      writer that reconstructs `{ templateId, plateId, sourceId }` would delete it for every plate
      it touches: a latent loss, which is exactly the kind of defect that ships.
    */
    const res = await commitSourceAssignments(
      withChannelDefaults(currentSourceAssignments(), channel, templateId, draft),
    );
    if (res !== null) {
      /*
        🔴 REFUSED WITH A REASON, NEVER SILENTLY REWRITTEN (§6). The rule sentence is shown in
        the dialog's message region — one line, never the bridge's words beside it
        (`DELTA-MULTI-CHANNEL-01-A` A5) — the staged values stay exactly as the operator left
        them, and the dialog stays open so the edit is still theirs to correct.
      */
      setRefusal(res.text);
      return { accepted: false };
    }
    setDraft(null);
    onClose();
    return { accepted: true };
  }

  return (
    <Modal
      /*
        `CHANNEL-SOURCES-01` — THE CHANNEL IS IN THE TITLE: the defaults are this channel's (see the
        module header), in the console's own `· CH n` spelling.
      */
      title={localizeUi('Source defaults · CH {channel}', { channel: String(channel) })}
      ariaLabel={localizeUi('Source defaults · CH {channel}', { channel: String(channel) })}
      onClose={close}
      size="prose"
      /*
        🔴 THE SHARED FIXED FRAME, through the door `PLATES-AUDIO-11` §5 opened — one height
        expression (`--r-modal-h-frame`), not a second mechanism. The list of plates is what
        changes under the operator here: a template with three plates and one with one must
        not draw two different boxes, or the button he is aiming at moves with the template.
      */
      frame="fixed"
      {...(refusal !== null && { message: { role: 'refusal' as const, text: refusal } })}
      footer={
        <>
          <ModalAction actionRole="cancel" onClick={close}>
            {localizeUi('Cancel')}
          </ModalAction>
          {/*
            ORDINARY PRIMARY. Saving a default destroys nothing and reaches no output, so it
            takes the plain primary treatment — red is for controls that destroy and for
            nothing else (`design.md` §29.2).
          */}
          <AsyncButton
            variant="primary"
            data-defaults-save=""
            disabled={draft === null}
            run={commit}
            onError={() => undefined}
          >
            {localizeUi('Save defaults')}
          </AsyncButton>
        </>
      }
    >
      <div data-defaults-body="">
        <p style={styles.intro} data-defaults-intro="">
          {localizeUi('Edit the starting source mappings for')}{' '}
          <strong>
            <IsolatedName>{templateName}</IsolatedName>
          </strong>
          {localizeUi(
            '. These defaults apply to every row on CH {channel} using this template; row overrides remain separate.',
            { channel: String(channel) },
          )}
        </p>
        {plates.length === 0 ? (
          /*
            §3 — a template with NO plates SAYS WHY rather than showing an empty box. Not
            reachable from the Inspector today (the section carrying the link does not render
            for such a template), but a template can lose its plates under an open dialog
            through a re-import, and a blank panel would read as broken rather than as empty.
          */
          <p style={styles.empty} data-defaults-empty="">
            {localizeUi('This template declares no live plates, so it has no sources to default.')}
          </p>
        ) : (
          <>
            <InputCatalogueServer server={currentSourceCatalog().inputsServer} />
            <div className="cg-form cg-form-rows">
              {plates.map((plate) => {
                const label = plateDisplayName(plate.sourceId, plates, layout);
                const authored = authoredDefaults?.[plate.sourceId];
                const picked = valueOf(plate.sourceId);
                return (
                  <div key={plate.elementId} className="cg-form-row">
                    <label
                      htmlFor={`plate-default-${plate.sourceId}`}
                      className="cg-form-row__label"
                    >
                      <IsolatedName>{label}</IsolatedName>
                    </label>
                    {/*
                  🔴 `PLAYOUT-SOURCES-01` §2.A — THE ONE PICKER. It only returns a choice; this
                  dialog's own model is unchanged — the choice is staged, and `Save defaults`
                  commits it. Template-wide, so no channel gates the inputs here.
                */}
                    <SourcePicker
                      className="cg-form-row__control"
                      id={`plate-default-${plate.sourceId}`}
                      aria-label={localizeUi('Default source for {name}', { name: label })}
                      data={{ 'data-defaults-select': plate.sourceId }}
                      value={picked}
                      onChange={(sourceId) => stage(plate.sourceId, sourceId)}
                      choices={[
                        authored === undefined
                          ? { value: '', label: 'None' }
                          : { value: '', label: 'Use layout input', names: authored },
                      ]}
                      previewChannel={channel}
                    />
                    {/* `MEDIA-PLATES-01` §2 — a bound clip's Playback, the clip's own and station-wide. */}
                    <MediaPlaybackControl sourceId={picked || authored || ''} />
                  </div>
                );
              })}
            </div>
            {/*
              §3 — WHAT IT CHANGES AND THAT NO PLAYOUT COMMAND IS SENT, in our words rather
              than the prototype's "Only the sample configuration changes here" — which is
              true of a demo and says nothing about a station.

              Golden rule 10 on the surface: this is a CONFIGURATION verb. It reaches no
              output at all, and a row that has already been taken keeps what it froze until
              its next take — the half an operator editing a live show needs to read.
            */}
            <p style={styles.foot} data-defaults-foot="">
              {localizeUi(
                'Applies to every row on CH {channel} using this template, at its next take. No playout command is sent.',
                { channel: String(channel) },
              )}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

const styles = {
  intro: {
    color: colors.textSecondary,
    fontSize: 'var(--r-text-md)',
    lineHeight: 1.5,
    margin: '0 0 var(--r-space-6)',
  },
  empty: { color: colors.textMuted, fontSize: 'var(--r-text-md)', margin: 0 },
  foot: {
    margin: 'var(--r-space-6) 0 0',
    color: colors.textMuted,
    fontSize: 'var(--r-text-sm)',
    lineHeight: 1.5,
  },
} as const;
