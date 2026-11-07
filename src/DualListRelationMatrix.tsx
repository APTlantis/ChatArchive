import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FolderKanban,
  Search,
  Check,
  CheckSquare,
  Square,
  X,
  Plus,
  ArrowUpRight,
  Sparkles,
  Maximize2,
  Minimize2,
  ChevronUp,
  ChevronDown,
  Layers,
  Database,
  Type,
  Trash2,
  Link2,
  Download,
} from 'lucide-react';
import type {
  KnowledgeState,
  KnowledgeCollection,
  KnowledgeCollectionItem,
  KnowledgeTarget,
  KnowledgeTargetType,
  ArtifactIndex,
  ArchiveIndex,
} from './types';

export type TypographyOption = 'ibm-plex' | 'inter' | 'source-sans';

export const TYPOGRAPHY_OPTIONS: { id: TypographyOption; label: string; sans: string; mono: string }[] = [
  { id: 'ibm-plex', label: 'IBM Plex', sans: 'IBM Plex Sans', mono: 'IBM Plex Mono' },
  { id: 'inter', label: 'Inter', sans: 'Inter', mono: 'JetBrains Mono' },
  { id: 'source-sans', label: 'Source Sans 3', sans: 'Source Sans 3', mono: 'Source Code Pro' },
];

export const SEED_COLLECTIONS: { id: number; name: string }[] = [
  { id: 1, name: 'City Hall Rebrand' },
  { id: 2, name: 'Core System Upgrade' },
  { id: 3, name: 'First Gen Lang-Logos' },
  { id: 4, name: 'Theme Review Feedback' },
  { id: 5, name: 'Project Proposal' },
  { id: 6, name: 'App Design' },
  { id: 7, name: 'Sandbox Test' },
];

export function getTargetPrefix(type: KnowledgeTargetType) {
  switch (type) {
    case 'asset':
      return '🖼️';
    case 'document':
      return '📄';
    case 'code':
      return '💻';
    case 'conversation':
      return '💬';
    case 'link':
      return '🔗';
    default:
      return '📌';
  }
}

export function targetKey(target: KnowledgeTarget) {
  return `${target.targetType}:${target.targetId}`;
}

export interface DualListRelationMatrixProps {
  knowledgeState: KnowledgeState;
  onApplyKnowledgeState: (next: KnowledgeState) => void;
  selectedTargets: KnowledgeTarget[];
  onSelectTargets: (targets: KnowledgeTarget[] | ((prev: KnowledgeTarget[]) => KnowledgeTarget[])) => void;
  onClearSelection: () => void;
  onOpenTarget?: (target: KnowledgeTarget) => void;
  onOpenTargetSource?: (target: KnowledgeTarget) => void;
  onOrganizeTarget?: (target: KnowledgeTarget) => void;
  onExportBundle?: (bundleName: string, targets: KnowledgeTarget[], chooseDirectory?: boolean) => void;
  artifacts?: ArtifactIndex | null;
  index?: ArchiveIndex | null;
  activeTypography: TypographyOption;
  onChangeTypography: (option: TypographyOption) => void;
  viewMode?: 'docked' | 'expanded' | 'fullscreen' | 'minimized';
  onChangeViewMode?: (mode: 'docked' | 'expanded' | 'fullscreen' | 'minimized') => void;
}

export default function DualListRelationMatrix({
  knowledgeState,
  onApplyKnowledgeState,
  selectedTargets,
  onSelectTargets,
  onClearSelection,
  onOpenTarget,
  onOpenTargetSource,
  onOrganizeTarget,
  onExportBundle,
  activeTypography,
  onChangeTypography,
  viewMode = 'docked',
  onChangeViewMode,
}: DualListRelationMatrixProps) {
  // Column 1 state
  const [collectionFilter, setCollectionFilter] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState<number>(() => {
    return knowledgeState.collections[0]?.id || 1;
  });
  const [checkedCollectionIds, setCheckedCollectionIds] = useState<Set<number>>(new Set());
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showAddCollection, setShowAddCollection] = useState(false);

  // Column 2 state
  const [pointerSearch, setPointerSearch] = useState('');
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>('all');
  const [activePopoverItemId, setActivePopoverItemId] = useState<string | null>(null);

  // Column 3 state
  const [ingestionAction, setIngestionAction] = useState<'selected' | 'multiple' | 'new'>('selected');
  const [newTargetCollectionName, setNewTargetCollectionName] = useState('');
  const [txToast, setTxToast] = useState<{ message: string; timestamp: number } | null>(null);

  // Keep selectedCollectionId synchronized with real collections without auto-seeding fake data into SQLite
  useEffect(() => {
    if (
      knowledgeState.collections.length > 0 &&
      !knowledgeState.collections.some((c) => c.id === selectedCollectionId)
    ) {
      setSelectedCollectionId(knowledgeState.collections[0].id);
    }
  }, [knowledgeState.collections, selectedCollectionId]);

  // Ensure active collection is valid
  const collections = knowledgeState.collections;
  const activeCollection = useMemo(() => {
    return collections.find((c) => c.id === selectedCollectionId) || collections[0] || null;
  }, [collections, selectedCollectionId]);

  // Map of collectionId -> count of items
  const collectionCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of knowledgeState.collectionItems) {
      counts.set(item.collectionId, (counts.get(item.collectionId) || 0) + 1);
    }
    return counts;
  }, [knowledgeState.collectionItems]);

  // Map of targetKey -> Set of collection IDs (for many-to-many lookup)
  const itemToCollectionsMap = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const item of knowledgeState.collectionItems) {
      const key = targetKey(item);
      let set = map.get(key);
      if (!set) {
        set = new Set<number>();
        map.set(key, set);
      }
      set.add(item.collectionId);
    }
    return map;
  }, [knowledgeState.collectionItems]);

  // Filtered collections for Column 1
  const filteredCollections = useMemo(() => {
    const needle = collectionFilter.trim().toLowerCase();
    if (!needle) return collections;
    return collections.filter((c) => c.name.toLowerCase().includes(needle));
  }, [collections, collectionFilter]);

  // Pointers inside selected collection for Column 2
  const itemsInActiveCollection = useMemo(() => {
    if (!activeCollection) return [];
    return knowledgeState.collectionItems.filter((item) => item.collectionId === activeCollection.id);
  }, [knowledgeState.collectionItems, activeCollection]);

  const displayPointerTitle = (item: KnowledgeTarget) =>
    knowledgeState.customTitles?.[targetKey(item)]?.trim() || item.title;

  // Filtered pointers inside selected collection
  const filteredPointers = useMemo(() => {
    let result = itemsInActiveCollection;
    if (activeTypeFilter !== 'all') {
      result = result.filter((item) => item.targetType === activeTypeFilter);
    }
    const needle = pointerSearch.trim().toLowerCase();
    if (needle) {
      result = result.filter((item) => {
        const resolved = knowledgeState.customTitles?.[targetKey(item)]?.trim() || item.title;
        return `${resolved}\n${item.title}`.toLowerCase().includes(needle);
      });
    }
    return result;
  }, [itemsInActiveCollection, activeTypeFilter, pointerSearch, knowledgeState.customTitles]);

  // Close popover when clicking outside
  const popoverRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setActivePopoverItemId(null);
      }
    }
    if (activePopoverItemId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activePopoverItemId]);

  // Multi-target toggle in Column 1
  function toggleCheckCollection(collId: number, event?: React.MouseEvent) {
    if (event) event.stopPropagation();
    setCheckedCollectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(collId)) next.delete(collId);
      else next.add(collId);
      return next;
    });
  }

  function toggleCheckAllCollections() {
    if (checkedCollectionIds.size === filteredCollections.length) {
      setCheckedCollectionIds(new Set());
    } else {
      setCheckedCollectionIds(new Set(filteredCollections.map((c) => c.id)));
    }
  }

  // Create new collection from Column 1
  function handleCreateCollection(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const name = newCollectionName.trim();
    if (!name) return;
    if (collections.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      alert('A collection with this name already exists.');
      return;
    }
    const nextId = Math.max(0, ...collections.map((c) => c.id)) + 1;
    const newColl: KnowledgeCollection = {
      id: nextId,
      name,
      createdAt: Date.now(),
    };
    onApplyKnowledgeState({
      ...knowledgeState,
      collections: [...collections, newColl],
    });
    setSelectedCollectionId(nextId);
    setNewCollectionName('');
    setShowAddCollection(false);
  }

  // Remove / Unlink pointer from current collection (Direct Unlink UX)
  function handleUnlinkPointer(pointer: KnowledgeCollectionItem, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = knowledgeState.collectionItems.filter(
      (item) => !(item.collectionId === pointer.collectionId && targetKey(item) === targetKey(pointer)),
    );
    onApplyKnowledgeState({
      ...knowledgeState,
      collectionItems: updated,
    });
  }

  // Execute database relations in Column 3
  function handleExecuteRelations() {
    if (!selectedTargets.length) return;
    const startTime = performance.now();
    let targetCollIds: number[] = [];

    if (ingestionAction === 'selected') {
      if (!activeCollection) return;
      targetCollIds = [activeCollection.id];
    } else if (ingestionAction === 'multiple') {
      targetCollIds = Array.from(checkedCollectionIds);
      if (!targetCollIds.length) {
        alert('Please check at least one collection in Column 1 to link to.');
        return;
      }
    } else if (ingestionAction === 'new') {
      const name = newTargetCollectionName.trim();
      if (!name) {
        alert('Please specify a collection name.');
        return;
      }
      const existing = collections.find((c) => c.name.toLowerCase() === name.toLowerCase());
      let newId: number;
      if (existing) {
        newId = existing.id;
      } else {
        newId = Math.max(0, ...collections.map((c) => c.id)) + 1;
        knowledgeState.collections.push({ id: newId, name, createdAt: Date.now() });
      }
      targetCollIds = [newId];
      setSelectedCollectionId(newId);
      setNewTargetCollectionName('');
    }

    // Build new collection items avoiding duplicates
    const existingPairs = new Set(
      knowledgeState.collectionItems.map((item) => `${item.collectionId}:${targetKey(item)}`),
    );
    const newItems: KnowledgeCollectionItem[] = [];
    const now = Date.now();

    for (const collId of targetCollIds) {
      for (const target of selectedTargets) {
        const pairKey = `${collId}:${targetKey(target)}`;
        if (!existingPairs.has(pairKey)) {
          existingPairs.add(pairKey);
          newItems.push({
            ...target,
            collectionId: collId,
            createdAt: now,
          });
        }
      }
    }

    const nextState: KnowledgeState = {
      ...knowledgeState,
      collections: [...knowledgeState.collections],
      collectionItems: [...knowledgeState.collectionItems, ...newItems],
    };

    onApplyKnowledgeState(nextState);

    const elapsed = Math.max(1, Math.round(performance.now() - startTime));
    setTxToast({
      message: `SQLite transaction committed: ${newItems.length} relation pointers mapped across ${targetCollIds.length} collection${targetCollIds.length === 1 ? '' : 's'} in ${elapsed}ms`,
      timestamp: Date.now(),
    });

    // Clear selection after ingest
    onClearSelection();
    setTimeout(() => setTxToast(null), 5000);
  }

  // Quick helper to select or create the 'Inbox / Review Later' collection
  function selectOrCreateInboxCollection() {
    const existing = collections.find(
      (c) => c.name.toLowerCase() === 'inbox / review later' || c.name.toLowerCase() === 'review later',
    );
    if (existing) {
      setSelectedCollectionId(existing.id);
      setIngestionAction('selected');
      return;
    }
    const nextId = Math.max(0, ...collections.map((c) => c.id)) + 1;
    const inbox: KnowledgeCollection = {
      id: nextId,
      name: 'Inbox / Review Later',
      createdAt: Date.now(),
    };
    onApplyKnowledgeState({
      ...knowledgeState,
      collections: [inbox, ...collections],
    });
    setSelectedCollectionId(nextId);
    setIngestionAction('selected');
  }

  const isIngestionActive = selectedTargets.length > 0;

  return (
    <section className={`workspace-canvas-bottom-section ${viewMode}`}>
      {/* Sweeping Header / Command Center Toolbar */}
      <div className="matrix-header">
        <div className="matrix-header-title">
          <FolderKanban size={17} />
          <span>Workspace Canvas & Collections Manager</span>
          <span className="matrix-badge">Many-to-Many Relational Matrix</span>
        </div>

        <div className="matrix-header-tools">
          {/* Typography Tester Bar: IBM Plex / Inter / Source Sans 3 */}
          <div className="typography-switcher-pills" title="Test typography font pairings">
            <span className="typography-switcher-label">
              <Type size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
              Typography:
            </span>
            {TYPOGRAPHY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`typography-btn ${activeTypography === opt.id ? 'active' : ''}`}
                onClick={() => onChangeTypography(opt.id)}
                title={`Sans: ${opt.sans} | Mono: ${opt.mono}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* View mode toggles */}
          {onChangeViewMode ? (
            <div className="button-group" style={{ display: 'inline-flex', gap: 3 }}>
              {viewMode === 'minimized' ? (
                <button
                  type="button"
                  className="toolbar-button"
                  onClick={() => onChangeViewMode('docked')}
                  title="Expand Relational Matrix"
                  style={{ padding: '3px 8px', fontSize: 11 }}
                >
                  <ChevronUp size={13} />
                  Restore
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={`toolbar-button ${viewMode === 'docked' ? 'active' : ''}`}
                    onClick={() => onChangeViewMode('docked')}
                    title="Docked view"
                    style={{ padding: '3px 8px', fontSize: 11 }}
                  >
                    Dock
                  </button>
                  <button
                    type="button"
                    className={`toolbar-button ${viewMode === 'expanded' ? 'active' : ''}`}
                    onClick={() => onChangeViewMode('expanded')}
                    title="Expanded view"
                    style={{ padding: '3px 8px', fontSize: 11 }}
                  >
                    Expand
                  </button>
                  <button
                    type="button"
                    className={`toolbar-button ${viewMode === 'fullscreen' ? 'active' : ''}`}
                    onClick={() => onChangeViewMode(viewMode === 'fullscreen' ? 'docked' : 'fullscreen')}
                    title="Fullscreen view"
                    style={{ padding: '3px 8px', fontSize: 11 }}
                  >
                    <Maximize2 size={13} />
                  </button>
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={() => onChangeViewMode('minimized')}
                    title="Minimize bottom bar"
                    style={{ padding: '3px 8px', fontSize: 11 }}
                  >
                    <ChevronDown size={13} />
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {viewMode === 'minimized' ? null : (
        <div className="matrix-three-columns">
          {/* =========================================================================
              COLUMN 1: MY COLLECTIONS (Directory)
             ========================================================================= */}
          <div className="matrix-column">
            <div className="matrix-column-head">
              <div className="matrix-column-title-row">
                <span className="matrix-column-title">
                  <FolderKanban size={14} />
                  <span>COL 1: MY COLLECTIONS (Directory)</span>
                </span>
                <span style={{ fontSize: 11, color: 'var(--crystal-muted)' }}>
                  <strong>{filteredCollections.length}</strong> collections
                </span>
              </div>

              {/* Filter collections input */}
              <div className="matrix-search-input-wrap">
                <Search size={13} className="matrix-search-icon" />
                <input
                  type="text"
                  value={collectionFilter}
                  onChange={(e) => setCollectionFilter(e.target.value)}
                  placeholder={`Filter ${collections.length} collections...`}
                />
                {collectionFilter ? (
                  <button
                    type="button"
                    className="matrix-search-clear"
                    onClick={() => setCollectionFilter('')}
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>

              {/* Multi-Target Check All & Ingestion mode banner */}
              {isIngestionActive || checkedCollectionIds.size > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    background: 'color-mix(in srgb, var(--crystal-primary) 15%, transparent)',
                    padding: '3px 7px',
                    borderRadius: 4,
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        checkedCollectionIds.size > 0 &&
                        checkedCollectionIds.size === filteredCollections.length
                      }
                      onChange={toggleCheckAllCollections}
                      style={{ margin: 0 }}
                    />
                    <span>Multi-Target Selection</span>
                  </label>
                  <span style={{ color: 'var(--crystal-primary)', fontWeight: 700 }}>
                    {checkedCollectionIds.size} checked
                  </span>
                </div>
              ) : null}
            </div>

            {/* Scrollable Collection List */}
            <div className="matrix-column-scroll" role="list" aria-label="Collections directory">
              {filteredCollections.map((coll) => {
                const count = collectionCounts.get(coll.id) || 0;
                const isActive = activeCollection?.id === coll.id;
                const isChecked = checkedCollectionIds.has(coll.id);

                return (
                  <div
                    key={coll.id}
                    className={`matrix-row ${isActive ? 'active' : ''}`}
                    onClick={() => setSelectedCollectionId(coll.id)}
                    role="listitem"
                  >
                    {/* Multi-Target Checkbox */}
                    <div
                      className="matrix-checkbox-cell"
                      onClick={(e) => toggleCheckCollection(coll.id, e)}
                      title="Check to include in multi-target batch linking"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        aria-label={`Select ${coll.name} for ingestion`}
                      />
                    </div>

                    <span style={{ fontSize: 13, flexShrink: 0 }}>📁</span>
                    <span className="matrix-folder-name" title={coll.name}>
                      {coll.name}
                    </span>
                    <span className="matrix-dots-spacer" aria-hidden="true" />
                    <span className="matrix-ptrs-count">({count.toLocaleString()} ptrs)</span>
                  </div>
                );
              })}

              {!filteredCollections.length ? (
                <div style={{ padding: '16px 10px', textAlign: 'center', color: 'var(--crystal-muted)', fontSize: 12 }}>
                  No collections match &quot;{collectionFilter}&quot;
                </div>
              ) : null}
            </div>

            {/* Column 1 Footer: Quick Add New Collection */}
            <div
              style={{
                padding: '6px 10px',
                borderTop: '1px solid var(--crystal-border)',
                background: 'var(--crystal-panel)',
              }}
            >
              {showAddCollection ? (
                <form
                  onSubmit={handleCreateCollection}
                  style={{ display: 'flex', gap: 5, alignItems: 'center' }}
                >
                  <input
                    type="text"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="New collection name..."
                    autoFocus
                    style={{
                      flex: 1,
                      height: 26,
                      fontSize: 12,
                      padding: '2px 7px',
                      background: 'var(--crystal-input-bg)',
                      border: '1px solid var(--crystal-border)',
                      borderRadius: 4,
                      color: 'var(--crystal-foreground)',
                    }}
                  />
                  <button
                    type="submit"
                    className="toolbar-button active"
                    style={{ padding: '2px 8px', height: 26, fontSize: 11 }}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    className="icon-only"
                    onClick={() => {
                      setShowAddCollection(false);
                      setNewCollectionName('');
                    }}
                    style={{ height: 26, width: 26 }}
                  >
                    <X size={13} />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="toolbar-button"
                  onClick={() => setShowAddCollection(true)}
                  style={{ width: '100%', fontSize: 11, justifyContent: 'center', height: 26 }}
                >
                  <Plus size={13} />
                  New Collection
                </button>
              )}
            </div>
          </div>

          {/* =========================================================================
              COLUMN 2: INSIDE SELECTED COLLECTION
             ========================================================================= */}
          <div className="matrix-column">
            <div className="matrix-column-head">
              <div className="matrix-column-title-row">
                <span className="matrix-column-title">
                  <span>📁</span>
                  <strong>{activeCollection?.name || 'No Collection Selected'}</strong>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--crystal-muted)' }}>
                  <span>
                    <strong>{itemsInActiveCollection.length}</strong> pointers
                  </span>
                  {onExportBundle && activeCollection && itemsInActiveCollection.length > 0 ? (
                    <button
                      type="button"
                      className="toolbar-button"
                      onClick={() => onExportBundle(activeCollection.name, itemsInActiveCollection, true)}
                      title={`Export "${activeCollection.name}" (${itemsInActiveCollection.length} items) as a portable recovery bundle`}
                      style={{ padding: '1px 7px', fontSize: 10, minHeight: 22 }}
                    >
                      <Download size={11} />
                      Export Bundle
                    </button>
                  ) : null}
                </span>
              </div>

              {/* Search pointers inside & Type filter chips */}
              <div style={{ display: 'flex', gap: 6 }}>
                <div className="matrix-search-input-wrap" style={{ flex: 1 }}>
                  <Search size={13} className="matrix-search-icon" />
                  <input
                    type="text"
                    value={pointerSearch}
                    onChange={(e) => setPointerSearch(e.target.value)}
                    placeholder="Search pointers inside..."
                  />
                  {pointerSearch ? (
                    <button
                      type="button"
                      className="matrix-search-clear"
                      onClick={() => setPointerSearch('')}
                    >
                      <X size={12} />
                    </button>
                  ) : null}
                </div>

                {/* Filter chips */}
                <div style={{ display: 'flex', gap: 2 }}>
                  {['all', 'asset', 'document', 'code', 'link', 'conversation'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setActiveTypeFilter(type)}
                      className={`filter-chip ${activeTypeFilter === type ? 'active' : ''}`}
                      style={{
                        padding: '2px 6px',
                        fontSize: 10,
                        height: 28,
                        borderRadius: 4,
                      }}
                      title={`Filter by ${type}`}
                    >
                      {type === 'all'
                        ? 'All'
                        : type === 'asset'
                        ? '🖼️'
                        : type === 'document'
                        ? '📄'
                        : type === 'code'
                        ? '💻'
                        : type === 'link'
                        ? '🔗'
                        : '💬'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* High-density Single-Line Rows with Hover-Ready IDs & Popover Context */}
            <div
              className="matrix-column-scroll"
              role="list"
              aria-label={`Pointers in ${activeCollection?.name}`}
            >
              {filteredPointers.map((pointer) => {
                const key = targetKey(pointer);
                const resolvedTitle = displayPointerTitle(pointer);
                const sharingColls = itemToCollectionsMap.get(key) || new Set<number>();
                const linkedCount = sharingColls.size;
                const isPopoverOpen = activePopoverItemId === key;

                return (
                  <div
                    key={`${pointer.collectionId}-${key}`}
                    className="matrix-pointer-row"
                    data-item-id={pointer.targetId}
                    data-target-type={pointer.targetType}
                    onClick={() => onOpenTarget?.({ ...pointer, title: resolvedTitle })}
                    role="listitem"
                  >
                    {/* Short prefix indicator */}
                    <span className="matrix-type-icon">{getTargetPrefix(pointer.targetType)}</span>

                    {/* Truncated filename or text snippet */}
                    <span className="matrix-pointer-title" title={resolvedTitle}>
                      {resolvedTitle}
                    </span>

                    {/* Rename / Organize item */}
                    {onOrganizeTarget ? (
                      <button
                        type="button"
                        className="matrix-link-indicator"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOrganizeTarget({ ...pointer, title: resolvedTitle });
                        }}
                        title="Rename or tag this item"
                      >
                        Rename
                      </button>
                    ) : null}

                    {/* Direct jump to source conversation message */}
                    {onOpenTargetSource ? (
                      <button
                        type="button"
                        className="matrix-link-indicator"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTargetSource({ ...pointer, title: resolvedTitle });
                        }}
                        title="Jump to source conversation and message"
                      >
                        <ArrowUpRight size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> Source
                      </button>
                    ) : null}

                    {/* Instant Many-to-Many Context: [→ Linked in N colls] */}
                    <button
                      type="button"
                      className="matrix-link-indicator"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePopoverItemId(isPopoverOpen ? null : key);
                      }}
                      title="Click to view all collections sharing this text pointer"
                    >
                      → Linked in {linkedCount} coll{linkedCount === 1 ? '' : 's'}
                    </button>

                    {/* Direct Unlink / Remove Link Button */}
                    <button
                      type="button"
                      className="matrix-unlink-btn"
                      onClick={(e) => handleUnlinkPointer(pointer, e)}
                      title="Unlink from this collection"
                    >
                      <X size={12} />
                    </button>

                    {/* Overlapping Collections Popover */}
                    {isPopoverOpen ? (
                      <div
                        className="matrix-col-popover"
                        ref={popoverRef}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <h4>Shared Across {linkedCount} Collections</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {Array.from(sharingColls).map((cId) => {
                            const collObj = collections.find((c) => c.id === cId);
                            if (!collObj) return null;
                            const isCurrent = collObj.id === activeCollection?.id;
                            return (
                              <button
                                key={cId}
                                type="button"
                                style={{
                                  fontWeight: isCurrent ? 700 : 400,
                                  color: isCurrent ? 'var(--crystal-primary)' : 'inherit',
                                }}
                                onClick={() => {
                                  setSelectedCollectionId(cId);
                                  setActivePopoverItemId(null);
                                }}
                              >
                                📁 {collObj.name} {isCurrent ? '(current)' : ''}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {!filteredPointers.length ? (
                <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--crystal-muted)', fontSize: 12 }}>
                  <p style={{ margin: '0 0 6px 0' }}>No pointers in this collection matching your filter.</p>
                  <small style={{ color: 'var(--crystal-muted)' }}>
                    Check items above or select from Column 3 to link them here.
                  </small>
                </div>
              ) : null}
            </div>

            {/* Column 2 Footer: Live Relationship Metrics */}
            <div
              style={{
                padding: '6px 12px',
                borderTop: '1px solid var(--crystal-border)',
                background: 'var(--crystal-panel)',
                fontSize: 11,
                color: 'var(--crystal-muted)',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>Density: {filteredPointers.length} 1-line rows active</span>
              <span>Hover-ready target IDs enabled</span>
            </div>
          </div>

          {/* =========================================================================
              COLUMN 3: BATCH CHECKBOX INGESTION
             ========================================================================= */}
          <div className="matrix-column">
            <div className="matrix-column-head">
              <div className="matrix-column-title-row">
                <span className="matrix-column-title">
                  <Database size={14} />
                  <span>COL 3: BATCH CHECKBOX INGESTION</span>
                </span>
                {selectedTargets.length > 0 ? (
                  <span style={{ display: 'inline-flex', gap: 5 }}>
                    {onExportBundle ? (
                      <button
                        type="button"
                        className="toolbar-button"
                        onClick={() => onExportBundle('Selected-Batch', selectedTargets, true)}
                        title="Export selected queue as a portable recovery bundle"
                        style={{ padding: '2px 6px', fontSize: 10, minHeight: 22 }}
                      >
                        <Download size={11} />
                        Export Queue
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="toolbar-button"
                      onClick={onClearSelection}
                      style={{ padding: '2px 6px', fontSize: 10, minHeight: 22 }}
                    >
                      Clear queue
                    </button>
                  </span>
                ) : null}
              </div>

              {/* Status Header: [✓] N items selected from Library */}
              <div className={`matrix-ingestion-status ${isIngestionActive ? 'active' : ''}`}>
                <span>
                  {isIngestionActive ? <Check size={14} style={{ display: 'inline', marginRight: 5 }} /> : null}
                  <strong>{selectedTargets.length}</strong> items selected from Library
                </span>
                <span style={{ fontSize: 10, color: 'var(--crystal-muted)' }}>Text pointers</span>
              </div>
            </div>

            {/* Ingestion Command Body */}
            <div className="matrix-ingestion-container">
              {/* Queue Preview or Quick Demonstration Sampling */}
              {selectedTargets.length > 0 ? (
                <div className="matrix-ingestion-queue" role="list">
                  {selectedTargets.map((item) => (
                    <div key={targetKey(item)} className="matrix-queue-item" role="listitem">
                      <span>{getTargetPrefix(item.targetType)}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {displayPointerTitle(item)}
                      </span>
                      <button
                        type="button"
                        className="matrix-unlink-btn"
                        style={{ opacity: 1 }}
                        onClick={() =>
                          onSelectTargets((prev) => prev.filter((p) => targetKey(p) !== targetKey(item)))
                        }
                        title="Remove from queue"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px dashed var(--crystal-border)',
                    fontSize: 11,
                    color: 'var(--crystal-muted)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <span>
                    Check any code snippet, document, image, link, or filtered conversation search result above to stage items here.
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <button
                      type="button"
                      className="filter-chip active"
                      onClick={selectOrCreateInboxCollection}
                      style={{ fontSize: 10, padding: '2px 8px' }}
                      title="Select or create a zero-friction Inbox / Review Later collection"
                    >
                      📥 Target &quot;Inbox / Review Later&quot;
                    </button>
                  </div>
                </div>
              )}

              {/* ACTION Radio Group */}
              <div className="matrix-action-group">
                <span className="matrix-action-label">ACTION:</span>

                {/* Option 1: Link to Selected Collection */}
                <label className="matrix-radio-item">
                  <input
                    type="radio"
                    name="ingestionAction"
                    value="selected"
                    checked={ingestionAction === 'selected'}
                    onChange={() => setIngestionAction('selected')}
                  />
                  <span>
                    Link to Selected Collection (
                    <strong>{activeCollection?.name || 'None'}</strong>)
                  </span>
                </label>

                {/* Option 2: Link to Multiple Checked Collections */}
                <label className="matrix-radio-item">
                  <input
                    type="radio"
                    name="ingestionAction"
                    value="multiple"
                    checked={ingestionAction === 'multiple'}
                    onChange={() => setIngestionAction('multiple')}
                  />
                  <span>
                    Link to Multiple Checked Collections (
                    <strong style={{ color: checkedCollectionIds.size > 0 ? 'var(--crystal-primary)' : 'inherit' }}>
                      {checkedCollectionIds.size} checked
                    </strong>
                    )
                  </span>
                </label>

                {/* Option 3: Create New Collection from Selection */}
                <label className="matrix-radio-item">
                  <input
                    type="radio"
                    name="ingestionAction"
                    value="new"
                    checked={ingestionAction === 'new'}
                    onChange={() => setIngestionAction('new')}
                  />
                  <span>Create New Collection from Selection</span>
                </label>

                {ingestionAction === 'new' ? (
                  <input
                    type="text"
                    className="matrix-new-collection-input"
                    value={newTargetCollectionName}
                    onChange={(e) => setNewTargetCollectionName(e.target.value)}
                    placeholder="Enter new collection title..."
                    autoFocus
                  />
                ) : null}
              </div>

              {/* Action Button: [ 🚀 EXECUTE DATABASE RELATIONS ] */}
              <div style={{ marginTop: 'auto', paddingTop: 6 }}>
                <button
                  type="button"
                  className="matrix-execute-btn"
                  onClick={handleExecuteRelations}
                  disabled={
                    selectedTargets.length === 0 ||
                    (ingestionAction === 'multiple' && checkedCollectionIds.size === 0) ||
                    (ingestionAction === 'new' && !newTargetCollectionName.trim())
                  }
                >
                  <span>🚀</span>
                  <span>EXECUTE DATABASE RELATIONS</span>
                </button>
              </div>

              {/* Transaction Committed Toast */}
              {txToast ? (
                <div className="matrix-tx-toast" role="status">
                  <Sparkles size={14} style={{ color: 'var(--crystal-success)' }} />
                  <span>{txToast.message}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
