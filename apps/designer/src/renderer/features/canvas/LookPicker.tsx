import type { Look } from '@cg/shared-schema';
import { Select } from '../../ui/Select.js';
import * as s from './CanvasToolbar.css.js';

/**
 * ⭐ **LOOKS phase 2 (`design.md` §14) — the ACTIVE-LOOK selector.**
 *
 * In the canvas header for the `ArrangementPicker` reason: the right panel switches to
 * element properties the moment the author selects something, and selecting something is
 * exactly what you do while authoring a look. The control that says WHAT YOU ARE LOOKING
 * AT lives with the thing you are looking at.
 *
 * ── NO "as authored" OPTION, and that is the model ──────────────────────────
 *
 * Under LOOKS exactly ONE look is always active — a lookless state is unrepresentable at
 * the picker, the same way all-off is unrepresentable at the operator's picker (§14.5).
 * With no session pick the canvas shows the group's DEFAULT, which is also what a fresh
 * take enters — so what the author sees unprompted is what air would show.
 */
export function LookPicker({
  looks,
  activeId,
  onPick,
}: {
  looks: readonly Look[];
  activeId: string | null;
  onPick: (id: string) => void;
}): JSX.Element | null {
  // A template with no looks gets no control — an empty picker would be a permanent
  // affordance for a feature this template does not use.
  if (looks.length === 0) return null;
  return (
    <Select
      className={s.lookPicker}
      value={activeId ?? ''}
      aria-label="Active look"
      title="Which look the canvas shows — a fresh take enters the default (★)"
      onChange={(e) => onPick(e.target.value)}
    >
      {looks.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </Select>
  );
}
