/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B2 — **A FIREWALL RULE IS JUDGED BY ITS FIELDS, NEVER BY ITS NAME.**
 *
 * The installer smoke used to accept a rule when `netsh … show rule verbose` merely CONTAINED `6250`,
 * `UDP` and the sidecar's path — and the rule's own NAME ("CG Control - OSC from CasparCG (UDP 6250)")
 * carries the first two, so a rule on the wrong port, the wrong protocol, blocking, disabled or
 * outbound passed. This reads the fields `netsh` prints for each rule and checks each one.
 *
 * Pure and dependency-free: both clean-runner smokes run it (a sparse checkout of this file — CG
 * Bridge's `tools/bridge-installer/smoke.mjs` too, `CENTRAL-BRIDGE-01`), and
 * `tests/installerFirewallRule.test.ts` proves it refuses each wrong field.
 *
 * `netsh` prints its field names in the system's display language; the runner is `en-US`.
 */

/** Every rule `netsh advfirewall firewall show rule name=… verbose` printed, as `field → value`. */
export function parseRules(text) {
  const rules = [];
  let current = null;
  for (const raw of (text ?? '').split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z ]*?):\s+(.*?)\s*$/.exec(raw);
    if (match === null) continue;
    const [, field, value] = match;
    if (field === 'Rule Name') {
      current = { 'Rule Name': value };
      rules.push(current);
    } else if (current !== null) {
      current[field] = value;
    }
  }
  return rules;
}

/**
 * What is wrong with the rule named `expected.name`, as one line each — `[]` when there is exactly
 * one, it is enabled, inbound, allowing, on every profile, for `expected.protocol` on
 * `expected.port`, and for `expected.program` alone.
 *
 * `expected.port` is one spelling, or every spelling `netsh` may print for the same ports: a rule
 * added for `6251,6252` may read back as `6251-6252`. A list is a set of spellings of ONE value,
 * never a looser port — anything outside it is still refused.
 */
export function ruleProblems(text, expected) {
  const rules = parseRules(text).filter((rule) => rule['Rule Name'] === expected.name);
  if (rules.length !== 1)
    return [`${String(rules.length)} rules are named "${expected.name}", not one`];
  const [rule] = rules;
  const problems = [];
  const want = (field, value, same = (a, b) => a === b) => {
    const got = rule[field];
    if (got === undefined || !same(got, value)) {
      problems.push(`${field} is ${got === undefined ? 'missing' : `"${got}"`}, not "${value}"`);
    }
  };
  want('Enabled', 'Yes');
  want('Direction', 'In');
  want('Action', 'Allow');
  want('Protocol', expected.protocol);
  const ports = Array.isArray(expected.port) ? expected.port : [expected.port];
  want('LocalPort', ports.join('" or "'), (got) => ports.includes(got));
  want('Program', expected.program, (a, b) => a.toLowerCase() === b.toLowerCase());
  want('Profiles', 'Domain,Private,Public');
  return problems;
}
