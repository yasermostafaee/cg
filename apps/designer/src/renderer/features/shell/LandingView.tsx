import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { RecentProject, StarterEntry } from '@cg/shared-ipc';
import {
  designerStore,
  hasUnsavedChanges,
  shallowEqual,
  useDesignerSelector,
} from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Tag } from '../../ui/Tag.js';
import { APP_BUILD, APP_VERSION } from '../../appVersion.js';
import { NewProjectModal } from './NewProjectModal.js';
import { SaveBeforeSwitchModal } from './SaveBeforeSwitchModal.js';
import { VersionHistoryModal } from './VersionHistoryModal.js';
import { COMPANY_SITE, followCompanySite } from './companySite.js';
import { openProjectFromDisk } from './open-project.js';
import { playoutBadge } from './playout-badge.js';
import * as s from './LandingView.css.js';

const HOVER_PREVIEWS_KEY = 'cg-designer:hover-previews';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function readHoverPreviewPreference(): boolean | null {
  try {
    const value = window.localStorage.getItem(HOVER_PREVIEWS_KEY);
    if (value === 'on') return true;
    if (value === 'off') return false;
  } catch {
    // The gallery still works when storage is blocked.
  }
  return null;
}

function systemReducesMotion(): boolean {
  return window.matchMedia?.(REDUCED_MOTION).matches === true;
}

function subscribeToReducedMotion(onChange: () => void): () => void {
  const media = window.matchMedia?.(REDUCED_MOTION);
  media?.addEventListener('change', onChange);
  return () => media?.removeEventListener('change', onChange);
}

/**
 * Full-viewport landing screen — the Designer's entry point per D-007.
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ cg Designer                                              │
 *   │ HTML CG template builder                                 │
 *   │ [ + New project ] [ Import project ]                     │
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hoverPreference, setHoverPreference] = useState(readHoverPreviewPreference);
  const reducedMotion = useSyncExternalStore(subscribeToReducedMotion, systemReducesMotion);
  const hoverPreviews = hoverPreference ?? !reducedMotion;
  const hasMotion = starters.some(
    (starter) => starter.previewUrl !== undefined && starter.motionPreviewUrl !== undefined,
  );
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
    // Only prompt to save when the project actually has unsaved changes — `D-162`'s ONE
    // predicate, the same the leave prompt and the window-close guard ask.
    if (!hasUnsavedChanges(designerStore.get())) {
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

  /**
   * D-093 — remove a Recent entry. NON-DESTRUCTIVE: drops only the list entry (and forgets a
   * handle-backed entry's handle/permission); the underlying file is untouched and re-openable.
   */
  async function removeRecent(entry: RecentProject): Promise<void> {
    await window.cg.projects.forgetRecent({
      ...(entry.projectId !== undefined ? { projectId: entry.projectId } : {}),
      ...(entry.handleKey !== undefined ? { handleKey: entry.handleKey } : {}),
      ...(entry.path !== undefined ? { path: entry.path } : {}),
    });
    const key = entry.projectId ?? entry.path ?? entry.name;
    setRecent((prev) => prev.filter((e) => (e.projectId ?? e.path ?? e.name) !== key));
  }

  async function clearAllRecent(): Promise<void> {
    await window.cg.projects.clearRecent();
    setRecent([]);
  }

  return (
    <div className={s.page} aria-label="Designer landing">
      <div>
        <a
          className={s.brandLockup}
          href={COMPANY_SITE}
          onClick={followCompanySite}
          target="_blank"
          rel="noreferrer"
          data-testid="apasai-brand"
          aria-label="APASAI website"
        >
          <img className={s.brandLogo} src="/favicon.svg" alt="" />
          <span>
            <strong className={s.brandName}>APASAI</strong>
            <span className={s.brandProduct}>CG DESIGNER</span>
          </span>
        </a>
        <p className={s.brandSub}>
          Broadcast template builder — pick a demo, open a recent project, or start fresh.
        </p>
        {/*
          `CLIENT-TEST-RELEASE-01` B1 — THE LINE THAT NAMES THIS RELEASE on the start screen, where the
          Designer introduces itself and the first thing on screen at every launch (Help → About,
          `D-161`, names it too, with the build). A fact, so a `Tag`, in the line above's own treatment.
        */}
        <div className={s.versionActions}>
          <Tag className={s.brandSub} title={APP_BUILD} data-testid="app-version">
            Version {APP_VERSION}
          </Tag>
          <Button variant="bare" size="sm" onClick={() => setHistoryOpen(true)}>
            Version history
          </Button>
        </div>
      </div>

      <div className={s.projectActions}>
        <Button
          variant="primary"
          size="none"
          className={s.newButton}
          onClick={() => guardedSwitch('a new project', () => Promise.resolve(setModalOpen(true)))}
          aria-label="New project"
        >
          + New project
        </Button>
        <Button
          size="none"
          className={s.newButton}
          onClick={() => guardedSwitch('a saved project', openProjectFromDisk)}
          aria-label="Import project"
        >
          Import project
        </Button>
      </div>

      <div className={s.galleryHeader}>
        <h2 className={s.sectionTitle}>START FROM A TEMPLATE</h2>
        {hasMotion && (
          <div className={s.previewSettings}>
            {hoverPreference === null && reducedMotion && (
              <span className={s.brandSub}>System motion is reduced</span>
            )}
            <Button
              size="sm"
              aria-pressed={hoverPreviews}
              selected={hoverPreviews}
              onClick={() => {
                const next = !hoverPreviews;
                setHoverPreference(next);
                try {
                  window.localStorage.setItem(HOVER_PREVIEWS_KEY, next ? 'on' : 'off');
                } catch {
                  // Keep the choice for this visit when storage is blocked.
                }
              }}
            >
              Hover previews <span aria-hidden="true">· {hoverPreviews ? 'On' : 'Off'}</span>
            </Button>
          </div>
        )}
      </div>
      {starters.length === 0 ? (
        <p className={s.empty}>No starters available.</p>
      ) : (
        <div className={s.grid}>
          {starters.map((st) => (
            <StarterCard
              key={st.id}
              starter={st}
              motionEnabled={hoverPreviews}
              onOpen={() => guardedSwitch(st.label, () => loadStarter(st.id))}
            />
          ))}
        </div>
      )}

      <h2 className={s.sectionTitle}>RECENT PROJECTS</h2>
      {recent.length === 0 ? (
        <p className={s.empty}>No recent projects yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {recent.slice(0, 12).map((r) => (
            <div key={r.projectId ?? r.path ?? r.name} className={s.recentRowWrap}>
              <Button
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
              <Control
                variant="bare"
                className={s.recentRemove}
                aria-label={`Remove ${r.name} from recent`}
                title="Remove from recent"
                onClick={(e) => {
                  e.stopPropagation();
                  void removeRecent(r);
                }}
              >
                ×
              </Control>
            </div>
          ))}
          <Button variant="bare" className={s.clearRecent} onClick={() => void clearAllRecent()}>
            Clear all recent
          </Button>
        </div>
      )}

      {modalOpen && <NewProjectModal onClose={() => setModalOpen(false)} />}
      {historyOpen && <VersionHistoryModal onClose={() => setHistoryOpen(false)} />}
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

/**
 * Gallery card with a deliberately short motion preview. The WebM is a fast,
 * silent summary, not a recording at the template's real playout speed. It is
 * lazy-loaded only when the operator points at or keyboard-focuses the card.
 */
export function StarterCard({
  starter,
  motionEnabled,
  onOpen,
}: {
  starter: StarterEntry;
  motionEnabled: boolean;
  onOpen: () => void;
}): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [motionVisible, setMotionVisible] = useState(false);

  function startMotion(): void {
    const video = videoRef.current;
    if (video === null || !motionEnabled) return;
    video.currentTime = 0;
    const pending = video.play();
    if (pending !== undefined) {
      void pending.catch(() => setMotionVisible(false));
    }
  }

  const stopMotion = useCallback((): void => {
    const video = videoRef.current;
    if (video !== null) {
      video.pause();
      video.currentTime = 0;
    }
    setMotionVisible(false);
  }, []);

  useEffect(() => {
    if (motionEnabled) return;
    if (videoRef.current?.paused === false) stopMotion();
    else setMotionVisible(false);
  }, [motionEnabled, stopMotion]);

  const showMotion = motionEnabled && motionVisible;

  return (
    <Button
      variant="bare"
      className={s.card}
      data-testid="starter-card"
      onClick={onOpen}
      onPointerEnter={startMotion}
      onPointerLeave={stopMotion}
      onFocus={startMotion}
      onBlur={stopMotion}
    >
      {starter.isNew === true && <span className={s.newBadge}>New</span>}
      {starter.previewUrl !== undefined ? (
        <span className={s.cardThumbWrap}>
          <img src={starter.previewUrl} alt={`${starter.label} preview`} className={s.cardThumb} />
          {starter.motionPreviewUrl !== undefined && (
            <>
              <video
                ref={videoRef}
                src={starter.motionPreviewUrl}
                poster={starter.previewUrl}
                className={`${s.cardMotion} ${showMotion ? s.cardMotionVisible : ''}`}
                muted
                loop
                playsInline
                preload="none"
                aria-hidden="true"
                data-testid="starter-motion-preview"
                onPlaying={() => setMotionVisible(motionEnabled)}
                onError={() => setMotionVisible(false)}
              />
              {motionEnabled && (
                <span className={`${s.motionHint} ${showMotion ? s.motionHintHidden : ''}`}>
                  <span aria-hidden="true">▶</span> Hover preview
                </span>
              )}
            </>
          )}
        </span>
      ) : (
        <span className={s.cardThumbFallback}>PREVIEW</span>
      )}
      <span className={s.cardBody}>
        <span className={s.cardLabel}>{starter.label}</span>
        {/* `DESIGNER-FIX-0905` — the DIFFERENTIATOR as a comparable badge, derived
            from the starter's scene. */}
        {starter.playout !== undefined && (
          <span className={s.cardBadge} data-testid="starter-playout">
            {playoutBadge(starter.playout)}
          </span>
        )}
      </span>
    </Button>
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
