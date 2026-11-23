import { tagColor, type Folder } from '../db';

interface Props {
  view: string;
  setView: (v: string) => void;
  tag: string | null;
  setTag: (t: string | null) => void;
  folders: Folder[];
  counts: { all: number; none: number; trash: number; byFolder: Map<string, number> };
  tags: [string, number][];
  onManageFolders: () => void;
  onSettings: () => void;
  onClose: () => void;
}

export function Sidebar({ view, setView, tag, setTag, folders, counts, tags, onManageFolders, onSettings, onClose }: Props) {
  const item = (id: string, icon: string, label: string, count: number) => (
    <button key={id} className={`side-item ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>
      <span className="side-icon">{icon}</span>
      <span className="side-label">{label}</span>
      <span className="count">{count}</span>
    </button>
  );

  return (
    <aside className="sidebar">
      <div className="side-brand">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={26} height={26} />
        <span>Saved</span>
        <button className="icon-btn small side-close" onClick={onClose} aria-label="Сховати меню">✕</button>
      </div>

      <nav className="side-group">
        {item('all', '🔖', 'Усі закладки', counts.all)}
        {item('none', '📄', 'Без папки', counts.none)}
        {item('trash', '🗑', 'Кошик', counts.trash)}
      </nav>

      <div className="side-group">
        <div className="side-title">
          <span>Папки</span>
          <button className="icon-btn small" onClick={onManageFolders} aria-label="Керувати папками">＋</button>
        </div>
        {folders.map((f) => item(f.id, f.icon ?? '📁', f.name, counts.byFolder.get(f.id) ?? 0))}
        {folders.length === 0 && (
          <button className="side-empty" onClick={onManageFolders}>Створити першу папку</button>
        )}
      </div>

      {tags.length > 0 && (
        <div className="side-group">
          <div className="side-title"><span>Теги</span></div>
          {tags.map(([t, n]) => (
            <button key={t} className={`side-item ${tag === t ? 'active' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
              <span className="side-icon hash" style={{ color: tagColor(t) }}>#</span>
              <span className="side-label">{t}</span>
              <span className="count">{n}</span>
            </button>
          ))}
        </div>
      )}

      <div className="side-bottom">
        <button className="side-item" onClick={onSettings}>
          <span className="side-icon">⚙</span>
          <span className="side-label">Налаштування</span>
        </button>
      </div>
    </aside>
  );
}
