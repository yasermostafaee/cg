import { useEffect, useState } from 'react';
import { colors } from '../../theme.js';
import { designerStore, useDesignerStore } from '../../state/store.js';

/** MIME-ish key used when dragging a composition onto the canvas. */
export const COMPOSITION_DND_TYPE = 'application/x-cg-composition';

const styles = {
  panel: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: 0,
    height: '100%',
    width: '100%',
    boxSizing: 'border-box' as const,
    overflow: 'hidden' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.45rem 0.55rem',
    borderBottom: `1px solid ${colors.border}`,
  },
  title: {
    flex: 1,
    fontSize: '0.78rem',
    fontWeight: 700,
    color: colors.text,
    letterSpacing: '0.02em',
  },
  iconButton: {
    width: 22,
    height: 22,
    background: 'transparent',
    color: colors.textMuted,
    border: `1px solid transparent`,
    borderRadius: '0.22rem',
    cursor: 'pointer',
    fontSize: '0.95rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
    padding: '0.3rem 0.3rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.1rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
    padding: '0.35rem 0.5rem',
    borderRadius: '0.25rem',
    cursor: 'pointer',
    color: colors.text,
    fontSize: '0.78rem',
    userSelect: 'none' as const,
    border: '1px solid transparent',
  },
  rowActive: {
    background: '#333642',
    borderColor: colors.accentMuted,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: '50%',
    flexShrink: 0,
    boxSizing: 'border-box' as const,
  },
  name: {
    flex: 1,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  nameInput: {
    flex: 1,
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.accent}`,
    borderRadius: '0.2rem',
    padding: '0.05rem 0.3rem',
    fontSize: '0.78rem',
    outline: 'none',
    minWidth: 0,
  },
  menu: {
    position: 'fixed' as const,
    background: '#1c1f2d',
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
    minWidth: 180,
    padding: '0.25rem 0',
    zIndex: 3000,
    fontSize: '0.76rem',
  },
  menuItem: {
    display: 'block',
    width: '100%',
    background: 'transparent',
    color: colors.text,
    border: 'none',
    textAlign: 'left' as const,
    padding: '0.4rem 0.7rem',
    fontSize: '0.78rem',
    cursor: 'pointer',
  },
  menuItemDisabled: {
    color: colors.textMuted,
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  menuItemDanger: { color: '#f87171' },
  empty: {
    color: colors.textMuted,
    fontSize: '0.72rem',
    textAlign: 'center' as const,
    padding: '0.6rem 0.5rem',
    lineHeight: 1.5,
  },
} as const;

/**
 * Compositions panel (Loopic-style). Lists every composition — there is no
 * special "main scene"; they are all equal and all deletable. Double-click
 * opens one for editing (single click does nothing); the `+` button adds a
 * new composition. Right-click a composition for: add-to-open-composition,
 * duplicate, rename, delete. Rows are draggable onto the canvas to place an
 * instance.
 */
export function CompositionsPanel(): JSX.Element {
  const { scene, activeCompositionId } = useDesignerStore();
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

  if (scene === null) return <aside style={styles.panel} aria-label="Compositions" />;

  const comps = scene.compositions ?? [];

  const canNest = (id: string): boolean =>
    id !== activeCompositionId && designerStore.canNestCompositionInActive(id);

  return (
    <aside style={styles.panel} aria-label="Compositions">
      <div style={styles.header}>
        <span style={styles.title}>Compositions</span>
        <button
          type="button"
          style={styles.iconButton}
          aria-label="New composition"
          title="New composition"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            const id = designerStore.addComposition();
            if (id !== null) setRenaming(id);
          }}
        >
          +
        </button>
      </div>
      <div style={styles.list}>
        {comps.length === 0 ? (
          <p style={styles.empty}>
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
                style={{ ...styles.row, ...(isActive ? styles.rowActive : {}) }}
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
                  style={{
                    ...styles.dot,
                    background: isActive ? colors.accent : 'transparent',
                  }}
                />
                {renaming === comp.id ? (
                  <input
                    style={styles.nameInput}
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
                  <span style={styles.name}>{comp.name}</span>
                )}
              </div>
            );
          })
        )}
      </div>
      {menu !== null && (
        <div
          style={{ ...styles.menu, left: menu.x, top: menu.y }}
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MenuButton
            label="Add to composition"
            disabled={!canNest(menu.id)}
            title={
              canNest(menu.id)
                ? 'Add an instance to the open composition'
                : 'Would create a circular reference'
            }
            onClick={() => {
              designerStore.addCompositionInstance(menu.id);
              setMenu(null);
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
    <button
      type="button"
      role="menuitem"
      title={props.title}
      disabled={props.disabled === true}
      style={{
        ...styles.menuItem,
        ...(props.danger === true ? styles.menuItemDanger : {}),
        ...(props.disabled === true ? styles.menuItemDisabled : {}),
      }}
      onClick={props.disabled === true ? undefined : props.onClick}
    >
      {props.label}
    </button>
  );
}
