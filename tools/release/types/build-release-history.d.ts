interface ReleaseHistoryEntry {
  version: string;
  title: string;
  date: string;
  status: 'development' | 'prepared' | 'published';
  summary: string;
  changes: string[];
  planned: string[];
  downloadBaseUrl: string | null;
}

interface ReleaseHistory {
  product: string;
  releases: ReleaseHistoryEntry[];
}

declare module '*build-release-history.mjs' {
  export function releaseAssetNames(version: string): {
    guide: string;
    bridge: string;
    control: string;
    designer: string;
    sums: string;
  };
  export function parseReleaseHistory(source: string): ReleaseHistory;
  export function releaseHistoryHtml(
    data: ReleaseHistory,
    options?: { currentVersion?: string },
  ): string;
  export function buildReleaseHistory(options: {
    sourceFile: string;
    outFile: string;
    currentVersion?: string;
  }): string;
}
