import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';

export function literalAddress(address: string | null | undefined): string | undefined {
  if (address == null) return undefined;
  const host = address.startsWith('[') && address.endsWith(']') ? address.slice(1, -1) : address;
  const family = isIP(host);
  if (family === 4) return host;
  if (family !== 6 || host.includes('%')) return undefined;
  const ipv6 = new URL(`http://[${host}]`).hostname.slice(1, -1);
  const [, upperHex, lowerHex] = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(ipv6) ?? [];
  if (upperHex === undefined || lowerHex === undefined) return ipv6;
  const upper = Number.parseInt(upperHex, 16);
  const lower = Number.parseInt(lowerHex, 16);
  return [upper >> 8, upper & 255, lower >> 8, lower & 255].join('.');
}

export function isLocalAddress(address: string | null | undefined): boolean {
  const normalized = literalAddress(address);
  if (normalized === undefined) return false;
  if (normalized === '::1' || normalized.startsWith('127.')) return true;
  return Object.values(networkInterfaces()).some((entries) =>
    entries?.some(({ address }) => literalAddress(address) === normalized),
  );
}
