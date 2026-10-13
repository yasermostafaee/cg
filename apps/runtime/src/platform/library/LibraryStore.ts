import type { TemplateInfo } from '@cg/shared-ipc';
import type { Workspace } from '@cg/storage';

/**
 * One registered template, as this console last saw CG Bridge accept it: the operator-facing
 * metadata plus the produced self-contained standalone HTML (runtime + scene + assets inlined).
 * 🔴 `CENTRAL-BRIDGE-01` (`B-294`): a DISPLAY copy — the offline Library and the offline PVW page
 * read it; it is never sent to the bridge, which keeps the library for every console.
 */
export interface LibraryEntry {
  template: TemplateInfo;
  html: string;
  /**
   * 🔴 `CHANNEL-TEMPLATES-01` — the channel this browser imported it ON. Each channel has its own
   * list, so a record is that channel's.
   *
   * ABSENT on a record written before the per-channel lists: the station-wide library it was
   * part of is every channel's list now, so such a record answers for any channel that holds no
   * record of its own for the template.
   */
  channel?: number;
  /**
   * `CHANNEL-TEMPLATES-01` — a pre-channel record only: the channels the template was REMOVED from
   * in this browser. It no longer answers for them. It still answers for every other channel: a
   * removal on CH 2 leaves CH 1's offline list and CH 1's PVW page exactly as they were.
   */
  removedOn?: number[];
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

/** A pre-channel record that `channel` has removed (see {@link LibraryEntry.removedOn}). */
function hiddenOn(entry: LibraryEntry, channel: number): boolean {
  return (entry.removedOn ?? []).includes(channel);
}

/**
 * Browser-local, file-based DISPLAY copy of the Runtime template library (B-085). Backed by a
 * `@cg/storage` `Workspace` (OPFS in the browser, in-memory in tests), so the Library stays visible
 * with CG Bridge fully down and across a page reload.
 *
 * 🔴 `CENTRAL-BRIDGE-01` (`B-294`): it used to be the library's "source of truth", re-delivered to
 * the bridge on every connect. With one bridge serving several consoles each console's copy was a
 * claim on the truth, and a stale one could win; the library is CG Bridge's now. This store is
 * written only after the bridge accepted an import or a removal, and nothing sends it.
 *
 * This class is pure persistence + an in-memory index: it knows nothing about the SPA↔bridge link
 * (the `WebSocketRuntime` does), which keeps it unit-testable off any socket.
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
          const removedOn = Array.isArray(rec.removedOn)
            ? rec.removedOn.filter((c): c is number => typeof c === 'number')
            : [];
          this.#legacy.set(rec.template.templateId, {
            template: rec.template,
            html: rec.html,
            ...(removedOn.length > 0 && { removedOn }),
          });
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

  /**
   * Record (or replace) a template on `channel` — persist + index. The `WebSocketRuntime` calls it
   * only after CG Bridge accepted the import (`CENTRAL-BRIDGE-01`). With no channel, a record that
   * answers for every channel (a caller that names none).
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
   * Unconditional local delete — the authority for the removal is the bridge, which has already
   * allowed it (it is authoritative for refuse-while-referenced; an offline removal is refused
   * before it reaches here — `CENTRAL-BRIDGE-01`).
   *
   * `CHANNEL-TEMPLATES-01` — from `channel` (no channel: from every channel). A pre-channel
   * record for the template answers for every channel, so a removal naming one channel does not
   * delete it — that would take the template off every OTHER channel's offline list and PVW page
   * too. It is kept, hidden on `channel` ({@link LibraryEntry.removedOn}); a removal naming no
   * channel deletes it.
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
    const legacy = this.#legacy.get(templateId);
    if (legacy === undefined) return;
    if (channel === undefined) {
      this.#legacy.delete(templateId);
      await this.#ws.delete(pathFor(templateId, undefined));
      return;
    }
    if (hiddenOn(legacy, channel)) return;
    const kept: LibraryEntry = {
      template: legacy.template,
      html: legacy.html,
      removedOn: [...(legacy.removedOn ?? []), channel].sort((a, b) => a - b),
    };
    this.#legacy.set(templateId, kept);
    await this.#ws.writeJson(pathFor(templateId, undefined), kept);
  }

  /** One template on `channel` (or station-wide), as {@link list} would answer it. */
  #resolve(templateId: string, channel: number | undefined): LibraryEntry | null {
    if (channel !== undefined) {
      const own = this.#own.get(keyOf(channel, templateId));
      if (own !== undefined) return own;
      const legacy = this.#legacy.get(templateId);
      return legacy !== undefined && !hiddenOn(legacy, channel) ? legacy : null;
    }
    return this.#view(undefined).find((e) => e.template.templateId === templateId) ?? null;
  }

  #view(channel: number | undefined): LibraryEntry[] {
    if (channel !== undefined) {
      const own = [...this.#own.values()].filter((e) => e.channel === channel);
      const mine = new Set(own.map((e) => e.template.templateId));
      return [
        ...[...this.#legacy.values()].filter(
          (e) => !mine.has(e.template.templateId) && !hiddenOn(e, channel),
        ),
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
