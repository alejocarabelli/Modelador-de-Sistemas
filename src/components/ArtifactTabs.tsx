import { Check, ChevronDown, FileText, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type PointerEvent } from 'react';
import type { DesignArtifact, ProjectFile } from '../types/diagram';
import { artifactTypeInfo } from '../constants/artifactTypes';
import { reorderArtifactTabs } from '../utils/artifactTabs';
import { ArtifactTypeIcon } from './ArtifactTypeIcon';
import { fileDisplayName } from '../utils/projectFiles';

/** What a tab shows: an artifact, or a PDF of the project (the only one without a `type`). */
type TabItem = DesignArtifact | ProjectFile;

const isFileTab = (item: TabItem): item is ProjectFile => !('type' in item);
const tabName = (item: TabItem): string => isFileTab(item) ? fileDisplayName(item.name) : item.name;

function TabIcon({ item, size }: { item: TabItem; size: number }) {
  return isFileTab(item) ? <FileText aria-hidden="true" size={size} /> : <ArtifactTypeIcon type={item.type} size={size} />;
}

type ArtifactTabProps = {
  artifact: TabItem;
  active: boolean;
  dragging?: boolean;
  tabRef?: (element: HTMLDivElement | null) => void;
  style?: CSSProperties;
  onSelect: () => void;
  onClose: () => void;
} & Pick<HTMLAttributes<HTMLDivElement>, 'onKeyDown' | 'onContextMenu' | 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onLostPointerCapture'>;

export function ArtifactTab({ artifact, active, dragging, tabRef, style, onSelect, onClose, ...events }: ArtifactTabProps) {
  const name = tabName(artifact);
  return (
    <div
      {...events}
      ref={tabRef}
      id={`artifact-tab-${artifact.id}`}
      className={`artifact-tab${active ? ' is-active' : ''}${dragging ? ' is-dragging' : ''}`}
      role="tab"
      aria-label={name}
      aria-selected={active}
      aria-controls="artifact-editor-panel"
      tabIndex={active ? 0 : -1}
      title={`${name} · ${isFileTab(artifact) ? 'PDF' : artifactTypeInfo(artifact.type).label}`}
      style={style}
      onClick={onSelect}
      onMouseDown={(event) => { if (event.button === 1) event.preventDefault(); }}
      onAuxClick={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        onClose();
      }}
    >
      <span className="artifact-tab-icon"><TabIcon item={artifact} size={14} /></span>
      <span className="artifact-tab-name">{name}</span>
      <button
        type="button"
        className="artifact-tab-close"
        aria-label={`Cerrar ${name}`}
        tabIndex={-1}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); onClose(); }}
      >
        <X aria-hidden="true" size={12} />
      </button>
    </div>
  );
}

type ArtifactTabsProps = {
  projectName: string;
  artifacts: DesignArtifact[];
  /** The project's PDFs; their ids sit in `openArtifactIds` next to the artifacts'. */
  files?: ProjectFile[];
  openArtifactIds: string[];
  /** The id of the active tab, artifact or PDF. */
  activeArtifactId: string;
  onSelect: (artifactId: string) => void;
  onClose: (artifactId: string) => void;
  onCloseOthers: (artifactId: string) => void;
  onCloseRight: (artifactId: string) => void;
  onReorder: (ids: string[]) => void;
  onOpenInWindow?: (artifactId: string) => void;
  /** Absent where a PDF cannot have its own window: the item is not offered. */
  onOpenFileInWindow?: (fileId: string) => void;
};

type TabMenu = { kind: 'context'; artifactId: string; x: number; y: number } | { kind: 'all'; x: number; y: number };
type TabDrag = {
  artifactId: string;
  pointerId: number;
  startX: number;
  startScrollLeft: number;
  originalLeft: number;
  width: number;
  slots: Array<{ left: number; width: number }>;
  order: string[];
  originalOrder: string[];
  started: boolean;
};

export function ArtifactTabs({ projectName, artifacts, files = [], openArtifactIds, activeArtifactId, onSelect, onClose, onCloseOthers, onCloseRight, onReorder, onOpenInWindow, onOpenFileInWindow }: ArtifactTabsProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const allButtonRef = useRef<HTMLButtonElement | null>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const dragRef = useRef<TabDrag | null>(null);
  const suppressClickRef = useRef(false);
  const [dragVisual, setDragVisual] = useState<{ artifactId: string; offset: number } | null>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const [menu, setMenu] = useState<TabMenu | null>(null);
  if (menu?.kind === 'context' && !openArtifactIds.includes(menu.artifactId)) setMenu(null);
  const openArtifacts = openArtifactIds.flatMap((id): TabItem[] => {
    const item = artifacts.find((candidate) => candidate.id === id) ?? files.find((candidate) => candidate.id === id);
    return item === undefined ? [] : [item];
  });
  const activeArtifact = openArtifacts.find((item) => item.id === activeArtifactId);
  const windowOpener = (id: string): ((id: string) => void) | undefined =>
    files.some((file) => file.id === id) ? onOpenFileInWindow : onOpenInWindow;

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null) return;
    const measure = (): void => {
      const left = list.scrollLeft > 1;
      const right = list.scrollWidth - list.clientWidth - list.scrollLeft > 1;
      setOverflow((previous) => previous.left === left && previous.right === right ? previous : { left, right });
    };
    if (!dragRef.current?.started) tabRefs.current.get(activeArtifactId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    list.addEventListener('scroll', measure);
    const translateWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || list.scrollWidth <= list.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientWidth : 1;
      list.scrollLeft += event.deltaY * factor;
      measure();
    };
    list.addEventListener('wheel', translateWheel, { passive: false });
    return () => {
      observer.disconnect();
      list.removeEventListener('scroll', measure);
      list.removeEventListener('wheel', translateWheel);
    };
  }, [activeArtifactId, openArtifactIds, projectName]);

  const dismissMenu = (restoreFocus: boolean): void => {
    if (restoreFocus && menu !== null) {
      if (menu.kind === 'all') allButtonRef.current?.focus();
      else tabRefs.current.get(menu.artifactId)?.focus({ preventScroll: true });
    }
    setMenu(null);
  };

  useLayoutEffect(() => {
    if (menu === null || menuRef.current === null) return;
    const element = menuRef.current;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8))}px`;
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [menu]);

  useEffect(() => {
    if (menu === null) return;
    const dismissOutside = (event: globalThis.PointerEvent): void => {
      if (event.target instanceof Node && (menuRef.current?.contains(event.target) || allButtonRef.current?.contains(event.target))) return;
      setMenu(null);
    };
    const dismissOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (menu.kind === 'all') allButtonRef.current?.focus();
      else tabRefs.current.get(menu.artifactId)?.focus({ preventScroll: true });
      setMenu(null);
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissOnEscape, true);
    };
  }, [menu]);

  const focusTab = (artifactId: string): void => {
    const tab = tabRefs.current.get(artifactId);
    tab?.focus({ preventScroll: true });
    tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const closeTab = (artifactId: string): void => {
    const tab = tabRefs.current.get(artifactId);
    const restoreFocus = tab?.contains(document.activeElement) ?? false;
    const index = openArtifactIds.indexOf(artifactId);
    const neighbor = openArtifactIds[index + 1] ?? openArtifactIds[index - 1];
    onClose(artifactId);
    if (restoreFocus && neighbor !== undefined) focusTab(neighbor);
  };

  const handleTabKey = (event: KeyboardEvent<HTMLDivElement>, artifactId: string): void => {
    if (event.target !== event.currentTarget || event.metaKey || event.ctrlKey || event.altKey) return;
    const index = openArtifactIds.indexOf(artifactId);
    let nextIndex: number | undefined;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + openArtifactIds.length) % openArtifactIds.length;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % openArtifactIds.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = openArtifactIds.length - 1;
    if (nextIndex !== undefined) { event.preventDefault(); event.stopPropagation(); focusTab(openArtifactIds[nextIndex]); }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onSelect(artifactId); }
    if (event.key === 'Delete') {
      event.preventDefault();
      event.stopPropagation();
      closeTab(artifactId);
    }
  };

  const beginDrag = (event: PointerEvent<HTMLDivElement>, artifactId: string): void => {
    if (event.button !== 0 || listRef.current === null) return;
    suppressClickRef.current = false;
    const list = listRef.current;
    const listLeft = list.getBoundingClientRect().left;
    const slots = openArtifactIds.map((id) => {
      const bounds = tabRefs.current.get(id)!.getBoundingClientRect();
      return { left: bounds.left - listLeft + list.scrollLeft, width: bounds.width };
    });
    const index = openArtifactIds.indexOf(artifactId);
    dragRef.current = {
      artifactId, pointerId: event.pointerId, startX: event.clientX, startScrollLeft: list.scrollLeft,
      originalLeft: slots[index].left, width: slots[index].width, slots,
      order: [...openArtifactIds], originalOrder: [...openArtifactIds], started: false,
    };
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    const list = listRef.current;
    if (drag === null || list === null || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.startX;
    if (!drag.started && Math.abs(delta) < 4) return;
    if (!drag.started) {
      drag.started = true;
      setMenu(null);
    }
    event.preventDefault();
    const bounds = list.getBoundingClientRect();
    if (event.clientX < bounds.left + 24) list.scrollLeft -= 12;
    if (event.clientX > bounds.right - 24) list.scrollLeft += 12;
    const left = Math.max(0, Math.min(list.scrollWidth - drag.width, drag.originalLeft + delta + list.scrollLeft - drag.startScrollLeft));
    const center = left + drag.width / 2;
    const index = drag.order.indexOf(drag.artifactId);
    let target = index;
    while (target < drag.order.length - 1 && center > drag.slots[target + 1].left + drag.slots[target + 1].width / 2) target++;
    while (target > 0 && center < drag.slots[target - 1].left + drag.slots[target - 1].width / 2) target--;
    if (target !== index) {
      drag.order = reorderArtifactTabs(drag.order, drag.artifactId, target);
      onReorder(drag.order);
    }
    setDragVisual({ artifactId: drag.artifactId, offset: left - drag.slots[target].left });
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>, cancel = false): void => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    suppressClickRef.current = drag.started && !cancel;
    if (cancel && drag.started) onReorder(drag.originalOrder);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragVisual(null);
  };

  const menuAction = (action: () => void): void => { dismissMenu(true); action(); };
  const handleMenuKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Tab') { dismissMenu(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div className="artifact-tabs">
      <h1 className="visually-hidden">{activeArtifact === undefined ? undefined : tabName(activeArtifact)}</h1>
      <span className="artifact-tabs-project" title={projectName}>{projectName}</span>
      <span className="artifact-tabs-divider" aria-hidden="true" />
      <div ref={listRef} className="artifact-tabs-list" role="tablist" aria-label="Artefactos abiertos" data-hidden-left={overflow.left} data-hidden-right={overflow.right}>
        {openArtifacts.map((artifact) => (
          <ArtifactTab
            key={artifact.id}
            artifact={artifact}
            active={artifact.id === activeArtifactId}
            dragging={dragVisual?.artifactId === artifact.id}
            style={dragVisual?.artifactId === artifact.id ? { transform: `translateX(${dragVisual.offset}px)` } : undefined}
            tabRef={(element) => { if (element === null) tabRefs.current.delete(artifact.id); else tabRefs.current.set(artifact.id, element); }}
            onSelect={() => {
              if (suppressClickRef.current) { suppressClickRef.current = false; return; }
              onSelect(artifact.id);
            }}
            onClose={() => closeTab(artifact.id)}
            onKeyDown={(event) => handleTabKey(event, artifact.id)}
            onPointerDown={(event) => beginDrag(event, artifact.id)}
            onPointerMove={moveDrag}
            onPointerUp={(event) => finishDrag(event)}
            onPointerCancel={(event) => finishDrag(event, true)}
            onLostPointerCapture={(event) => { if (dragRef.current !== null) finishDrag(event, true); }}
            onContextMenu={(event) => {
              event.preventDefault();
              const bounds = event.currentTarget.getBoundingClientRect();
              setMenu({ kind: 'context', artifactId: artifact.id, x: event.clientX || bounds.left, y: event.clientY || bounds.bottom });
            }}
          />
        ))}
      </div>
      {overflow.left || overflow.right ? (
        <button
          ref={allButtonRef}
          type="button"
          className="artifact-tabs-all"
          aria-label="Todas las pestañas"
          title="Todas las pestañas"
          aria-haspopup="menu"
          aria-expanded={menu?.kind === 'all'}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setMenu(menu?.kind === 'all' ? null : { kind: 'all', x: bounds.right - 280, y: bounds.bottom + 4 });
          }}
        ><ChevronDown aria-hidden="true" size={16} /></button>
      ) : null}
      {menu !== null ? (
        <div ref={menuRef} className="canvas-context-menu artifact-tabs-menu" role="menu" aria-label={menu.kind === 'all' ? 'Todas las pestañas' : 'Opciones de pestaña'} style={{ left: menu.x, top: menu.y }} onKeyDown={handleMenuKey}>
          {menu.kind === 'all' ? openArtifacts.map((artifact) => (
            <button key={artifact.id} type="button" role="menuitemradio" aria-checked={artifact.id === activeArtifactId} title={tabName(artifact)} onClick={() => menuAction(() => onSelect(artifact.id))}>
              <TabIcon item={artifact} size={14} />
              <span className="artifact-tab-name">{tabName(artifact)}</span>
              {artifact.id === activeArtifactId ? <Check aria-hidden="true" size={14} /> : null}
            </button>
          )) : (
            <>
              {windowOpener(menu.artifactId) ? (
                <button type="button" role="menuitem" onClick={() => menuAction(() => windowOpener(menu.artifactId)?.(menu.artifactId))}>Abrir en ventana nueva</button>
              ) : null}
              <button type="button" role="menuitem" onClick={() => menuAction(() => closeTab(menu.artifactId))}>Cerrar</button>
              <button type="button" role="menuitem" disabled={openArtifactIds.length <= 1} onClick={() => menuAction(() => onCloseOthers(menu.artifactId))}>Cerrar las demás</button>
              <button type="button" role="menuitem" disabled={openArtifactIds.indexOf(menu.artifactId) === openArtifactIds.length - 1} onClick={() => menuAction(() => onCloseRight(menu.artifactId))}>Cerrar las de la derecha</button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
