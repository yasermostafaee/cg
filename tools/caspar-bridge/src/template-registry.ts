import type { TemplateInfo } from '@cg/shared-ipc';

/** One registered template: its registry metadata + the rendered self-contained HTML. */
interface RegisteredTemplate {
  readonly info: TemplateInfo;
  /** The browser-produced self-contained HTML (B-038 Phase 2). */
  readonly html: string;
}

/**
 * In-memory store of imported templates for the bridge (B-038 Phase 2).
 *
 * Holds each template's `TemplateInfo` AND the browser-produced self-contained
 * HTML keyed by `templateId`. The HTML is **retained, not served** in this phase:
 * `html(id)` is the seam Phase 3 serves from (`GET /template/<id>`) and Phase 4
 * resolves the `CG ADD` URL against. Re-importing an id **replaces** its entry
 * (info + html). No persistence — the store is empty on bridge restart (the
 * browser re-delivers on reconnect; that re-delivery is a later phase).
 */
export class TemplateRegistry {
  readonly #byId = new Map<string, RegisteredTemplate>();

  /** Register (or replace) a template by id with its info + rendered HTML. */
  import(info: TemplateInfo, html: string): { registered: boolean; templateId: string } {
    this.#byId.set(info.templateId, { info, html });
    return { registered: true, templateId: info.templateId };
  }

  /** The template's info, or `null` if not registered. */
  get(templateId: string): TemplateInfo | null {
    return this.#byId.get(templateId)?.info ?? null;
  }

  /** Every registered template's info. */
  list(): TemplateInfo[] {
    return [...this.#byId.values()].map((e) => e.info);
  }

  /**
   * The retained self-contained HTML for a template, or `null` if not registered.
   * Phase 3 serves this at `GET /template/<id>`; Phase 4 resolves the `CG ADD`
   * URL to it.
   */
  html(templateId: string): string | null {
    return this.#byId.get(templateId)?.html ?? null;
  }

  /** Whether a template id is registered. */
  has(templateId: string): boolean {
    return this.#byId.has(templateId);
  }
}
