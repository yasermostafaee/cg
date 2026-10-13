import { describe, expect, it } from 'vitest';
import {
  FIREWALL_RULES,
  addRuleCommands,
  applyFirewallRules,
  removeRuleCommands,
} from '../src/firewall-rules.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` §1 A — CG Bridge's firewall rules: ours by name, scoped to our exe, for the
 * ports in force; the installer and uninstaller only ever delete rules by OUR names.
 */

const EXE = 'C:\\Program Files\\CG Bridge\\cg-bridge.exe';

describe('the rules', () => {
  it('three named rules, each scoped to the installed exe, on the ports in force', () => {
    expect(addRuleCommands(EXE, { control: 5280, templates: 7911, osc: 6251 })).toEqual([
      [
        'advfirewall',
        'firewall',
        'add',
        'rule',
        'name=CG Bridge - consoles',
        'dir=in',
        'action=allow',
        `program=${EXE}`,
        'protocol=TCP',
        'localport=5280',
        'profile=any',
        'enable=yes',
      ],
      [
        'advfirewall',
        'firewall',
        'add',
        'rule',
        'name=CG Bridge - template pages',
        'dir=in',
        'action=allow',
        `program=${EXE}`,
        'protocol=TCP',
        'localport=7911',
        'profile=any',
        'enable=yes',
      ],
      [
        'advfirewall',
        'firewall',
        'add',
        'rule',
        'name=CG Bridge - OSC from CasparCG',
        'dir=in',
        'action=allow',
        `program=${EXE}`,
        'protocol=UDP',
        'localport=6251,6252',
        'profile=any',
        'enable=yes',
      ],
    ]);
  });

  it('🔴 never 6250 — the OSC rule is our port and server B’s, one above', () => {
    const osc = addRuleCommands(EXE, { control: 5280, templates: 7911, osc: 6251 })[2] ?? [];
    expect(osc.join(' ')).not.toContain('6250');
  });

  it('a delete names only our rules', () => {
    expect(removeRuleCommands().map((args) => args[4])).toEqual([
      `name=${FIREWALL_RULES.consoles}`,
      `name=${FIREWALL_RULES.templates}`,
      `name=${FIREWALL_RULES.osc}`,
    ]);
  });
});

describe('applying them', () => {
  it('add = delete ours, then add ours — installing again replaces, never doubles', () => {
    const ran: string[] = [];
    const failed = applyFirewallRules(
      'add',
      EXE,
      { control: 5280, templates: 7911, osc: 6251 },
      (args) => {
        ran.push(`${args[2] ?? ''} ${args[4] ?? ''}`);
        return 0;
      },
    );
    expect(failed).toEqual([]);
    expect(ran).toEqual([
      'delete name=CG Bridge - consoles',
      'delete name=CG Bridge - template pages',
      'delete name=CG Bridge - OSC from CasparCG',
      'add name=CG Bridge - consoles',
      'add name=CG Bridge - template pages',
      'add name=CG Bridge - OSC from CasparCG',
    ]);
  });

  it('remove deletes ours and adds nothing; a delete of a missing rule is not a failure', () => {
    const ran: string[] = [];
    expect(
      applyFirewallRules('remove', EXE, { control: 5280, templates: 7911, osc: 6251 }, (args) => {
        ran.push(args[2] ?? '');
        return 1;
      }),
    ).toEqual([]);
    expect(ran).toEqual(['delete', 'delete', 'delete']);
  });

  it('an add that fails is returned, to be said', () => {
    const failed = applyFirewallRules(
      'add',
      EXE,
      { control: 5280, templates: 7911, osc: 6251 },
      (args) => (args[2] === 'add' && (args[4] ?? '').includes('template') ? 5 : 0),
    );
    expect(failed.map((args) => args[4])).toEqual(['name=CG Bridge - template pages']);
  });
});
