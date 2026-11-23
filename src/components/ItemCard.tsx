import { useLayoutEffect, useRef, useState } from 'react';
import { avatarColor, moveToTrash, restoreFromTrash, db, tagColor, type Folder, type Item } from '../db';
import { PLATFORMS, prettyUrl } from '../platforms';
import { Highlight } from './Highlight';
import { Menu, type MenuAction } from './Menu';

interface Props {
  item: Item;
  folder?: Folder;
  query: string;
  onEdit: () => void;
  onTag: (tag: string) => void;
  onMessage: (msg: string) => void;
}

const fmtDate = new Intl.DateTimeFormat('uk', { day: 'numeric', month: 'long', year: 'numeric' });

/** Пропорція превʼю (висота / ширина) — залежить від платформи. */
export function mediaRatio(item: Item): number {
  const path = (() => {
    try { return new URL(item.url).pathname; } catch { return ''; }
  })();
  switch (item.platform) {
    case 'tiktok': return 1.5;
    case 'youtube': return path.startsWith('/shorts/') ? 1.5 : 0.5625;
    case 'instagram': return /^\/(reels?|tv)\//.test(path) ? 1.5 : 1.25;
    case 'pinterest': return 1.4;
    default: return 0.56;
  }
}

export function isVideo(item: Item): boolean {
  if (item.platform === 'tiktok' || item.platform === 'youtube') return true;
  return /\/(reels?|tv|watch|video)\//.test(item.url) || item.url.includes('fb.watch');
}

export function captionOf(item: Item): string {
  const t = item.title?.trim() ?? '';
  const d = item.description?.trim() ?? '';
  if (!d || t.includes(d) || d.includes(t)) return d.length > t.length ? d : t;
  return `${t}\n\n${d}`;
}

/** Оцінка висоти картки для розкладки по колонках. */
export function estimateCard(item: Item, colWidth: number): number {
  const text = captionOf(item);
  const lines = Math.min(4, Math.ceil((text.length * 7.2) / Math.max(colWidth - 28, 100)));
  const media = item.image || item.thumb ? colWidth * mediaRatio(item) : 44;
  return 58 + lines * 19 + (text.length > 160 ? 28 : 0) + (item.note ? 46 : 0) + media + 40;
}

export function ItemCard({ item, folder, query, onEdit, onTag, onMessage }: Props) {
  const p = PLATFORMS[item.platform];
  const author = item.author || p.label;
  const caption = captionOf(item) || prettyUrl(item.url);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const captionRef = useRef<HTMLDivElement>(null);
  const src = item.thumb ?? item.image;

  useLayoutEffect(() => {
    const el = captionRef.current;
    if (el && !expanded) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [caption, expanded]);

  const actions: MenuAction[] = item.deletedAt
    ? [
        { label: '↩ Відновити', onClick: async () => { await restoreFromTrash(item.id); onMessage('Відновлено'); } },
        {
          label: '✕ Видалити назавжди',
          danger: true,
          onClick: async () => {
            if (confirm('Видалити назавжди? Це не можна скасувати.')) await db.items.delete(item.id);
          },
        },
      ]
    : [
        { label: '✎ Редагувати', onClick: onEdit },
        { label: '↗ Відкрити', onClick: () => window.open(item.url, '_blank', 'noopener') },
        {
          label: '⧉ Копіювати посилання',
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(item.url);
              onMessage('Посилання скопійовано');
            } catch { /* немає доступу */ }
          },
        },
        { label: '🗑 У кошик', danger: true, onClick: async () => { await moveToTrash(item.id); onMessage('Переміщено в кошик'); } },
      ];

  return (
    <article className="card">
      <header className="card-head">
        <div className="avatar" style={{ background: avatarColor(author) }}>
          {author.replace(/^@/, '').charAt(0).toUpperCase()}
          <span className="avatar-platform" style={{ background: p.color }} title={p.label} />
        </div>
        <div className="who">
          <div className="author"><Highlight text={author} query={query} /></div>
          <div className="date">{fmtDate.format(item.createdAt)}</div>
        </div>
        <Menu actions={actions} />
      </header>

      <div ref={captionRef} className={`caption ${expanded ? 'open' : ''}`}>
        <Highlight text={caption} query={query} />
      </div>
      {(clamped || expanded) && (
        <button className="read-more" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Згорнути' : 'Читати все'}
        </button>
      )}

      {item.note && (
        <div className="note"><Highlight text={item.note} query={query} /></div>
      )}

      <a className="media" href={item.url} target="_blank" rel="noopener noreferrer">
        {src && !imgFailed ? (
          <div
            className="media-box"
            style={{ aspectRatio: `1 / ${mediaRatio(item)}`, ['--ratio' as string]: mediaRatio(item) }}
          >
            <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
            {isVideo(item) && <span className="play" aria-hidden>▶</span>}
            <span className="media-platform">{p.label}</span>
          </div>
        ) : (
          <div className="link-box" style={{ borderColor: p.color }}>
            <span className="badge" style={{ background: p.color }}>{p.label}</span>
            <span className="link-host">{prettyUrl(item.url)}</span>
          </div>
        )}
      </a>

      <footer className="card-foot">
        <span className="folder-label">
          {folder ? <>{folder.icon ?? '📁'} {folder.name}</> : <span className="muted">Без папки</span>}
        </span>
        {item.tags.map((t) => (
          <button key={t} className="tag-link" style={{ color: tagColor(t) }} onClick={() => onTag(t)}>#{t}</button>
        ))}
      </footer>
    </article>
  );
}
