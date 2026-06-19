import { useEffect, useState } from 'react';
import type { RecentProject, StarterEntry } from '@cg/shared-ipc';
import { designerStore, shallowEqual, useDesignerSelector } from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import { NewProjectModal } from './NewProjectModal.js';
import { SaveBeforeSwitchModal } from './SaveBeforeSwitchModal.js';
import * as s from './LandingView.css.js';

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
  const { scene, projectPath } = useDesignerSelector(
    (s) => ({ scene: s.scene, projectPath: s.projectPath }),
    shallowEqual,
  );
  const [recent, setRecent] = useState<readonly RecentProject[]>([]);
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

  async function openRecent(entry: RecentProject): Promise<void> {
    // D-088 — handle entry re-acquires permission in this click; legacy path entry opens
    // via OPFS; a denied/stale/missing handle falls back to the picker with a notice.
    const res = await window.cg.projects.openRecent({
      ...(entry.projectId !== undefined ? { projectId: entry.projectId } : {}),
      ...(entry.handleKey !== undefined ? { handleKey: entry.handleKey } : {}),
      ...(entry.path !== undefined ? { path: entry.path } : {}),
    });
    if (res.scene !== null) {
      designerStore.setScene(res.scene, null);
      return;
    }
    if (res.needsPicker) {
      designerStore.showNotice('That file is unavailable — choose it again.');
      const opened = await window.cg.projects.openDisk();
      if (opened.scene !== null) designerStore.setScene(opened.scene, null);
    }
  }

  return (
    <div className={s.page} aria-label="Designer landing">
      <div>
        <div className={s.brand}>
          <h1 className={s.brandTitle}>cg Designer</h1>
        </div>
        <p className={s.brandSub}>
          Broadcast template builder — pick a demo, open a recent project, or start fresh.
        </p>
      </div>

      <Button
        variant="bare"
        className={s.newButton}
        onClick={() => guardedSwitch('a new project', () => Promise.resolve(setModalOpen(true)))}
        aria-label="New project"
      >
        + New project
      </Button>

      <h2 className={s.sectionTitle}>START FROM A TEMPLATE</h2>
      {starters.length === 0 ? (
        <p className={s.empty}>No starters available.</p>
      ) : (
        <div className={s.grid}>
          {starters.map((st) => (
            <Button
              key={st.id}
              variant="bare"
              className={s.card}
              onClick={() => guardedSwitch(st.label, () => loadStarter(st.id))}
            >
              {st.isNew === true && <span className={s.newBadge}>New</span>}
              {st.previewUrl !== undefined ? (
                <img src={st.previewUrl} alt={`${st.label} preview`} className={s.cardThumb} />
              ) : (
                <span className={s.cardThumbFallback}>PREVIEW</span>
              )}
              <span className={s.cardBody}>
                <span className={s.cardLabel}>{st.label}</span>
                <span className={s.cardDesc}>{st.description}</span>
              </span>
            </Button>
          ))}
        </div>
      )}

      <h2 className={s.sectionTitle}>RECENT PROJECTS</h2>
      {recent.length === 0 ? (
        <p className={s.empty}>No recent projects yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {recent.slice(0, 12).map((r) => (
            <Button
              key={r.projectId ?? r.path ?? r.name}
              variant="bare"
              className={s.recentRow}
              onClick={() => guardedSwitch(r.name, () => openRecent(r))}
            >
              <span>
                <strong>{r.name}</strong>
                {r.templateType !== undefined && (
                  <span className={s.recentMeta}> · {r.templateType}</span>
                )}
              </span>
              <span className={s.recentMeta}>
                {formatWhen(r.lastSavedAt ?? r.lastOpenedAt ?? '')}
              </span>
            </Button>
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
