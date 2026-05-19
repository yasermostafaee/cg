import { useEffect, useState } from 'react';

interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

declare global {
  interface Window {
    cg: {
      getAppInfo: () => Promise<AppInfo>;
    };
  }
}

const styles = {
  page: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    color: '#E5E7EB',
    background: '#0F172A',
    minHeight: '100vh',
    margin: 0,
    padding: '2rem',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    gap: '0.75rem',
  },
  heading: { fontSize: '1.5rem', margin: 0, fontWeight: 600 },
  sub: { margin: 0, opacity: 0.7 },
  info: {
    fontSize: '0.85rem',
    opacity: 0.75,
    margin: 0,
    background: 'rgba(255,255,255,0.04)',
    padding: '0.5rem 0.75rem',
    borderRadius: '0.25rem',
    fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
  },
} as const;

export function App(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.cg
      .getAppInfo()
      .then(setInfo)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <main style={styles.page}>
      <h1 style={styles.heading}>cg Designer</h1>
      <p style={styles.sub}>M0 placeholder. The real editor lands at M6.</p>
      {info && <pre style={styles.info}>{JSON.stringify(info, null, 2)}</pre>}
      {error && (
        <pre style={{ ...styles.info, color: '#F87171' }}>contextBridge error: {error}</pre>
      )}
    </main>
  );
}
