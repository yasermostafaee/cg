import { useEffect, useState } from 'react';
import type { TemplateType } from '@cg/shared-schema';
import type { StarterEntry } from '@cg/shared-ipc';
import { designerStore } from '../../state/store.js';
import { cx } from '../../cx.js';
import { Button } from '../../ui/Button.js';
import { Select } from '../../ui/Select.js';
import * as s from './LibraryPanel.css.js';

const TEMPLATE_TYPES: TemplateType[] = [
  'lower-third',
  'ticker',
  'logo-bug',
  'breaking-news',
  'fullscreen',
  'custom',
];

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
    // D-088 — Recent is now handle-keyed; this (legacy, unmounted) panel only handles
    // path entries, so keep just those.
    setRecent(list.flatMap((r) => (r.path !== undefined ? [{ path: r.path, name: r.name }] : [])));
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
    <aside className={s.panel} aria-label="Library">
      {starters.length > 0 && (
        <>
          <h2 className={s.heading}>STARTERS</h2>
          <div className={s.list}>
            {starters.map((st) => (
              <Button
                key={st.id}
                variant="bare"
                className={s.button}
                title={st.description}
                onClick={() => void loadStarter(st.id)}
              >
                {st.label}
              </Button>
            ))}
          </div>
        </>
      )}

      <h2 className={s.heading} style={{ marginTop: starters.length > 0 ? '0.5rem' : 0 }}>
        NEW PROJECT
      </h2>
      <input
        className={s.select}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
      />
      <Select
        className={s.select}
        value={type}
        onChange={(e) => setType(e.target.value as TemplateType)}
        aria-label="Template type"
      >
        {TEMPLATE_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>
      <Button
        variant="bare"
        className={cx(s.button, s.buttonPrimary)}
        onClick={() => void createNew()}
      >
        Create
      </Button>

      <h2 className={s.heading} style={{ marginTop: '0.5rem' }}>
        RECENT
      </h2>
      {recent.length === 0 ? (
        <p className={s.sub}>No projects yet.</p>
      ) : (
        <div className={s.list}>
          {recent.slice(0, 10).map((r) => (
            <Button
              key={r.path}
              variant="bare"
              className={s.button}
              onClick={() => void openRecent(r.path)}
            >
              {r.name}
            </Button>
          ))}
        </div>
      )}
    </aside>
  );
}
