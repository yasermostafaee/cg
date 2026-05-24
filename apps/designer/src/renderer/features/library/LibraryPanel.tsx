import { useEffect, useState } from 'react';
import type { TemplateType } from '@cg/shared-schema';
import type { StarterEntry } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';

const TEMPLATE_TYPES: TemplateType[] = [
  'lower-third',
  'ticker',
  'logo-bug',
  'breaking-news',
  'fullscreen',
  'custom',
];

const styles = {
  panel: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
    minHeight: 0,
    overflowY: 'auto' as const,
  },
  heading: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    margin: 0,
  },
  button: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    padding: '0.4rem 0.6rem',
    borderRadius: '0.25rem',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: '0.85rem',
  },
  buttonPrimary: {
    background: colors.accent,
    color: '#000',
    border: 'none',
    fontWeight: 700,
  },
  list: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  sub: { fontSize: '0.75rem', color: colors.textMuted, margin: 0 },
  select: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    padding: '0.3rem 0.4rem',
    borderRadius: '0.25rem',
    fontSize: '0.85rem',
  },
} as const;

/** Sidebar — starter templates + recent projects + a quick "New project" form. */
export function LibraryPanel(): JSX.Element {
  const [recent, setRecent] = useState<{ path: string; name: string }[]>([]);
  const [starters, setStarters] = useState<readonly StarterEntry[]>([]);
  const [type, setType] = useState<TemplateType>('lower-third');
  const [name, setName] = useState<string>('Untitled');

  useEffect(() => {
    void refresh();
    void window.cg.projects.starters().then(setStarters);
    const unsubscribe = window.cg.projects.onActiveChanged(() => {
      void refresh();
    });
    return unsubscribe;
  }, []);

  async function refresh(): Promise<void> {
    const list = await window.cg.projects.recent();
    setRecent(list.map((r) => ({ path: r.path, name: r.name })));
  }

  async function createNew(): Promise<void> {
    const result = await window.cg.projects.create({ name, templateType: type });
    designerStore.setScene(result.scene, result.path);
  }

  async function openRecent(path: string): Promise<void> {
    const result = await window.cg.projects.open({ path });
    if (result.scene !== null) designerStore.setScene(result.scene, result.path);
  }

  async function loadStarter(starterId: string): Promise<void> {
    const result = await window.cg.projects.starter({ starterId });
    designerStore.setScene(result.scene, result.path);
  }

  return (
    <aside style={styles.panel} aria-label="Library">
      {starters.length > 0 && (
        <>
          <h2 style={styles.heading}>STARTERS</h2>
          <div style={styles.list}>
            {starters.map((s) => (
              <button
                key={s.id}
                style={styles.button}
                title={s.description}
                onClick={() => void loadStarter(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}

      <h2 style={{ ...styles.heading, marginTop: starters.length > 0 ? '0.5rem' : 0 }}>
        NEW PROJECT
      </h2>
      <input
        style={styles.select}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
      />
      <select
        style={styles.select}
        value={type}
        onChange={(e) => setType(e.target.value as TemplateType)}
      >
        {TEMPLATE_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <button
        style={{ ...styles.button, ...styles.buttonPrimary }}
        onClick={() => void createNew()}
      >
        Create
      </button>

      <h2 style={{ ...styles.heading, marginTop: '0.5rem' }}>RECENT</h2>
      {recent.length === 0 ? (
        <p style={styles.sub}>No projects yet.</p>
      ) : (
        <div style={styles.list}>
          {recent.slice(0, 10).map((r) => (
            <button key={r.path} style={styles.button} onClick={() => void openRecent(r.path)}>
              {r.name}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
