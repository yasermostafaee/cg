import type { useUiText } from '../../i18n/locale.js';

const placeholder = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
const backupEnginePrefix = 'CG Bridge on the backup engine: ';
const templates = [
  'Route to {host}',
  'The Playout on port {port}',
  'CasparCG on {host}: waiting for sign-in.',
  "CasparCG on {host}: waiting for the Playout to let CG Bridge's machine in.",
  'Signed in as {name}.',
  'Refused: {detail}',
  "Another CG Bridge drives this engine's CasparCG ({detail}); nothing is sent to it.",
  "Another CG Bridge also drives this engine's CasparCG ({detail}).",
  'CG Control {console} and CG Bridge {bridge} are different releases, so nothing is sent. Install the same release of both.',

  'CG Bridge found at {address}.',
  'CG Bridge on a separate server: {address}.',
  'CG Bridge is not answering at {address}.',
  'CG Bridge {bridge} · this console {console}. Version mismatch.',
  'CG Bridge {bridge} · this console {console}.',
  'This console is signed in as {name}.',
  "CG Bridge's route to {host} leaves through {interface} ({address}).",
  "CG Bridge's route to {host} goes through {interface}, a tunnel. Turn it off, then check again.",
  "CG Bridge's machine has no route to {host}.",
  'No route to {host} was found in time.',
  'No answer from {host} on port {port}.',
  '{host} has no IPv4 address. CG Control reaches the Playout over IPv4 — type its IPv4 address.',
  '{host} has no IPv4 address.',
  '{host} answers, but nothing listens on port {port}.',
  '{host} accepted the connection on port {port} but did not reply in time.',
  '{host} refused the connection on port {port}.',
  '{host} accepted the connection on port {port} but did not answer VERSION. It is not CasparCG, or CasparCG is stuck.',
  '{host} cannot be reached on port {port} ({code}).',
  '{address} is not a Playout address. Type it as http://host:port.',
  'The Playout did not answer at {url}.',
  'The Playout answered {status} at {url}.',
  "The Playout's answer at {url} is not a key set.",
  'The Playout answers and publishes {count} signing key.',
  'The Playout answers and publishes {count} signing keys.',
  'The Playout lists {count} channel for this sign-in.',
  'The Playout lists {count} channels for this sign-in.',
  'Playout {version}.',
  'CasparCG on {host} answered VERSION: {version}.',
  "CasparCG's OSC arrives on port {port}.",
  'No OSC from CasparCG on port {port}: what is on air cannot be confirmed.',
  'CG Bridge is signed in to the Playout as {name}.',
  'CG Bridge is running here and does not answer at {address}.',
  'TCP 5280 here is held by {process} (PID {pid}).',
  "{engine} would fetch graphics from {host}, another machine than CG Bridge's.",
  "{engine} A is the Playout's: {host}.",
  '{engine} A is {host}; the Playout names {playoutHost}: meters, sources and grants are dropped.',
  'CG Bridge on {host}: {detail}',
  'CG Bridge on {host} {detail}',
  'CasparCG on {host}',
];

const patterns = templates.map((template) => {
  const parts = template.split(placeholder);
  const names = parts.filter((_, index) => index % 2 === 1);
  const expression = parts
    .map((part, index) => (index % 2 === 0 ? part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '(.+?)'))
    .join('');
  return { template, names, pattern: new RegExp(`^${expression}$`, 'u') };
});

/** Translate the known check sentences at the console boundary and preserve diagnostic values. */
export function connectionCheckText(text: string, localize: ReturnType<typeof useUiText>): string {
  if (text.startsWith(backupEnginePrefix)) {
    return localize('CG Bridge on the backup engine: {state}', {
      state: connectionCheckText(text.slice(backupEnginePrefix.length), localize),
    });
  }
  const exact = localize(text);
  if (exact !== text) return exact;

  for (const { template, names, pattern } of patterns) {
    const match = pattern.exec(text);
    if (match !== null) {
      return localize(
        template,
        Object.fromEntries(
          names.map((name, index) => [
            name,
            name === 'detail' ? localize(match[index + 1] ?? '') : (match[index + 1] ?? ''),
          ]),
        ),
      );
    }
  }
  return text;
}
