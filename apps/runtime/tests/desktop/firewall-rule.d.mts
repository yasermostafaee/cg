/** Types for `firewall-rule.mjs` — `CLIENT-TEST-RELEASE-01` B2, a firewall rule judged by its fields. */
export declare function parseRules(text: string | null | undefined): Record<string, string>[];
export declare function ruleProblems(
  text: string | null | undefined,
  expected: {
    readonly name: string;
    readonly protocol: 'UDP' | 'TCP';
    /** One spelling, or every spelling `netsh` may print for the same ports. */
    readonly port: string | readonly string[];
    readonly program: string;
  },
): string[];
