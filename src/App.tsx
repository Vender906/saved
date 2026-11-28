import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Item } from './db';
import { extractUrl, PLATFORM_ORDER, PLATFORMS, type Platform } from './platforms';
import { matches } from './search';
import { repairPending } from './enrich';
import {
  LAYOUTS, readPref, SORT_LABELS, SORTS, STATUS_LABELS, STATUSES, writePref,
  type Layout, type Sort, type Status,
} from './prefs';
import { ItemCard, estimateCard } from './components/ItemCard';
import { ItemDialog } from './components/ItemDialog';
import { FoldersDialog } from './components/FoldersDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { Sidebar } from './components/Sidebar';
import { Masonry } from './components/Masonry';
import { SelectionBar } from './components/SelectionBar';
import { Viewer } from './components/Viewer';

type DialogState =
  | { type: 'add'; url?: string }
  | { type: 'edit'; item: Item }
  | { type: 'folders'; focus?: string }
  | { type: 'settings' }
  | null;

interface Toast {
  id: number;
  msg: string;
  undo?: () => unknown;
}

function useMediaQuery(q: string) {
  const [match, setMatch] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return match;
}

/** Стан, що запамʼятовується на цьому пристрої */
function usePref<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => readPref(key, fallback, allowed));
  const set = useCallback((v: T) => {
    setValue(v);
    writePref(key, v);
  }, [key]);
  return [value, set] as const;
}

const sorters: Record<Sort, (a: Item, b: Item) => number> = {
  new: (a, b) => b.createdAt - a.createdAt,
  old: (a, b) => a.createdAt - b.createdAt,
  title: (a, b) => (a.title || a.url).localeCompare(b.title || b.url, 'uk', { sensitivity: 'base' }),
  platform: (a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform) || b.createdAt - a.createdAt,
};

export default function App() {
  const items = useLiveQuery(() => db.items.orderBy('createdAt').reverse().toArray(), []);
  const folders = useLiveQuery(() => db.folders.orderBy('createdAt').toArray(), []) ?? [];

  /** 'all' | 'none' | 'trash' | id папки */
  const [view, setViewRaw] = useState('all');
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [tag, setTagRaw] = useState<string | null>(null);
  const [status, setStatus] = usePref<Status>('status', 'all', STATUSES);
  const [sort, setSort] = usePref<Sort>('sort', 'new', SORTS);
  const [layout, setLayout] = usePref<Layout>('layout', 'grid', LAYOUTS);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [viewer, setViewer] = useState<{ id: string; random: boolean } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  const isMobile = useMediaQuery('(max-width: 900px)');
  const [deskSidebar, setDeskSidebar] = useState(() => readPref<string>('sidebar', '1') !== '0');
  const [drawer, setDrawer] = useState(false);
  const sidebarOpen = isMobile ? drawer : deskSidebar;
  const toggleSidebar = () => {
    if (isMobile) setDrawer((d) => !d);
    else setDeskSidebar((s) => { writePref('sidebar', s ? '0' : '1'); return !s; });
  };

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const setView = (v: string) => {
    setViewRaw(v);
    setPlatform(null); // у новій папці завжди починаємо з «Усі»
    setDrawer(false);
    exitSelect();
    window.scrollTo({ top: 0 });
  };
  const setTag = (t: string | null) => {
    setTagRaw(t);
    setDrawer(false);
  };

  const showToast = useCallback((msg: string, undo?: () => unknown) => {
    setToast({ id: Date.now(), msg, undo });
  }, []);

  // Посилання, яким поділились (Android share target, кнопка-закладка на комп'ютері)
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const parts = [p.get('url'), p.get('text'), p.get('title')].filter(Boolean).join(' ');
    if (!parts) return;
    history.replaceState(null, '', location.pathname);
    setDialog({ type: 'add', url: extractUrl(parts) ?? parts });
  }, []);

  // Доробляємо записи, яким не встигли підтягнутись превʼю (застосунок закрили одразу після збереження)
  useEffect(() => {
    const t = setTimeout(() => void repairPending(), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 5000 : 2200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // «/» — пошук, Esc — вийти з режиму вибору
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '');
      if (e.key === '/' && !dialog && !viewer && !typing) {
        e.preventDefault();
        setSearchOpen(true);
        searchRef.current?.focus();
      }
      if (e.key === 'Escape' && selectMode && !dialog) exitSelect();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, viewer, selectMode, exitSelect]);

  const all = items ?? [];
  const active = useMemo(() => all.filter((i) => !i.deletedAt), [all]);
  const trashed = useMemo(() => all.filter((i) => i.deletedAt), [all]);
  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const folderName = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);

  const counts = useMemo(() => {
    const byFolder = new Map<string, number>();
    let none = 0;
    for (const i of active) {
      if (i.folderId && folderMap.has(i.folderId)) byFolder.set(i.folderId, (byFolder.get(i.folderId) ?? 0) + 1);
      else none++;
    }
    return { all: active.length, none, trash: trashed.length, byFolder };
  }, [active, trashed, folderMap]);

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of active) for (const t of i.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [active]);
  const allTags = useMemo(() => tagCounts.map(([t]) => t), [tagCounts]);

  const source = view === 'trash' ? trashed : active;
  const inView = useMemo(
    () =>
      source.filter((i) =>
        view === 'all' || view === 'trash'
          ? true
          : view === 'none'
            ? !i.folderId || !folderMap.has(i.folderId)
            : i.folderId === view,
      ),
    [source, view, folderMap],
  );

  // Тег і пошук
  const searched = useMemo(
    () => inView.filter((i) => (!tag || i.tags.includes(tag)) && matches(i, query, folderName)),
    [inView, tag, query, folderName],
  );
  const statusOk = useCallback(
    (i: Item) => status === 'all' || (status === 'viewed' ? !!i.viewedAt : !i.viewedAt),
    [status],
  );

  // Вкладки соцмереж поточної папки з кількістю записів
  const platformTabs = useMemo(() => {
    const c = new Map<Platform, number>();
    let total = 0;
    for (const i of searched) {
      if (!statusOk(i)) continue;
      c.set(i.platform, (c.get(i.platform) ?? 0) + 1);
      total++;
    }
    return { total, list: PLATFORM_ORDER.filter((p) => c.has(p)).map((p) => ({ p, n: c.get(p)! })) };
  }, [searched, statusOk]);

  const unviewedCount = useMemo(
    () => searched.filter((i) => (!platform || i.platform === platform) && !i.viewedAt).length,
    [searched, platform],
  );

  // Якщо в папці не лишилось записів вибраної соцмережі — повертаємось до «Усі»
  useEffect(() => {
    if (platform && !inView.some((i) => i.platform === platform)) setPlatform(null);
  }, [platform, inView]);

  const filtered = useMemo(
    () => searched.filter((i) => (!platform || i.platform === platform) && statusOk(i)).sort(sorters[sort]),
    [searched, platform, statusOk, sort],
  );

  // Якщо вибрану папку видалили — повертаємось до «Усі закладки»
  useEffect(() => {
    if (!['all', 'none', 'trash'].includes(view) && !folderMap.has(view)) setViewRaw('all');
  }, [view, folderMap]);

  // Прибираємо з вибору те, що зникло з екрана
  useEffect(() => {
    if (!selected.size) return;
    const visible = new Set(filtered.map((i) => i.id));
    if ([...selected].some((id) => !visible.has(id))) setSelected(new Set([...selected].filter((id) => visible.has(id))));
  }, [filtered, selected]);

  async function quickAdd() {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch { /* немає доступу до буфера — просто відкриваємо форму */ }
    setDialog({ type: 'add', url: extractUrl(text) ?? '' });
  }

  async function emptyTrash() {
    if (!trashed.length || !confirm(`Видалити назавжди ${trashed.length} запис(ів) з кошика?`)) return;
    await db.items.bulkDelete(trashed.map((i) => i.id));
    showToast('Кошик очищено');
  }

  /** Випадковий пост із поточного вибору — спершу серед непереглянутих */
  const openRandom = useCallback(() => {
    const exclude = viewer?.id;
    const unviewed = filtered.filter((i) => !i.viewedAt && i.id !== exclude);
    const pool = unviewed.length ? unviewed : filtered.filter((i) => i.id !== exclude);
    if (!pool.length) {
      showToast('Немає з чого вибирати');
      return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setViewer({ id: pick.id, random: true });
  }, [filtered, viewer, showToast]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const closeDialog = useCallback(() => setDialog(null), []);
  const closeViewer = useCallback(() => setViewer(null), []);
  const onSaved = useCallback((msg: string, undo?: () => unknown) => {
    setDialog(null);
    showToast(msg, undo);
  }, [showToast]);

  const viewerItem = viewer ? all.find((i) => i.id === viewer.id) : undefined;
  const viewTitle =
    view === 'all' ? 'Усі закладки'
      : view === 'none' ? 'Без папки'
        : view === 'trash' ? 'Кошик'
          : `${folderMap.get(view)?.icon ?? '📁'} ${folderMap.get(view)?.name ?? ''}`;
  const hasFilters = !!(platform || tag || query.trim() || status !== 'all');

  const renderCard = (i: Item) => (
    <ItemCard
      item={i}
      folder={i.folderId ? folderMap.get(i.folderId) : undefined}
      query={query}
      onEdit={() => setDialog({ type: 'edit', item: i })}
      onTag={setTag}
      onMessage={showToast}
      onOpen={() => setViewer({ id: i.id, random: false })}
      selectMode={selectMode}
      selected={selected.has(i.id)}
      onToggleSelect={() => toggleSelect(i.id)}
    />
  );

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''} ${selectMode ? 'selecting' : ''}`}>
      <Sidebar
        view={view}
        setView={setView}
        tag={tag}
        setTag={setTag}
        folders={folders}
        counts={counts}
        tags={tagCounts}
        onManageFolders={() => { setDrawer(false); setDialog({ type: 'folders' }); }}
        onSettings={() => { setDrawer(false); setDialog({ type: 'settings' }); }}
        onClose={toggleSidebar}
      />
      {isMobile && drawer && <div className="scrim" onClick={() => setDrawer(false)} />}

      <div className="main">
        <header className={`topbar ${searchOpen ? 'search-open' : ''}`}>
          <button className="icon-btn" onClick={toggleSidebar} aria-label="Меню">☰</button>
          <h1 className="view-title">
            <span>{viewTitle}</span>
            <span className="count-pill">{filtered.length}</span>
            {folders.some((f) => f.id === view) && (
              <button
                className="icon-btn small title-edit"
                onClick={() => setDialog({ type: 'folders', focus: view })}
                aria-label="Змінити назву і значок папки"
                title="Змінити назву і значок"
              >✎</button>
            )}
          </h1>
          <div className="search">
            <span className="search-icon" aria-hidden>⌕</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Пошук за автором, підписом, нотатками…"
              aria-label="Пошук"
            />
            <button
              className="icon-btn small search-close"
              onClick={() => { setQuery(''); setSearchOpen(false); }}
              aria-label="Закрити пошук"
            >✕</button>
          </div>
          <div className="top-actions">
            <button className="icon-btn search-toggle" onClick={() => setSearchOpen(true)} aria-label="Пошук">⌕</button>
            {view === 'trash' ? (
              <button className="btn" onClick={emptyTrash} disabled={!trashed.length}>Очистити</button>
            ) : (
              <button className="btn primary" onClick={quickAdd}>＋<span className="btn-label"> Додати</span></button>
            )}
          </div>
        </header>

        {inView.length > 0 && (
          <div className="tabs-row">
            <div className="tabs" role="tablist" aria-label="Соцмережі">
              <button role="tab" aria-selected={!platform} className={`tab ${!platform ? 'active' : ''}`} onClick={() => setPlatform(null)}>
                Усі <span className="tab-count">{platformTabs.total}</span>
              </button>
              {platformTabs.list.map(({ p, n }) => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={platform === p}
                  className={`tab ${platform === p ? 'active' : ''}`}
                  onClick={() => setPlatform(platform === p ? null : p)}
                >
                  <i className="dot" style={{ background: PLATFORMS[p].color }} /> {PLATFORMS[p].label}
                  <span className="tab-count">{n}</span>
                </button>
              ))}
            </div>

            <div className="toolbar">
              {tag && <button className="chip active" onClick={() => setTag(null)}>#{tag} ✕</button>}
              {view !== 'trash' && (
                <label className="select-pill" title="Статус перегляду">
                  <select value={status} onChange={(e) => setStatus(e.target.value as Status)} aria-label="Статус перегляду">
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}{s === 'unviewed' ? ` (${unviewedCount})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="select-pill" title="Сортування">
                <span aria-hidden>⇅</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Сортування">
                  {SORTS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
                </select>
              </label>
              <div className="segmented" role="group" aria-label="Вигляд">
                <button className={layout === 'grid' ? 'active' : ''} onClick={() => setLayout('grid')} aria-label="Сітка" title="Сітка">▦</button>
                <button className={layout === 'list' ? 'active' : ''} onClick={() => setLayout('list')} aria-label="Список" title="Список">☰</button>
              </div>
              {view !== 'trash' && (
                <button className="btn small" onClick={openRandom} title="Відкрити випадковий непереглянутий пост">🎲 <span className="btn-label">Випадкове</span></button>
              )}
              <button
                className={`btn small ${selectMode ? 'active' : ''}`}
                onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                title="Вибрати кілька"
              >
                ☑ <span className="btn-label">{selectMode ? 'Готово' : 'Вибрати'}</span>
              </button>
            </div>
          </div>
        )}

        <main className="content">
          {items === undefined ? null : filtered.length > 0 ? (
            layout === 'grid' ? (
              <Masonry
                items={filtered}
                getKey={(i) => i.id}
                estimate={estimateCard}
                minColumn={isMobile ? 300 : 240}
                render={renderCard}
              />
            ) : (
              <div className="list">
                {filtered.map((i) => <div key={i.id}>{renderCard(i)}</div>)}
              </div>
            )
          ) : hasFilters ? (
            <div className="empty">
              <p>{status === 'unviewed' && !query && !tag ? 'Усе переглянуто 🎉' : 'Нічого не знайдено 🤷'}</p>
              <button className="btn" onClick={() => { setQuery(''); setTag(null); setPlatform(null); setStatus('all'); }}>Скинути фільтри</button>
            </div>
          ) : view === 'trash' ? (
            <div className="empty"><div className="empty-icon">🗑</div><p>Кошик порожній</p></div>
          ) : active.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🔖</div>
              <h2>Тут буде все, що ти зберігаєш</h2>
              <p>Скопіюй посилання на пост чи відео з TikTok, YouTube, Threads, Instagram і натисни «＋ Додати».</p>
              <button className="btn primary" onClick={quickAdd}>＋ Додати перше посилання</button>
              <p className="muted small">
                На Android встанови застосунок на головний екран, і Saved з'явиться в меню «Поділитися».{' '}
                <button className="link-btn" onClick={() => setDialog({ type: 'settings' })}>Детальніше</button>
              </p>
            </div>
          ) : (
            <div className="empty"><p>У цій папці поки порожньо</p></div>
          )}
        </main>
      </div>

      {selectMode && (
        <SelectionBar
          ids={[...selected]}
          total={filtered.length}
          folders={folders}
          inTrash={view === 'trash'}
          onSelectAll={() => setSelected(new Set(filtered.map((i) => i.id)))}
          onDone={(msg, undo) => {
            exitSelect();
            showToast(msg, undo);
          }}
          onCancel={exitSelect}
        />
      )}

      {viewerItem && (
        <Viewer
          item={viewerItem}
          folder={viewerItem.folderId ? folderMap.get(viewerItem.folderId) : undefined}
          onNext={viewer?.random ? openRandom : undefined}
          onEdit={() => {
            setViewer(null);
            setDialog({ type: 'edit', item: viewerItem });
          }}
          onClose={closeViewer}
        />
      )}

      {(dialog?.type === 'add' || dialog?.type === 'edit') && (
        <ItemDialog
          key={dialog.type === 'edit' ? dialog.item.id : 'add'}
          item={dialog.type === 'edit' ? dialog.item : undefined}
          initialUrl={dialog.type === 'add' ? dialog.url : undefined}
          defaultFolderId={folderMap.has(view) ? view : null}
          folders={folders}
          allTags={allTags}
          onClose={closeDialog}
          onSaved={onSaved}
          onOpenExisting={(item) => setDialog({ type: 'edit', item })}
        />
      )}
      {dialog?.type === 'folders' && <FoldersDialog folders={folders} counts={counts.byFolder} focus={dialog.focus} onClose={closeDialog} />}
      {dialog?.type === 'settings' && (
        <SettingsDialog itemCount={active.length} folderCount={folders.length} onClose={closeDialog} onMessage={showToast} />
      )}

      {toast && (
        <div className={`toast ${selectMode ? 'raised' : ''}`} role="status" key={toast.id}>
          <span>{toast.msg}</span>
          {toast.undo && (
            <button
              className="toast-undo"
              onClick={async () => {
                const undo = toast.undo!;
                setToast(null);
                await undo();
                showToast('Скасовано');
              }}
            >
              Скасувати
            </button>
          )}
        </div>
      )}
    </div>
  );
}
