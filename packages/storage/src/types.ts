/**
 * A Workspace is a flat, path-addressed store of files. It is the single
 * persistence seam the apps depend on; concrete backends (File System
 * Access, OPFS, in-memory) implement it so the rest of the codebase never
 * touches a browser storage API directly.
 *
 * Paths are POSIX-style relative paths ('projects/foo.cg.json',
 * 'assets/image/<sha>.png'). Intermediate directories are created on write.
 */
export interface Workspace {
  /** Human-meaningful label for the backing store (folder name, 'opfs', 'memory'). */
  readonly label: string;

  /** Read raw bytes. Resolves to `null` when the file does not exist. */
  readFile(path: string): Promise<Uint8Array | null>;
  /** Write raw bytes, creating intermediate directories as needed. */
  writeFile(path: string, data: Uint8Array): Promise<void>;

  /** Read UTF-8 text. `null` when absent. */
  readText(path: string): Promise<string | null>;
  /** Write UTF-8 text. */
  writeText(path: string, text: string): Promise<void>;

  /** Parse a JSON file. `null` when absent. Throws on malformed JSON. */
  readJson<T>(path: string): Promise<T | null>;
  /** Serialize a value as pretty JSON. */
  writeJson(path: string, value: unknown): Promise<void>;

  /** Remove a file. No-op when it does not exist. */
  delete(path: string): Promise<void>;
  /** True iff a file exists at the path. */
  exists(path: string): Promise<boolean>;

  /** List immediate children of a directory ('' = root). */
  list(dir?: string): Promise<WorkspaceEntry[]>;
}

export interface WorkspaceEntry {
  /** Leaf name. */
  name: string;
  /** Full path from the workspace root. */
  path: string;
  kind: 'file' | 'directory';
}

/**
 * Tiny synchronous key/value store for small preferences (recent files,
 * UI flags). Backed by localStorage in the browser, memory in tests.
 */
export interface KeyValueStore {
  get<T>(key: string): T | null;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}
