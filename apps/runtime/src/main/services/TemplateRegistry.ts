/**
 * Minimal in-memory templateId → URL resolver. The real registry (with
 * watched-folder ingest, manifest validation, signature verification)
 * lands in M5.4; for now this is just enough to let StackService build
 * a PLAY [HTML] command.
 *
 * Templates are registered at boot by reading the configured watch
 * folder; the M5.3 end-to-end test pre-populates with hand-built entries.
 */
export interface TemplateEntry {
  templateId: string;
  /** File URL of the index.html the HTML producer should load. */
  url: string;
  /** Template type for LayerManager policy (lower-third / ticker / etc.). */
  templateType: string;
}

export class TemplateRegistry {
  private readonly entries = new Map<string, TemplateEntry>();

  register(entry: TemplateEntry): void {
    this.entries.set(entry.templateId, entry);
  }

  unregister(templateId: string): boolean {
    return this.entries.delete(templateId);
  }

  /** Returns the entry or null if unknown. */
  get(templateId: string): TemplateEntry | null {
    return this.entries.get(templateId) ?? null;
  }

  /** Resolve to the on-the-wire URL, or null if unknown. */
  resolveUrl(templateId: string): string | null {
    return this.entries.get(templateId)?.url ?? null;
  }

  list(): readonly TemplateEntry[] {
    return [...this.entries.values()];
  }

  clear(): void {
    this.entries.clear();
  }
}
