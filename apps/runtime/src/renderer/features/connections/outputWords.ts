import type { MissingConsumer, RunningConsumer } from '@cg/shared-ipc';

/**
 * `B-223` — the words both output surfaces share: the operator banner's one line and the
 * technical section's rows say "decklink (device 23487013)" the same way, from ONE spelling.
 */

/** "decklink (device 23487013)" / "screen" / "decklink ×2 (1 running)" — the declared things not running. */
export function missingWords(missing: readonly MissingConsumer[]): string {
  return missing
    .map((m) => {
      const count = m.declared > 1 ? ` ×${String(m.declared)} (${String(m.running)} running)` : '';
      return m.devices.length > 0
        ? `${m.kind} (device ${m.devices.join(', ')})${count}`
        : `${m.kind}${count}`;
    })
    .join(', ');
}

export function runningWords(running: readonly RunningConsumer[]): string {
  return running.length === 0 ? 'nothing' : running.map((r) => r.kind).join(', ');
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
