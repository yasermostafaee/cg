import { describe, expect, it } from 'vitest';
import { parseRules, ruleProblems } from './desktop/firewall-rule.mjs';

/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B2 — the installer smoke judges each firewall rule by the FIELDS `netsh`
 * prints, so a rule whose NAME says "UDP 6250" but whose port, protocol, direction or action does
 * not is refused. The old check only asked whether the text contained `6250`, `UDP` and the path —
 * and the name alone carries the first two.
 */

const PROGRAM = 'C:\\Program Files\\CG Control\\cg-bridge.exe';
const NAME = 'CG Control - OSC from CasparCG (UDP 6250)';
const EXPECTED = { name: NAME, protocol: 'UDP', port: '6250', program: PROGRAM } as const;

/** `netsh advfirewall firewall show rule name=… verbose`, as an en-US Windows prints it. */
function netsh(fields: Partial<Record<string, string>> = {}, name = NAME): string {
  const all: Record<string, string> = {
    Description: '',
    Enabled: 'Yes',
    Direction: 'In',
    Profiles: 'Domain,Private,Public',
    Grouping: '',
    LocalIP: 'Any',
    RemoteIP: 'Any',
    Protocol: 'UDP',
    LocalPort: '6250',
    RemotePort: 'Any',
    'Edge traversal': 'No',
    Program: PROGRAM,
    InterfaceTypes: 'Any',
    Security: 'NotRequired',
    'Rule source': 'Local Setting',
    Action: 'Allow',
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) delete all[key];
    else all[key] = value;
  }
  const lines = [`Rule Name:                            ${name}`, '-'.repeat(70)];
  for (const [key, value] of Object.entries(all)) lines.push(`${`${key}:`.padEnd(38)}${value}`);
  return `\r\n${lines.join('\r\n')}\r\n\r\n`;
}

describe('CLIENT-TEST-RELEASE-01 B2 — a firewall rule is judged by its fields', () => {
  it('the rule the installer adds passes', () => {
    expect(parseRules(netsh())).toHaveLength(1);
    expect(ruleProblems(`${netsh()}Ok.\r\n`, EXPECTED)).toEqual([]);
  });

  it('CONTROL — the NAME alone no longer satisfies it: a rule named "UDP 6250" on 6251 is refused', () => {
    expect(ruleProblems(netsh({ LocalPort: '6251' }), EXPECTED)).toEqual([
      'LocalPort is "6251", not "6250"',
    ]);
  });

  it.each([
    [{ Protocol: 'TCP' }, 'Protocol is "TCP", not "UDP"'],
    [{ Direction: 'Out' }, 'Direction is "Out", not "In"'],
    [{ Action: 'Block' }, 'Action is "Block", not "Allow"'],
    [{ Enabled: 'No' }, 'Enabled is "No", not "Yes"'],
    [{ Profiles: 'Private' }, 'Profiles is "Private", not "Domain,Private,Public"'],
    [{ Program: 'Any' }, `Program is "Any", not "${PROGRAM}"`],
    [{ Program: undefined }, `Program is missing, not "${PROGRAM}"`],
  ])('refuses %j', (fields, problem) => {
    expect(ruleProblems(netsh(fields), EXPECTED)).toEqual([problem]);
  });

  it('the program is compared as Windows compares paths — case does not matter', () => {
    expect(ruleProblems(netsh({ Program: PROGRAM.toUpperCase() }), EXPECTED)).toEqual([]);
  });

  it('none, or two, by that name is refused — the installer replaces its rules, never doubles them', () => {
    expect(ruleProblems('No rules match the specified criteria.', EXPECTED)).toEqual([
      `0 rules are named "${NAME}", not one`,
    ]);
    expect(ruleProblems(netsh() + netsh(), EXPECTED)).toEqual([
      `2 rules are named "${NAME}", not one`,
    ]);
    // A different rule in the same output is not counted.
    expect(ruleProblems(netsh() + netsh({}, 'Another rule'), EXPECTED)).toEqual([]);
  });
});
