import { Layers, Monitor, MonitorOff, ScrollText, SlidersHorizontal } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { ChannelStrip } from '../channels/ChannelStrip.js';
import { useRehearse } from '../../hooks/useRehearse.js';
import type { ShellLayout } from '../../hooks/useShellLayout.js';

/**
 * 🔴 `AUDIT-CLOSE-01` B1 — THE APP HEADER, WHICH THE REFERENCE DRAWS AND THIS APP DID NOT.
 *
 * ── WHY IT DID NOT EXIST, WHICH IS THE PART WORTH RECORDING ──────────────────────────
 *
 * `design.md` §1.1's very first map row reads _"App header, brand block — no equivalent — the
 * app has no top header"_, and **no property table in ten phases ever revisited it**. It was
 * recorded as an absence and then, in §12.3, USED AS A REASON: the monitors toggle went into
 * the Layers bar "ARGUED: placement — the app has no app-head". An unmeasured absence became
 * its own justification. That is the shape the `AUDIT-CLOSE-01` rule now forbids, and this
 * component is the half of the correction that is code rather than prose.
 *
 * ── WHAT IT CARRIES, AND WHAT IT DELIBERATELY DOES NOT ───────────────────────────────
 *
 * The reference's bar carries: a brand block, a channel select, `Settings`, the monitors
 * toggle, a `PVW · N` badge, and `Templates` / `Import` / `Audit log` at the right. Taken:
 * the brand, the channel strip, the monitors toggle, `PVW · N`, Settings and the audit log.
 *
 * NOT taken, and each for a reason of its own kind rather than a preference:
 *
 *   - `Templates` and `Import` — **the picker's door is the ROW**, and that is a CONTRACT
 *     (`design.md` §15.3, the `Into` select argued the same way). A header button opening the
 *     picker would be a second door with its own refusals about which row it lands on, which
 *     is precisely what the row-scoped load contract exists to avoid.
 *
 * ⭐ `RUNTIME-REPAIR-05` — that contract is now SELECT-then-commit rather than one press, and
 * this argument is untouched by the change: it is about WHICH ROW a load lands on, not about
 * how many presses land it. A header button would still have to invent a destination.
 *   - `PROTOTYPE` — the drawing labelling itself. There is nothing here to adopt.
 *   - The lock and the manual failover stay on the status bar. The reference draws NEITHER,
 *     so there is no reference decision to follow; the failover control is guard item 17 and
 *     belongs beside the fault states it answers.
 *
 * ── THE HEIGHT IS THE POINT ──────────────────────────────────────────────────────────
 *
 * This bar ABSORBS the channel strip rather than sitting above it, so the shell gains a
 * header without gaining a line. See `layerFilter.ts` and `LayersPanel` for the other two
 * halves of the same measurement.
 */

interface Props {
  layout: ShellLayout;
  onOpenSettings: () => void;
  onOpenAudit: () => void;
}

export function AppHeader({ layout, onOpenSettings, onOpenAudit }: Props): JSX.Element {
  const rehearsals = useRehearse();

  return (
    <header className="cg-app-header" data-app-header="">
      {/*
        THE BRAND BLOCK, in the reference's own words (`CG CONTROL`). It is a mark and a
        name, not a control: nothing here is pressable, so it takes no focus and answers no
        keyboard. The glyph is `aria-hidden` by `Icon`'s own default.
      */}
      <span className="cg-app-brand">
        <Icon icon={Layers} size={16} />
        <span className="cg-app-brand__name">CG</span>
        <span className="cg-app-brand__word">CONTROL</span>
      </span>
      {/*
        THE CHANNEL AXIS, moved here from `ChannelScope`'s own strip — the same tablist, the
        same store, the same ids. Only its PLACE changed, which is why `ChannelScope` still
        renders the tab PANEL: the two halves address each other by `idPrefix` + `activeId`.
      */}
      <ChannelStrip />
      <span className="cg-app-header__spacer" />
      {/*
        `PVW · N` — the reference's own badge, and it is NOT a second claim about air (A12):
        it counts rows in REHEARSE, which is the browser's local preview and reaches no
        channel. It reads the same `useRehearse` set the monitors do, so the badge and the
        stage can never disagree about how many rows are in preview.
      */}
      {rehearsals.length > 0 && (
        <span
          className="cg-app-header__pvw"
          data-app-header-pvw=""
          title={`${String(rehearsals.length)} row(s) are rehearsing in this browser — nothing is sent to CasparCG`}
        >
          PVW · {rehearsals.length}
        </span>
      )}
      {/*
        🔴 SHOW / HIDE THE MONITORS — moved off the Layers bar, where Phase 5 put it under
        the argument this component's header quotes. Same flag, same names, same
        `aria-expanded` / `aria-controls`: only the placement moved, and it moved to the
        place the reference draws it.

        🔴 `MONITORS-01` — AND IT IS UNCONDITIONAL, WHICH IS NOW LOAD-BEARING. The strip is
        folded away when the console boots (`DEFAULT_MONITORS_SHOWN`), so this button is the
        ONLY thing on screen that says the monitors exist at all. It therefore renders in
        every state — no `rehearsals.length` gate like `PVW · N` above it, no narrow-mode
        drop — and it carries the WORD as well as the glyph, because a lone glyph on a bar
        the operator has never opened is not a statement that a surface is there. Asserted
        in `shell-chrome.spec.ts` §B4 and `monitorsDefault.dom.test.ts`; do not make it
        conditional, and do not reduce it to an icon to save width.
      */}
      <Button
        variant="ghost"
        aria-label={layout.monitorsShown ? 'Hide monitors' : 'Show monitors'}
        aria-expanded={layout.monitorsShown}
        aria-controls="monitor-strip"
        title={
          layout.monitorsShown
            ? 'Fold PREVIEW and PROGRAM away — the layer list takes the height'
            : 'Bring PREVIEW and PROGRAM back above the layer list'
        }
        onClick={() => {
          layout.setMonitorsShown(!layout.monitorsShown);
        }}
      >
        <Icon icon={layout.monitorsShown ? MonitorOff : Monitor} />
        {layout.monitorsShown ? 'HIDE MONITORS' : 'SHOW MONITORS'}
      </Button>
      {/*
        SETTINGS and AUDIT LOG — the two doors the reference puts up here. Both keep their
        accessible names exactly (`Open Station setup`, `Open audit log`), which is how every
        spec and the e2e fixture address them: this is a relocation, and a relocation that
        renamed its controls would be a rewrite wearing a relocation's clothes.

        ⭐ There is still exactly ONE of each door in the app — `station-setup.spec.ts` §1
        counts them page-wide, and it counts one here instead of one on the status bar.
      */}
      <Button
        onClick={onOpenSettings}
        aria-label="Open Station setup"
        title="Station setup — the station's settings, in one place"
      >
        <Icon icon={SlidersHorizontal} />
        SETTINGS
      </Button>
      {/*
        🔴 `CONSOLE-MATCH-03` §5 — the reference's own word, which is `Audit log` and not
        `LOG`. It matters because the dialog this opens is TITLED "Audit log": a door labelled
        with a shortening of the room behind it is one more thing the operator has to learn,
        and the bar had the width. The accessible name was already `Open audit log` and is
        untouched, so nothing that addresses this button had to move.
      */}
      <Button onClick={onOpenAudit} aria-label="Open audit log">
        <Icon icon={ScrollText} />
        AUDIT LOG
      </Button>
    </header>
  );
}
