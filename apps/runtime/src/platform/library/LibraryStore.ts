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
 * Percent-encode the id for the on-disk filename. `IdSchema` is
 * `z.string().min(1)` and permits any non-empty string, so a raw id is not
 * guaranteed filename-safe; the real templateId is carried INSIDE the record, so
 * hydrate never needs to decode the name back.
 */
function pathFor(templateId: string): string {
  return `${DIR}/${encodeURIComponent(templateId)}.json`;
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
 */
export class LibraryStore {
  readonly #ws: Workspace;
  readonly #index = new Map<string, LibraryEntry>();
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
          rec !== null &&
          rec.template?.templateId !== undefined &&
          typeof rec.html === 'string'
        ) {
          this.#index.set(rec.template.templateId, rec);
        }
      } catch {
        // skip a corrupt/partial record
      }
    }
  }

  /** The registry metadata the Library / Inspector / stack-name-join read. */
  list(): TemplateInfo[] {
    return [...this.#index.values()].map((e) => e.template);
  }

  get(templateId: string): TemplateInfo | null {
    return this.#index.get(templateId)?.template ?? null;
  }

  has(templateId: string): boolean {
    return this.#index.has(templateId);
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
   */
  html(templateId: string): string | null {
    return this.#index.get(templateId)?.html ?? null;
  }

  /** The full retention/delivery set (metadata + HTML) for reconcile-on-connect. */
  entries(): LibraryEntry[] {
    return [...this.#index.values()];
  }

  /**
   * Register (or replace) a template. A LOCAL operation — persist + index, no
   * bridge round-trip — so it succeeds with the bridge process unreachable.
   */
  async import(
    template: TemplateInfo,
    html: string,
  ): Promise<{ registered: boolean; templateId: string }> {
    const entry: LibraryEntry = { template, html };
    this.#index.set(template.templateId, entry);
    await this.#ws.writeJson(pathFor(template.templateId), entry);
    return { registered: true, templateId: template.templateId };
  }

  /**
   * Unconditional local delete — used when the authority for the removal lives
   * elsewhere and has already allowed it (the live path, where the bridge is
   * authoritative for refuse-while-referenced).
   */
  async delete(templateId: string): Promise<void> {
    this.#index.delete(templateId);
    await this.#ws.delete(pathFor(templateId));
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
   */
  async remove(
    templateId: string,
    references: readonly TemplateReference[],
    bank: FixedLayerBank | null = null,
  ): Promise<RemoveResult> {
    if (!this.#index.has(templateId)) {
      return {
        ok: false,
        reason: 'unknown-template',
        message: `Template “${templateId}” is not registered.`,
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
    await this.delete(templateId);
    return { ok: true };
  }
}
