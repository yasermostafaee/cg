import { execFileSync } from 'node:child_process';

/**
 * 🔴 `CENTRAL-BRIDGE-01` §1 A — **CG BRIDGE'S INBOUND FIREWALL RULES: OURS BY NAME, SCOPED TO OUR EXE,
 * FOR THE PORTS IN FORCE.**
 *
 *   - `CG Bridge - consoles`          TCP <control port>   (every console connects here)
 *   - `CG Bridge - template pages`    TCP <template port>  (a core on another machine fetches pages)
 *   - `CG Bridge - OSC from CasparCG` UDP <osc port>,<osc port + 1>  (a REMOTE core's OSC — a backup,
 *                                     or this bridge on a separate server; the local core's OSC is
 *                                     loopback and needs no rule. `+ 1` is server B's, D14)
 *
 * Each rule names the installed `cg-bridge.exe` itself, so no other program gains a port. The ports
 * come from the configuration in force (`--service-config`), never from what an installer guessed —
 * an upgrade that kept a custom port keeps its rule on that port. The installer and the uninstaller
 * run this (`--firewall add|remove`); they only ever DELETE RULES BY THESE NAMES, never another's.
 */

export const FIREWALL_RULES = {
  consoles: 'CG Bridge - consoles',
  templates: 'CG Bridge - template pages',
  osc: 'CG Bridge - OSC from CasparCG',
} as const;

export interface FirewallPorts {
  readonly control: number;
  readonly templates: number;
  readonly osc: number;
}

/** The `netsh advfirewall firewall …` argument lists that REMOVE our rules (a missing one is fine). */
export function removeRuleCommands(): string[][] {
  return Object.values(FIREWALL_RULES).map((name) => [
    'advfirewall',
    'firewall',
    'delete',
    'rule',
    `name=${name}`,
  ]);
}

/** The argument lists that ADD our rules for these ports, each scoped to `program`. */
export function addRuleCommands(program: string, ports: FirewallPorts): string[][] {
  const rule = (name: string, protocol: 'TCP' | 'UDP', localport: string): string[] => [
    'advfirewall',
    'firewall',
    'add',
    'rule',
    `name=${name}`,
    'dir=in',
    'action=allow',
    `program=${program}`,
    `protocol=${protocol}`,
    `localport=${localport}`,
    'profile=any',
    'enable=yes',
  ];
  return [
    rule(FIREWALL_RULES.consoles, 'TCP', String(ports.control)),
    rule(FIREWALL_RULES.templates, 'TCP', String(ports.templates)),
    rule(FIREWALL_RULES.osc, 'UDP', `${String(ports.osc)},${String(ports.osc + 1)}`),
  ];
}

/** Runs one `netsh` argument list; the exit code (0 = done). Injected in tests. */
export type NetshRunner = (args: readonly string[]) => number;

export const runNetsh: NetshRunner = (args) => {
  try {
    execFileSync('netsh', [...args], { windowsHide: true, stdio: 'ignore' });
    return 0;
  } catch (err) {
    const status = (err as { status?: number }).status;
    return typeof status === 'number' ? status : 1;
  }
};

/**
 * `add`: delete ours, then add ours — installing again replaces them. `remove`: delete ours. Returns
 * the add commands that FAILED (a delete of a rule that is not there is not a failure).
 */
export function applyFirewallRules(
  action: 'add' | 'remove',
  program: string,
  ports: FirewallPorts,
  run: NetshRunner = runNetsh,
): string[][] {
  for (const args of removeRuleCommands()) run(args);
  if (action === 'remove') return [];
  return addRuleCommands(program, ports).filter((args) => run(args) !== 0);
}
