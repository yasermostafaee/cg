import { useEffect, useState } from 'react';
import { colors } from '../../theme.js';
import { designerStore, shallowEqual, useDesignerSelector } from '../../state/store.js';
import { cx } from '../../cx.js';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import * as s from './CompositionsPanel.css.js';

/** MIME-ish key used when dragging a composition onto the canvas. */
export const COMPOSITION_DND_TYPE = 'application/x-cg-composition';

/**
 * Compositions panel (Loopic-style). Lists every composition — there is no
 * special "main scene"; they are all equal and all deletable. Double-click
 * opens one for editing (single click does nothing); the `+` button adds a
 * new composition. Right-click a composition for: add-to-open-composition,
 * duplicate, rename, delete. Rows are draggable onto the canvas to place an
 * instance.
 */
export function CompositionsPanel(): JSX.Element {
  const { scene, activeCompositionId } = useDesignerSelector(
    (s) => ({ scene: s.scene, activeCompositionId: s.activeCompositionId }),
    shallowEqual,
  );
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  useEffect(() => {
    if (menu === null) return;
    function close(): void {
      setMenu(null);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  if (scene === null) return <aside className={s.panel} aria-label="Compositions" />;

  const comps = scene.compositions ?? [];

  const canNest = (id: string): boolean =>
    activeCompositionId !== null &&
    id !== activeCompositionId &&
    designerStore.canNestCompositionInActive(id);

  return (
    <aside className={s.panel} aria-label="Compositions">
      <div className={s.header}>
        <span className={s.title}>Compositions</span>
        <Control
          variant="bare"
          className={s.iconButton}
          aria-label="New composition"
          title="New composition"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            const id = designerStore.addComposition();
            if (id !== null) setRenaming(id);
          }}
        >
          +
        </Control>
      </div>
      <div className={s.list}>
        {comps.length === 0 ? (
          <p className={s.empty}>
            No compositions yet.
            <br />
            Click + to create one.
          </p>
        ) : (
          comps.map((comp) => {
            const isActive = comp.id === activeCompositionId;
            return (
              <div
                key={comp.id}
                className={cx('cg-comp-row', s.row, isActive && s.rowActive)}
                draggable={renaming !== comp.id}
                onDragStart={(e) => {
                  e.dataTransfer.setData(COMPOSITION_DND_TYPE, comp.id);
                  e.dataTransfer.setData('text/plain', comp.name);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                // Single click does nothing; double-click opens the composition.
                onDoubleClick={() => {
                  if (renaming === null) designerStore.setActiveComposition(comp.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenu({ id: comp.id, x: e.clientX, y: e.clientY });
                }}
                title={`${comp.name} — double-click to open`}
              >
                {/* A filled dot marks the open composition; inactive rows have none. */}
                <span
                  className={s.dot}
                  style={{ background: isActive ? colors.accent : 'transparent' }}
                />
                {renaming === comp.id ? (
                  <input
                    className={s.nameInput}
                    defaultValue={comp.name}
                    autoFocus
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== '') designerStore.renameComposition(comp.id, v);
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                ) : (
                  <span className={s.name}>{comp.name}</span>
                )}
              </div>
            );
          })
        )}
      </div>
      {menu !== null && (
        <div
          className={s.menu}
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MenuButton
            label="Add to composition"
            title="Add an instance to the open composition"
            onClick={() => {
              const mid = menu.id;
              setMenu(null);
              if (canNest(mid)) {
                designerStore.addCompositionInstance(mid);
              } else {
                const name = comps.find((c) => c.id === mid)?.name ?? 'This composition';
                designerStore.showNotice(
                  activeCompositionId === null
                    ? 'Open a composition first, then add this one into it.'
                    : `Can’t add “${name}” here — it already contains the open composition, so nesting it would loop forever.`,
                );
              }
            }}
          />
          <MenuButton
            label="Duplicate"
            onClick={() => {
              designerStore.duplicateComposition(menu.id);
              setMenu(null);
            }}
          />
          <MenuButton
            label="Rename"
            onClick={() => {
              setRenaming(menu.id);
              setMenu(null);
            }}
          />
          <MenuButton
            label="Delete"
            danger
            onClick={() => {
              designerStore.deleteComposition(menu.id);
              setMenu(null);
            }}
          />
        </div>
      )}
    </aside>
  );
}

function MenuButton(props: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}): JSX.Element {
  return (
    <Button
      variant="bare"
      role="menuitem"
      title={props.title}
      disabled={props.disabled === true}
      className={cx(
        s.menuItem,
        props.danger === true && s.menuItemDanger,
        props.disabled === true && s.menuItemDisabled,
      )}
      onClick={props.disabled === true ? undefined : props.onClick}
    >
      {props.label}
    </Button>
  );
}
