import type { ConsumerCreation, MissingConsumer, RunningConsumer } from '@cg/shared-ipc';

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

/** What the bridge did about it, when `--create-missing-consumers` is on — the wire's answer read back. */
export function creationWords(creation: ConsumerCreation): string {
  const at = formatClock(creation.at);
  switch (creation.outcome) {
    case 'created':
      return `The bridge re-created it at ${at} (${creation.command ?? 'ADD'}); the next check confirms whether it is running.`;
    case 'refused':
      return (
        `The bridge tried to re-create it at ${at} (${creation.command ?? 'ADD'}) and CasparCG refused` +
        `${creation.code !== undefined ? ` (${String(creation.code)})` : ''} — it cannot open that device either.`
      );
    case 'failed':
      return `The bridge tried to re-create it at ${at} (${creation.command ?? 'ADD'}) and the command did not complete.`;
    case 'not-attempted':
      return `Creation is on, but ${creation.note ?? 'this kind is not one the bridge creates'}.`;
  }
}
