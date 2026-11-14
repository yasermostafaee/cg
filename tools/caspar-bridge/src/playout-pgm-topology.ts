import { isIPv4 } from 'node:net';
import { z } from 'zod';
import { isLoopbackCasparHost } from './playout-catalogue.js';
import { pinnedIPv4, playoutFetch } from './playout-http.js';

const MAX_RESERVES = 3;
const READ_TIMEOUT_MS = 5_000;

const ChannelCodeSchema = z
  .string()
  .trim()
  .min(1)
  .refine((code) => code !== '.' && code !== '..');
const ChannelNumberSchema = z.number().int().positive();
const LinkSchema = z.object({ host: z.string(), remoteCode: ChannelCodeSchema });
const MirrorSchema = z.object({ masterHost: z.string(), masterCode: ChannelCodeSchema });
const ChannelSchema = z.object({
  code: ChannelCodeSchema,
  role: z.string().nullish(),
  mirrorOf: MirrorSchema.nullable(),
  slaves: z.array(z.unknown()),
  primaryOutput: z
    .object({ host: z.string().trim().min(1), channelNumber: ChannelNumberSchema })
    .nullish()
    .catch(undefined),
});
const DiscoverySchema = z.object({
  name: z.string().trim().min(1),
  baseUrl: z.string(),
  self: z.boolean(),
});
const ControlSchema = z.object({
  code: ChannelCodeSchema,
  epoch: z.number().int().nonnegative(),
  transferId: z.string().trim().min(1).nullish(),
  owner: z.string(),
  phase: z.string(),
  canControl: z.boolean(),
  peerHost: z.string().nullish(),
  peerCode: ChannelCodeSchema.nullish(),
});

type Channel = z.infer<typeof ChannelSchema>;
type Discovery = Map<string, { readonly name: string; readonly self: boolean }>;
type Control = z.infer<typeof ControlSchema>;

interface Member {
  readonly origin: URL;
  readonly channelCode: string;
  readonly channel: Channel | null;
}

export interface PlayoutPgmMember {
  /** The normalized API origin. This identity does not change with the active role. */
  readonly key: string;
  readonly name: string;
  readonly channelCode: string;
  readonly physicalChannel: number | null;
  readonly pgmHost: string | null;
}

export interface PlayoutPgmTopology {
  /** The configured endpoint comes first, even if configured on the mirror. */
  readonly members: readonly PlayoutPgmMember[];
  /** Display only. Never an authority to send a command. */
  readonly activeMemberKey: string | null;
}

export interface PlayoutPgmTopologyOptions {
  readonly fetchImpl?: typeof playoutFetch;
  readonly resolveIPv4?: typeof pinnedIPv4;
  readonly signal?: AbortSignal;
}

/** Endpoints advertised in link/discovery rows must be origins, never userinfo or other paths. */
function endpoint(raw: string, protocol?: string): URL | null {
  try {
    const url = new URL(
      protocol !== undefined && !raw.includes('://') ? protocol + '//' + raw : raw,
    );
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username !== '' ||
      url.password !== '' ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== ''
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

function discoveryOf(value: unknown): Discovery {
  const discovery: Discovery = new Map();
  if (!Array.isArray(value)) return discovery;
  const ambiguous = new Set<string>();
  for (const entry of value) {
    const parsed = DiscoverySchema.safeParse(entry);
    if (!parsed.success) continue;
    const url = endpoint(parsed.data.baseUrl);
    if (url === null || ambiguous.has(url.origin)) continue;
    if (discovery.has(url.origin)) {
      discovery.delete(url.origin);
      ambiguous.add(url.origin);
      continue;
    }
    discovery.set(url.origin, { name: parsed.data.name, self: parsed.data.self });
  }
  return discovery;
}

function channelOf(value: unknown, code: string): Channel | null {
  if (!Array.isArray(value)) return null;
  const matches = value.filter(
    (row: unknown) => typeof row === 'object' && row !== null && 'code' in row && row.code === code,
  );
  if (matches.length !== 1) return null;
  const parsed = ChannelSchema.safeParse(matches[0]);
  return parsed.success ? parsed.data : null;
}

/** The configured URL may be loopback while that same Playout advertises its LAN origin. */
function originAliases(origin: URL, discovery: Discovery): ReadonlySet<string> {
  const aliases = new Set([origin.origin]);
  if (isLoopbackCasparHost(origin.hostname)) {
    const self = [...discovery].filter(([, entry]) => entry.self);
    if (self.length === 1 && self[0] !== undefined) aliases.add(self[0][0]);
  }
  return aliases;
}

function linkedOrigin(raw: string, from: URL): URL | null {
  const url = endpoint(raw, from.protocol);
  if (
    url === null ||
    (from.protocol === 'https:' && url.protocol !== 'https:') ||
    isLoopbackCasparHost(url.hostname) ||
    url.hostname === '0.0.0.0'
  )
    return null;
  return url;
}

/** A discovery name must resolve to a reachable class of IPv4, never this Bridge's loopback. */
function isPeerAddress(address: string): boolean {
  if (!isIPv4(address)) return false;
  const [first, second] = address.split('.').map(Number);
  return (
    first !== undefined &&
    first > 0 &&
    first !== 127 &&
    first < 224 &&
    (first !== 169 || second !== 254)
  );
}

function describesMaster(
  mirrorOf: Channel['mirrorOf'],
  master: Member,
  masterAliases: ReadonlySet<string>,
): boolean {
  if (mirrorOf == null || mirrorOf.masterCode !== master.channelCode) return false;
  const owner = endpoint(mirrorOf.masterHost, master.origin.protocol);
  return owner !== null && masterAliases.has(owner.origin);
}

function programmeOf(
  member: Member,
  aliases: ReadonlySet<string>,
): {
  pgmHost: string | null;
  physicalChannel: number | null;
} {
  const output = member.channel?.primaryOutput;
  if (output == null) return { pgmHost: null, physicalChannel: null };
  const sameHost =
    isLoopbackCasparHost(output.host) ||
    [...aliases].some((alias) => new URL(alias).hostname === output.host.toLowerCase());
  return sameHost
    ? { pgmHost: member.origin.hostname, physicalChannel: output.channelNumber }
    : { pgmHost: null, physicalChannel: null };
}

/** A peer's control response must identify a proven member, never a discovered bystander. */
function refersTo(
  control: Control,
  from: Member,
  to: Member,
  aliases: ReadonlySet<string>,
): boolean {
  if (control.peerHost == null || control.peerCode !== to.channelCode) return false;
  const peer = endpoint(control.peerHost, from.origin.protocol);
  return peer !== null && aliases.has(peer.origin);
}

function activeMemberKey(
  members: readonly Member[],
  controls: readonly (Control | null)[],
  aliasesOf: (member: Member) => ReadonlySet<string>,
): string | null {
  const candidates = controls.flatMap((control, index) =>
    control?.owner === 'local' &&
    control.canControl &&
    (control.phase === 'acquired' || (members.length === 1 && control.phase === 'default'))
      ? [index]
      : [],
  );
  const index = candidates.length === 1 ? candidates[0] : undefined;
  if (index === undefined) return null;
  const owner = members[index];
  const claim = controls[index];
  if (owner === undefined || claim == null) return null;

  const agrees = members.every((member, i) => {
    if (i === index)
      return members.length === 1
        ? claim.peerHost == null && claim.peerCode == null
        : members.some((peer) => peer !== owner && refersTo(claim, owner, peer, aliasesOf(peer)));
    const observed = controls[i];
    return (
      observed != null &&
      // Epochs belong to individual engines. A transfer ID, when present, is shared by both ends.
      (claim.transferId != null
        ? observed.transferId === claim.transferId
        : observed.transferId == null && observed.epoch === claim.epoch) &&
      observed.owner === 'peer' &&
      observed.phase === 'observed' &&
      !observed.canControl &&
      refersTo(observed, member, owner, aliasesOf(owner))
    );
  });
  return agrees ? owner.origin.origin : null;
}

/**
 * Discover programme returns for one configured channel without changing any connections.
 * Only addresses advertised both by a trusted link and by fresh discovery are read. A remote
 * output is exposed only after its own catalogue confirms the reciprocal link and output number.
 */
export async function readPlayoutPgmTopology(
  origin: URL,
  channelCode: string,
  options: PlayoutPgmTopologyOptions = {},
): Promise<PlayoutPgmTopology | null> {
  const initialOrigin = endpoint(origin.href);
  const code = ChannelCodeSchema.safeParse(channelCode);
  if (initialOrigin === null || !code.success) return null;

  const fetcher = options.fetchImpl ?? playoutFetch;
  const resolveIPv4 = options.resolveIPv4 ?? pinnedIPv4;
  const timeout = AbortSignal.timeout(READ_TIMEOUT_MS);
  const signal =
    options.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout]);
  const get = async (address: URL, path: string): Promise<unknown> => {
    if (signal.aborted) return null;
    let cancel: () => void = () => undefined;
    const aborted = new Promise<null>((resolve) => {
      cancel = () => resolve(null);
      signal.addEventListener('abort', cancel, { once: true });
    });
    const read = async (): Promise<unknown> => {
      if (address.origin !== initialOrigin.origin) {
        const ip = await resolveIPv4(address.hostname);
        if (ip === null || !isPeerAddress(ip)) return null;
      }
      if (signal.aborted) return null;
      const response = await fetcher(new URL(path, address), {
        method: 'GET',
        redirect: 'error',
        signal,
      });
      return response.ok && !response.redirected ? ((await response.json()) as unknown) : null;
    };
    try {
      return await Promise.race([read(), aborted]);
    } catch {
      return null;
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  };
  const channelsAt = (address: URL): Promise<unknown> => get(address, '/api/v1/channels');
  const discoverAt = async (address: URL): Promise<Discovery> =>
    discoveryOf(await get(address, '/api/v1/discovery/peers'));

  const [initialRows, initialDiscovery] = await Promise.all([
    channelsAt(initialOrigin),
    discoverAt(initialOrigin),
  ]);
  const initialChannel = channelOf(initialRows, code.data);
  if (initialChannel === null) return null;
  const initial: Member = {
    origin: initialOrigin,
    channelCode: initialChannel.code,
    channel: initialChannel,
  };
  const initialAliases = originAliases(initialOrigin, initialDiscovery);
  const initialMirror = initialChannel.mirrorOf;
  let master = initial;
  let masterDiscovery = initialDiscovery;
  if (initialMirror != null) {
    const owner = linkedOrigin(initialMirror.masterHost, initialOrigin);
    if (owner === null || initialAliases.has(owner.origin) || !initialDiscovery.has(owner.origin))
      return null;
    const [rows, discovery] = await Promise.all([channelsAt(owner), discoverAt(owner)]);
    const channel = channelOf(rows, initialMirror.masterCode);
    if (channel === null || channel.mirrorOf != null || channel.role === 'slave') return null;
    master = { origin: owner, channelCode: channel.code, channel };
    masterDiscovery = discovery;
  } else if (initialChannel.role === 'slave') {
    return null;
  }

  const masterAliases = originAliases(master.origin, masterDiscovery);
  const reserveLinks = new Map<string, { origin: URL; channelCode: string }>();
  const duplicateOrigins = new Set<string>();
  let complete = true;
  for (const candidate of master.channel?.slaves ?? []) {
    const link = LinkSchema.safeParse(candidate);
    const address = link.success ? linkedOrigin(link.data.host, master.origin) : null;
    if (!link.success || address === null || masterAliases.has(address.origin)) {
      complete = false;
      continue;
    }
    if (reserveLinks.has(address.origin) || duplicateOrigins.has(address.origin)) {
      reserveLinks.delete(address.origin);
      duplicateOrigins.add(address.origin);
      complete = false;
      continue;
    }
    reserveLinks.set(address.origin, { origin: address, channelCode: link.data.remoteCode });
  }
  if (
    initialMirror != null &&
    ![...initialAliases].some(
      (alias) => reserveLinks.get(alias)?.channelCode === initial.channelCode,
    )
  )
    return null;

  const reserveCandidates = [...reserveLinks.values()].sort((a, b) =>
    a.origin.origin.localeCompare(b.origin.origin),
  );
  if (reserveCandidates.length > MAX_RESERVES) complete = false;

  // Keep the originally configured member in the four-tile set even on a malformed 5+ cluster.
  const initialReserve = reserveCandidates.find(({ origin: address }) =>
    initialAliases.has(address.origin),
  );
  const selectedReserves = [
    ...(initialReserve === undefined ? [] : [initialReserve]),
    ...reserveCandidates.filter((entry) => entry !== initialReserve),
  ].slice(0, MAX_RESERVES);
  const reserves = await Promise.all(
    selectedReserves.map(async (link): Promise<Member> => {
      if (link === initialReserve) return initial;
      const remote = masterDiscovery.has(link.origin.origin)
        ? channelOf(await channelsAt(link.origin), link.channelCode)
        : null;
      return {
        ...link,
        channel:
          remote !== null &&
          (remote.role == null || remote.role === 'slave') &&
          describesMaster(remote.mirrorOf, master, masterAliases)
            ? remote
            : null,
      };
    }),
  );
  const members =
    master === initial
      ? [initial, ...reserves]
      : [initial, master, ...reserves.filter((m) => m !== initial)];

  const aliasesOf = (member: Member): ReadonlySet<string> =>
    member === initial
      ? initialAliases
      : member === master
        ? masterAliases
        : new Set([member.origin.origin]);
  const named = members.map((member) => ({
    member,
    name:
      [...aliasesOf(member)]
        .map((alias) => (member === initial ? initialDiscovery : masterDiscovery).get(alias)?.name)
        .find((name) => name !== undefined) ?? member.origin.hostname,
  }));
  const result = named.map(({ member, name }) => ({
    key: member.origin.origin,
    name:
      named.filter((entry) => entry.name.toLowerCase() === name.toLowerCase()).length > 1
        ? name + ' (' + member.origin.hostname + ')'
        : name,
    channelCode: member.channelCode,
    ...programmeOf(member, aliasesOf(member)),
  }));

  const controls =
    complete && members.every(({ channel }) => channel !== null)
      ? await Promise.all(
          members.map(async (member): Promise<Control | null> => {
            const response = await get(
              member.origin,
              '/api/v1/channels/' + encodeURIComponent(member.channelCode) + '/redundancy/control',
            );
            const parsed = ControlSchema.safeParse(response);
            return parsed.success && parsed.data.code === member.channelCode ? parsed.data : null;
          }),
        )
      : [];
  if (signal.aborted && options.signal?.aborted) return null;
  return { members: result, activeMemberKey: activeMemberKey(members, controls, aliasesOf) };
}
