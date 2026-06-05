import { useEffect, useState } from 'react';
import type { StarterEntry } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { designerStore, useDesignerStore } from '../../state/store.js';
import { NewProjectModal } from './NewProjectModal.js';
import { SaveBeforeSwitchModal } from './SaveBeforeSwitchModal.js';

const styles = {
  page: {
    width: '100%',
    height: '100%',
    minHeight: 0,
    overflow: 'auto' as const,
    background: colors.background,
    color: colors.text,
    boxSizing: 'border-box' as const,
    padding: '2.5rem 3rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1.5rem',
    fontSize: '0.85rem',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    marginBottom: '0.5rem',
  },
  brandTitle: {
    fontSize: '1.6rem',
    fontWeight: 700,
    margin: 0,
    letterSpacing: '0.02em',
  },
  brandSub: {
    fontSize: '0.82rem',
    color: colors.textMuted,
    margin: 0,
  },
  newButton: {
    background: colors.accent,
    color: '#000',
    border: 'none',
    padding: '0.6rem 1.1rem',
    borderRadius: '0.3rem',
    fontWeight: 700,
    fontSize: '0.85rem',
    cursor: 'pointer',
    alignSelf: 'flex-start' as const,
  },
  resumeBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.8rem',
    padding: '0.55rem 0.9rem',
    background: colors.panel,
    border: `1px solid ${colors.accentMuted}`,
    borderRadius: '0.3rem',
    fontSize: '0.82rem',
    color: colors.text,
  },
  resumeMeta: {
    color: colors.textMuted,
    fontSize: '0.74rem',
    marginLeft: '0.4rem',
  },
  resumeButton: {
    background: colors.accent,
    color: '#000',
    border: 'none',
    padding: '0.32rem 0.8rem',
    borderRadius: '0.25rem',
    fontWeight: 700,
    fontSize: '0.78rem',
    cursor: 'pointer',
  },
  sectionTitle: {
    fontSize: '0.7rem',
    color: colors.textMuted,
    letterSpacing: '0.08em',
    fontWeight: 700,
    margin: '0.8rem 0 0.4rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '0.9rem',
  },
  card: {
    position: 'relative' as const,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.5rem',
    padding: 0,
    cursor: 'pointer',
    textAlign: 'left' as const,
    color: colors.text,
    display: 'flex',
    flexDirection: 'column' as const,
    fontSize: '0.85rem',
    overflow: 'hidden' as const,
  },
  newBadge: {
    position: 'absolute' as const,
    top: '0.55rem',
    right: '0.55rem',
    zIndex: 2,
    padding: '0.12rem 0.5rem',
    borderRadius: '999px',
    background: 'linear-gradient(105deg, #38BDF8, #8B5CF6)',
    color: '#06121F',
    fontSize: '0.62rem',
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    boxShadow: '0 2px 10px rgba(56,189,248,0.45)',
    pointerEvents: 'none' as const,
  },
  cardThumb: {
    width: '100%',
    aspectRatio: '16 / 9',
    objectFit: 'cover' as const,
    display: 'block',
    background: '#0b0e16',
    borderBottom: `1px solid ${colors.border}`,
  },
  cardThumbFallback: {
    width: '100%',
    aspectRatio: '16 / 9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1b2740, #0b1120)',
    color: colors.textMuted,
    fontSize: '0.72rem',
    letterSpacing: '0.1em',
    borderBottom: `1px solid ${colors.border}`,
  },
  cardBody: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.25rem',
    padding: '0.7rem 0.85rem 0.85rem',
  },
  cardLabel: { fontWeight: 700 },
  cardDesc: { color: colors.textMuted, fontSize: '0.76rem', lineHeight: 1.35 },
  recentRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.3rem',
    padding: '0.6rem 0.9rem',
    cursor: 'pointer',
    color: colors.text,
    fontSize: '0.85rem',
  },
  recentMeta: {
    color: colors.textMuted,
    fontSize: '0.74rem',
  },
  empty: {
    color: colors.textMuted,
    fontSize: '0.82rem',
    padding: '0.5rem 0',
  },
} as const;

/**
 * Full-viewport landing screen — the Designer's entry point per D-007.
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ cg Designer                                              │
 *   │ HTML CG template builder                                 │
 *   │ [ + New project ]                                        │
 *   │                                                          │
 *   │ START FROM A TEMPLATE                                    │
 *   │ ┌────────────┐ ┌────────────┐ ┌────────────┐            │
 *   │ │ lower-third│ │ ticker     │ │ logo-bug   │            │
 *   │ └────────────┘ └────────────┘ └────────────┘            │
 *   │                                                          │
 *   │ RECENT PROJECTS                                          │
 *   │ ┌──────────────────────────────────────────────────────┐ │
 *   │ │ My demo                                Today 14:32   │ │
 *   │ └──────────────────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────────────────┘
 */
export function LandingView(): JSX.Element {
  const { scene, projectPath } = useDesignerStore();
  const [recent, setRecent] = useState<
    { path: string; name: string; templateType: string; lastOpenedAt: string }[]
  >([]);
  const [starters, setStarters] = useState<readonly StarterEntry[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  // When a project is already loaded and the operator picks a
  // different one, hold the would-be switch in `pendingSwitch` until
  // the save-or-discard modal resolves.
  const [pendingSwitch, setPendingSwitch] = useState<{
    label: string;
    action: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    void window.cg.projects.recent().then(setRecent);
    void window.cg.projects.starters().then(setStarters);
  }, []);

  /**
   * Guarded action — runs `action` immediately if no project is open,
   * otherwise queues it behind the save-before-switch modal.
   */
  function guardedSwitch(label: string, action: () => Promise<void>): void {
    // Only prompt to save when the project actually has unsaved changes.
    if (scene === null || !designerStore.get().dirty) {
      void action();
      return;
    }
    setPendingSwitch({ label, action });
  }

  async function loadStarter(starterId: string): Promise<void> {
    const result = await window.cg.projects.starter({ starterId });
    designerStore.setScene(result.scene, result.path);
  }

  async function openRecent(path: string): Promise<void> {
    const result = await window.cg.projects.open({ path });
    if (result.scene !== null) designerStore.setScene(result.scene, result.path);
  }

  return (
    <div style={styles.page} aria-label="Designer landing">
      <div>
        <div style={styles.brand}>
          <h1 style={styles.brandTitle}>cg Designer</h1>
        </div>
        <p style={styles.brandSub}>
          Broadcast template builder — pick a demo, open a recent project, or start fresh.
        </p>
      </div>

      {scene !== null && (
        <div style={styles.resumeBanner} aria-label="Resume current project">
          <span>
            Currently editing <strong>{scene.name}</strong>
            <span style={styles.resumeMeta}>· {projectPath ?? '(unsaved)'}</span>
          </span>
          <button
            type="button"
            style={styles.resumeButton}
            onClick={() => designerStore.setView('studio')}
            aria-label={`Resume editing ${scene.name}`}
          >
            Resume →
          </button>
        </div>
      )}

      <button
        type="button"
        style={styles.newButton}
        onClick={() => guardedSwitch('a new project', () => Promise.resolve(setModalOpen(true)))}
        aria-label="New project"
      >
        + New project
      </button>

      <h2 style={styles.sectionTitle}>START FROM A TEMPLATE</h2>
      {starters.length === 0 ? (
        <p style={styles.empty}>No starters available.</p>
      ) : (
        <div style={styles.grid}>
          {starters.map((s) => (
            <button
              key={s.id}
              type="button"
              style={styles.card}
              onClick={() => guardedSwitch(s.label, () => loadStarter(s.id))}
            >
              {s.isNew === true && <span style={styles.newBadge}>New</span>}
              {s.previewUrl !== undefined ? (
                <img src={s.previewUrl} alt={`${s.label} preview`} style={styles.cardThumb} />
              ) : (
                <span style={styles.cardThumbFallback}>PREVIEW</span>
              )}
              <span style={styles.cardBody}>
                <span style={styles.cardLabel}>{s.label}</span>
                <span style={styles.cardDesc}>{s.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <h2 style={styles.sectionTitle}>RECENT PROJECTS</h2>
      {recent.length === 0 ? (
        <p style={styles.empty}>No recent projects yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {recent.slice(0, 12).map((r) => (
            <button
              key={r.path}
              type="button"
              style={styles.recentRow}
              onClick={() => guardedSwitch(r.name, () => openRecent(r.path))}
            >
              <span>
                <strong>{r.name}</strong> <span style={styles.recentMeta}>· {r.templateType}</span>
              </span>
              <span style={styles.recentMeta}>{formatWhen(r.lastOpenedAt)}</span>
            </button>
          ))}
        </div>
      )}

      {modalOpen && <NewProjectModal onClose={() => setModalOpen(false)} />}
      {pendingSwitch !== null && scene !== null && (
        <SaveBeforeSwitchModal
          scene={scene}
          projectPath={projectPath}
          onCancel={() => setPendingSwitch(null)}
          onProceed={async () => {
            const action = pendingSwitch.action;
            setPendingSwitch(null);
            await action();
          }}
        />
      )}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `Today ${hh}:${mm}`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hh}:${mm}`;
}
