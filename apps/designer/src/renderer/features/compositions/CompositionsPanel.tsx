import { useEffect, useState } from 'react';
import { Component, PanelsTopLeft, Plus, Trash2 } from 'lucide-react';
import { colors } from '../../theme.js';
import { designerStore, shallowEqual, useDesignerSelector } from '../../state/store.js';
import { cx } from '../../cx.js';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import { guardedAddCompositionInstance } from '../addGuard/duration-guard.js';
import {
  detachedLookCompositions,
  projectLookGroup,
  projectLookGroupHomeId,
  registeredLookCompositionIds,
  registeredLookForComposition,
} from '../../state/slices/looks.js';
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
  const [confirmRemoveGroup, setConfirmRemoveGroup] = useState(false);

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
  const lookCompositionIds = registeredLookCompositionIds(scene);
  const lookGroup = projectLookGroup(scene);
  const detachedLookIds = new Set(
    detachedLookCompositions(scene).map((composition) => composition.id),
  );
  const menuLook = menu === null ? undefined : registeredLookForComposition(scene, menu.id);
  const lookGroupHomeId = projectLookGroupHomeId(scene);

  const canNest = (id: string): boolean =>
    activeCompositionId !== null &&
    id !== activeCompositionId &&
    designerStore.canNestCompositionInActive(id);

  const renderCompositionRow = (comp: (typeof comps)[number]): JSX.Element => {
    const isActive = comp.id === activeCompositionId;
    const isLook = lookCompositionIds.has(comp.id);
    return (
      <div
        key={comp.id}
        className={cx('cg-comp-row', s.row, isLook && s.rowLook, isActive && s.rowActive)}
        data-composition-kind={isLook ? 'look' : 'composition'}
        draggable={renaming !== comp.id}
        onDragStart={(e) => {
          e.dataTransfer.setData(COMPOSITION_DND_TYPE, comp.id);
          e.dataTransfer.setData('text/plain', comp.name);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onDoubleClick={() => {
          if (renaming === null) designerStore.setActiveComposition(comp.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ id: comp.id, x: e.clientX, y: e.clientY });
        }}
        title={`${comp.name} — ${isLook ? 'Preset' : 'composition'} — double-click to open`}
      >
        <span className={s.dot} style={{ background: isActive ? colors.accent : 'transparent' }} />
        <span
          className={cx(s.kindIcon, isLook && s.kindIconLook)}
          title={isLook ? 'Preset' : 'Composition'}
        >
          <Icon icon={isLook ? PanelsTopLeft : Component} size={13} />
        </span>
        {renaming === comp.id ? (
          <input
            className={s.nameInput}
            defaultValue={comp.name}
            autoFocus
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value !== '') designerStore.renameComposition(comp.id, value);
              setRenaming(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setRenaming(null);
            }}
          />
        ) : (
          <span className={cx(s.name, isLook && s.nameLook)}>{comp.name}</span>
        )}
        {comp.id === scene.entryCompositionId && renaming !== comp.id && (
          <span className={s.mainBadge} title="Main composition — opens by default">
            main
          </span>
        )}
      </div>
    );
  };

  const compositionRows = comps.filter((composition) => !lookCompositionIds.has(composition.id));
  const lookRows = comps.filter((composition) => lookCompositionIds.has(composition.id));

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
          <Icon icon={Plus} size={16} />
        </Control>
      </div>
      <div className={s.list}>
        {compositionRows.length === 0 ? (
          <p className={s.empty}>
            No compositions yet.
            <br />
            Click + to create one.
          </p>
        ) : (
          compositionRows.map(renderCompositionRow)
        )}
        {lookGroup !== undefined && (
          <section className={s.lookSection} aria-label="Presets">
            <div className={s.lookHeader}>
              <span className={s.lookTitle}>
                <Icon icon={PanelsTopLeft} size={13} />
                Presets
              </span>
              <Control
                variant="bare"
                className={s.addLookButton}
                aria-label="Add Preset"
                title="Add Preset"
                onClick={() => designerStore.addLook()}
              >
                <Icon icon={Plus} size={14} />
              </Control>
              <Control
                variant="bare"
                className={s.removeGroupButton}
                aria-label="Delete multi-frame group"
                title="Delete multi-frame group"
                onClick={() => {
                  if (lookGroup.looks.length === 0) designerStore.removeLookGroup();
                  else setConfirmRemoveGroup(true);
                }}
              >
                <Icon icon={Trash2} size={13} />
              </Control>
            </div>
            {lookRows.length === 0 ? (
              <p className={s.lookEmpty}>No Presets yet.</p>
            ) : (
              lookRows.map(renderCompositionRow)
            )}
          </section>
        )}
      </div>
      {menu !== null && (
        <div
          className={s.menu}
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {menuLook !== undefined && lookGroupHomeId !== undefined && (
            <MenuButton
              label="Show Preset on composition"
              title="Open the multi-frame composition and show this Preset"
              onClick={() => {
                designerStore.setActiveComposition(lookGroupHomeId);
                designerStore.setActiveLook(menuLook.id);
                setMenu(null);
              }}
            />
          )}
          {detachedLookIds.has(menu.id) && (
            <MenuButton
              label="Make a Preset"
              title="Register this full-frame composition as a Preset"
              onClick={() => {
                designerStore.addLookFromComposition(menu.id);
                setMenu(null);
              }}
            />
          )}
          {menuLook === undefined && (
            <MenuButton
              label="Add to composition"
              title="Add an instance to the open composition"
              onClick={() => {
                const mid = menu.id;
                setMenu(null);
                if (canNest(mid)) {
                  // D-151 — through the add-time duration guard (door C1): a longer child raises
                  // the TWO-choice dialog before anything is inserted; the cycle guard still runs
                  // inside the store action at commit time.
                  guardedAddCompositionInstance(mid);
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
          )}
          {menuLook === undefined && (
            <MenuButton
              label={menu.id === scene.entryCompositionId ? 'Unset main' : 'Set as main'}
              title="Open this composition by default when the template is opened"
              onClick={() => {
                designerStore.setEntryComposition(
                  menu.id === scene.entryCompositionId ? null : menu.id,
                );
                setMenu(null);
              }}
            />
          )}
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
            label={lookCompositionIds.has(menu.id) ? 'Delete Preset' : 'Delete'}
            title={
              lookCompositionIds.has(menu.id)
                ? 'Delete this Preset, its instance and its composition'
                : 'Delete this composition'
            }
            danger
            onClick={() => {
              designerStore.deleteComposition(menu.id);
              setMenu(null);
            }}
          />
        </div>
      )}
      {confirmRemoveGroup && lookGroup !== undefined && (
        <Modal
          title="Delete multi-frame group?"
          onClose={() => setConfirmRemoveGroup(false)}
          footer={
            <>
              <ModalButton onClick={() => setConfirmRemoveGroup(false)} autoFocus>
                Cancel
              </ModalButton>
              <ModalButton
                variant="danger"
                onClick={() => {
                  designerStore.removeLookGroup();
                  setConfirmRemoveGroup(false);
                }}
              >
                Delete all
              </ModalButton>
            </>
          }
        >
          <p className={s.confirmBody}>
            This will delete {String(lookGroup.looks.length)} Preset
            {lookGroup.looks.length === 1 ? '' : 's'}, their timeline instances, and their
            compositions. This can be undone.
          </p>
        </Modal>
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
