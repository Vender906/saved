import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Item } from './db';
import { extractUrl, PLATFORM_ORDER, PLATFORMS, type Platform } from './platforms';
import { matches } from './search';
import { ItemCard, estimateCard } from './components/ItemCard';
import { ItemDialog } from './components/ItemDialog';
import { FoldersDialog } from './components/FoldersDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { Sidebar } from './components/Sidebar';
import { Masonry } from './components/Masonry';

type DialogState =
  | { type: 'add'; url?: string }
  | { type: 'edit'; item: Item }
  | { type: 'folders' }
  | { type: 'settings' }
  | null;

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

const readPref = (k: string) => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const writePref = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch { /* приватний режим */ }
};

export default function App() {
  const items = useLiveQuery(() => db.items.orderBy('createdAt').reverse().toArray(), []);
  const folders = useLiveQuery(() => db.folders.orderBy('createdAt').toArray(), []) ?? [];

  /** 'all' | 'none' | 'trash' | id папки */
  const [view, setViewRaw] = useState('all');
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [tag, setTagRaw] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const isMobile = useMediaQuery('(max-width: 900px)');
  const [deskSidebar, setDeskSidebar] = useState(() => readPref('sidebar') !== '0');
  const [drawer, setDrawer] = useState(false);
  const sidebarOpen = isMobile ? drawer : deskSidebar;
  const toggleSidebar = () => {
    if (isMobile) setDrawer((d) => !d);
    else setDeskSidebar((s) => { writePref('sidebar', s ? '0' : '1'); return !s; });
  };

  const setView = (v: string) => {
    setViewRaw(v);
    setDrawer(false);
    window.scrollTo({ top: 0 });
  };
  const setTag = (t: string | null) => {
    setTagRaw(t);
    setDrawer(false);
  };

  // Посилання, яким поділились (Android share target, кнопка-закладка на комп'ютері)
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const parts = [p.get('url'), p.get('text'), p.get('title')].filter(Boolean).join(' ');
    if (!parts) return;
    history.replaceState(null, '', location.pathname);
    setDialog({ type: 'add', url: extractUrl(parts) ?? parts });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // «/» — швидкий пошук на комп'ютері
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !dialog && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setSearchOpen(true);
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

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
  const usedPlatforms = useMemo(() => {
    const s = new Set(inView.map((i) => i.platform));
    return PLATFORM_ORDER.filter((p) => s.has(p));
  }, [inView]);

  const filtered = useMemo(
    () =>
      inView.filter(
        (i) => (!platform || i.platform === platform) && (!tag || i.tags.includes(tag)) && matches(i, query, folderName),
      ),
    [inView, platform, tag, query, folderName],
  );

  // Якщо вибрану папку видалили — повертаємось до «Усі закладки»
  useEffect(() => {
    if (!['all', 'none', 'trash'].includes(view) && !folderMap.has(view)) setViewRaw('all');
  }, [view, folderMap]);

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
    setToast('Кошик очищено');
  }

  const closeDialog = useCallback(() => setDialog(null), []);
  const onSaved = useCallback((msg: string) => {
    setDialog(null);
    setToast(msg);
  }, []);

  const viewTitle =
    view === 'all' ? 'Усі закладки'
      : view === 'none' ? 'Без папки'
        : view === 'trash' ? 'Кошик'
          : `${folderMap.get(view)?.icon ?? '📁'} ${folderMap.get(view)?.name ?? ''}`;
  const hasFilters = !!(platform || tag || query.trim());

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
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

        {(usedPlatforms.length > 1 || tag) && (
          <div className="chips">
            {tag && (
              <button className="chip active" onClick={() => setTag(null)}>#{tag} ✕</button>
            )}
            {usedPlatforms.length > 1 &&
              usedPlatforms.map((p) => (
                <button key={p} className={`chip ${platform === p ? 'active' : ''}`} onClick={() => setPlatform(platform === p ? null : p)}>
                  <i className="dot" style={{ background: PLATFORMS[p].color }} /> {PLATFORMS[p].label}
                </button>
              ))}
          </div>
        )}

        <main className="content">
          {items === undefined ? null : filtered.length > 0 ? (
            <Masonry
              items={filtered}
              getKey={(i) => i.id}
              estimate={estimateCard}
              minColumn={isMobile ? 300 : 240}
              render={(i) => (
                <ItemCard
                  item={i}
                  folder={i.folderId ? folderMap.get(i.folderId) : undefined}
                  query={query}
                  onEdit={() => setDialog({ type: 'edit', item: i })}
                  onTag={setTag}
                  onMessage={setToast}
                />
              )}
            />
          ) : hasFilters ? (
            <div className="empty">
              <p>Нічого не знайдено 🤷</p>
              <button className="btn" onClick={() => { setQuery(''); setTag(null); setPlatform(null); }}>Скинути фільтри</button>
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
      {dialog?.type === 'folders' && <FoldersDialog folders={folders} counts={counts.byFolder} onClose={closeDialog} />}
      {dialog?.type === 'settings' && (
        <SettingsDialog itemCount={active.length} folderCount={folders.length} onClose={closeDialog} onMessage={setToast} />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
