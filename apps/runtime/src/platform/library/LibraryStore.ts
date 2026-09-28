import {
  describeTemplateReferences,
  type FixedLayerBank,
  type TemplateInfo,
  type TemplateReference,
} from '@cg/shared-ipc';
import type { Workspace } from '@cg/storage';

/**
 * One registered template: the operator-facing metadata plus the produced
 * self-contained standalone HTML (runtime + scene + assets inlined). The HTML is
 * what the bridge serves to CasparCG over HTTP, so it is retained here and
 * re-delivered to the bridge on every (re)connect.
 */
export interface LibraryEntry {
  template: TemplateInfo;
  html: string;
  /**
   * 🔴 `CHANNEL-TEMPLATES-01` — the channel this browser imported it ON. Each channel has its own
   * list, so a record is that channel's and is re-delivered to that channel only.
   *
   * ABSENT on a record written before the per-channel lists: the station-wide library it was
   * part of is every channel's list now, so such a record answers for any channel that holds no
   * record of its own for the template, and is re-delivered naming no channel — which the bridge
   * reads as "restore it if no channel lists it", never as a replacement.
   */
  channel?: number;
}

export interface RemoveResult {
  ok: boolean;
  reason?: 'in-use' | 'unknown-template';
  message?: string;
  /** `B-212` — with `in-use`: where each referencing item is. */
  references?: TemplateReference[];
}

const DIR = 'library';

/**
 * The on-disk filename. `IdSchema` is `z.string().min(1)` and permits any non-empty string, so a
 * raw id is not guaranteed filename-safe: it is percent-encoded, and the real templateId (and
 * channel) is carried INSIDE the record, so hydrate never needs to decode the name back. A
 * channel's record is prefixed `<channel>@` — `encodeURIComponent` always encodes `@`, so no
 * pre-channel name (`<encoded id>.json`) can collide with one.
 */
function pathFor(templateId: string, channel: number | undefined): string {
  const name = encodeURIComponent(templateId);
  return channel === undefined ? `${DIR}/${name}.json` : `${DIR}/${String(channel)}@${name}.json`;
}

/** A channel's record, keyed — `channel` and id, never decoded from anything. */
function keyOf(channel: number, templateId: string): string {
  return `${String(channel)}\u0000${templateId}`;
}

/**
 * Browser-local, file-based source of truth for the Runtime template library
 * (B-085). Backed by a `@cg/storage` `Workspace` (OPFS in the browser, in-memory
 * in tests), so the library is owned by the SPA — not the bridge process — and
 * therefore works with the bridge fully down and survives a page reload.
 *
 * This class is pure persistence + an in-memory index: it knows nothing about the
 * SPA↔bridge link. The `WebSocketRuntime` owns delivery/reconcile to the bridge
 * (it is the thing that knows the connection state), which keeps this store
 * unit-testable off any socket. It REPLACES `WebSocketRuntime.#retained` — the
 * index IS the retention set re-delivered on reconnect (`entries()`), now
 * persistent.
 *
 * 🔴 `CHANNEL-TEMPLATES-01` — PER CHANNEL, like the bridge's lists: what this browser imported on
 * each channel, plus the pre-channel records it held before the lists existed.
 */
export class LibraryStore {
  readonly #ws: Workspace;
  /** channel+id → the record this browser imported on that channel. */
  readonly #own = new Map<string, LibraryEntry>();
  /** id → a record written before the per-channel lists (see {@link LibraryEntry.channel}). */
  readonly #legacy = new Map<string, LibraryEntry>();
  #hydrated = false;

  constructor(ws: Workspace) {
    this.#ws = ws;
  }

  /**
   * Load the persisted library into memory. Idempotent. A corrupt/partial file is
   * skipped, never fatal (the storage doctrine: reads never throw) — the library
   * degrades to the entries it could read rather than blanking.
   */
  async hydrate(): Promise<void> {
    if (this.#hydrated) return;
    this.#hydrated = true;
    const entries = await this.#ws.list(DIR);
    for (const e of entries) {
      if (e.kind !== 'file' || !e.name.endsWith('.json')) continue;
      try {
        const rec = await this.#ws.readJson<LibraryEntry>(e.path);
        if (
          rec === null ||
          rec.template?.templateId === undefined ||
          typeof rec.html !== 'string'
        ) {
          continue;
        }
        if (typeof rec.channel === 'number') {
          this.#own.set(keyOf(rec.channel, rec.template.templateId), rec);
        } else {
          this.#legacy.set(rec.template.templateId, { template: rec.template, html: rec.html });
        }
      } catch {
        // skip a corrupt/partial record
      }
    }
  }

  /**
   * The templates `channel`'s list holds as far as this browser knows — its own records for that
   * channel, then any pre-channel record it has none of its own for. With no channel, every
   * template once (a channel's record first, the lowest channel's).
   */
  list(channel?: number): TemplateInfo[] {
    return this.#view(channel).map((e) => e.template);
  }

  get(templateId: string, channel?: number): TemplateInfo | null {
    return this.#resolve(templateId, channel)?.template ?? null;
  }

  has(templateId: string, channel?: number): boolean {
    return this.#resolve(templateId, channel) !== null;
  }

  /**
   * R-022 — the retained self-contained page for a template, or null when this
   * browser holds none.
   *
   * The rehearsal render is the ONLY consumer, and it wants exactly this rather
   * than a re-derived scene: it is the byte-identical page the bridge serves to
   * CasparCG, so rehearsing it cannot drift from air the way a second render path
   * would. `null` is the honest "not in this browser" — a template imported
   * elsewhere has metadata (from the bridge's catalogue) but no local page, and the
   * panel says so rather than showing an empty black box.
   *
   * `CHANNEL-TEMPLATES-01` — the page of the version this browser imported on `channel`.
   */
  html(templateId: string, channel?: number): string | null {
    return this.#resolve(templateId, channel)?.html ?? null;
  }

  /** The full retention/delivery set (metadata + HTML, each with its channel) for reconcile-on-connect. */
  entries(): LibraryEntry[] {
    return [...this.#own.values(), ...this.#legacy.values()];
  }

  /**
   * Register (or replace) a template on `channel`. A LOCAL operation — persist + index, no
   * bridge round-trip — so it succeeds with the bridge process unreachable. With no channel, a
   * record that answers for every channel (a caller that names none).
   */
  async import(
    template: TemplateInfo,
    html: string,
    channel?: number,
  ): Promise<{ registered: boolean; templateId: string }> {
    if (channel === undefined) {
      const entry: LibraryEntry = { template, html };
      this.#legacy.set(template.templateId, entry);
      await this.#ws.writeJson(pathFor(template.templateId, undefined), entry);
    } else {
      const entry: LibraryEntry = { template, html, channel };
      this.#own.set(keyOf(channel, template.templateId), entry);
      await this.#ws.writeJson(pathFor(template.templateId, channel), entry);
    }
    return { registered: true, templateId: template.templateId };
  }

  /**
   * Unconditional local delete — used when the authority for the removal lives
   * elsewhere and has already allowed it (the live path, where the bridge is
   * authoritative for refuse-while-referenced).
   *
   * `CHANNEL-TEMPLATES-01` — from `channel` (no channel: from every channel). A pre-channel
   * record for the template goes too, whichever channel the removal names: it answers for every
   * channel, so keeping it would put the template back on this channel's list offline and
   * re-deliver it after a bridge restart.
   */
  async delete(templateId: string, channel?: number): Promise<void> {
    const own = [...this.#own.values()].filter(
      (e) =>
        e.template.templateId === templateId && (channel === undefined || e.channel === channel),
    );
    for (const e of own) {
      if (e.channel === undefined) continue;
      this.#own.delete(keyOf(e.channel, templateId));
      await this.#ws.delete(pathFor(templateId, e.channel));
    }
    if (this.#legacy.delete(templateId)) await this.#ws.delete(pathFor(templateId, undefined));
  }

  /**
   * Guarded removal (the offline path). Enforces R-005 refuse-while-referenced
   * against the caller-supplied REFERENCES (the WebSocketRuntime reads the last-known
   * stack, which is exact while disconnected because the bridge is the sole mutator
   * of the stack and cannot change it while unreachable).
   *
   * `B-212` — it used to take a COUNT, and the sentence it produced could only say
   * how many. The places come in, and the wording is the ONE shared spelling; `bank`
   * is whatever the caller knows (offline, usually nothing — the layers are then
   * named as CasparCG names them, which is still a place the operator can find).
   *
   * `CHANNEL-TEMPLATES-01` — the caller passes the references on `channel` only: a row on
   * another channel takes its template from that channel's list.
   */
  async remove(
    templateId: string,
    references: readonly TemplateReference[],
    bank: FixedLayerBank | null = null,
    channel?: number,
  ): Promise<RemoveResult> {
    if (!this.has(templateId, channel)) {
      return {
        ok: false,
        reason: 'unknown-template',
        message:
          channel === undefined
            ? `Template “${templateId}” is not registered.`
            : `Template “${templateId}” is not on CH ${String(channel)}.`,
      };
    }
    if (references.length > 0) {
      return {
        ok: false,
        reason: 'in-use',
        message: describeTemplateReferences(references, bank),
        references: [...references],
      };
    }
    await this.delete(templateId, channel);
    return { ok: true };
  }

  /** One template on `channel` (or station-wide), as {@link list} would answer it. */
  #resolve(templateId: string, channel: number | undefined): LibraryEntry | null {
    if (channel !== undefined) {
      return this.#own.get(keyOf(channel, templateId)) ?? this.#legacy.get(templateId) ?? null;
    }
    return this.#view(undefined).find((e) => e.template.templateId === templateId) ?? null;
  }

  #view(channel: number | undefined): LibraryEntry[] {
    if (channel !== undefined) {
      const own = [...this.#own.values()].filter((e) => e.channel === channel);
      const mine = new Set(own.map((e) => e.template.templateId));
      return [
        ...[...this.#legacy.values()].filter((e) => !mine.has(e.template.templateId)),
        ...own,
      ];
    }
    const seen = new Set<string>();
    const out: LibraryEntry[] = [];
    const byChannel = [...this.#own.values()].sort((a, b) => (a.channel ?? 0) - (b.channel ?? 0));
    for (const e of [...byChannel, ...this.#legacy.values()]) {
      if (seen.has(e.template.templateId)) continue;
      seen.add(e.template.templateId);
      out.push(e);
    }
    return out;
  }
}
