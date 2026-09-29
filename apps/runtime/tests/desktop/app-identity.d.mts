/** Types for `app-identity.mjs` — `RELEASE-091-01` §3, each app its own icon and taskbar identity. */
export interface ShortcutRead {
  readonly path: string;
  readonly where: 'start' | 'desktop';
  readonly iconSource: string | null;
  readonly icon: string | null;
  readonly aumid: string | null;
  readonly aumidVia: string | null;
}

export interface IdentityRead {
  readonly exeIcon: string | null;
  readonly shortcuts: readonly ShortcutRead[];
}

export interface AppIdentity extends IdentityRead {
  readonly product: string;
  readonly identifier: string;
  readonly exe: string;
  readonly displayIcon: string | null;
}

export interface IdentityCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export declare function displayIconPath(value: string | null | undefined): string | null;
export declare function parseIdentityRead(text: string): IdentityRead;
export declare function identityChecks(apps: readonly AppIdentity[]): IdentityCheck[];
