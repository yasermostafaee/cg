/**
 * 🔴 `MULTI-CHANNEL-01` §2 L — **THE CHANNEL ON SCREEN, FOR A MESSAGE RAISED OUTSIDE REACT.**
 *
 * A refusal is raised from a press handler (`reportCommandError`), far from any hook that knows
 * which channel is selected. It is STAMPED here with the channel the operator was looking at when
 * it was raised, so it stays in that channel's view (`RefusalBanner`) and marks that channel's
 * tab when the operator is elsewhere.
 *
 * `ChannelScope` keeps it current: the same `verbScope` every scoped verb names — the selected
 * channel on a multi-channel station, `null` on a station with one channel, where nothing is
 * scoped and a refusal is shown wherever the operator is, exactly as before.
 */

let scope: number | null = null;

export function setMessageScope(next: number | null): void {
  scope = next;
}

export function readMessageScope(): number | null {
  return scope;
}
