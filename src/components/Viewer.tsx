import { useEffect } from 'react';
import { avatarColor, db, markViewed, tagColor, type Folder, type Item } from '../db';
import { embedFor } from '../embed';
import { PLATFORMS, prettyUrl } from '../platforms';
import { captionOf, mediaRatio } from './ItemCard';

interface Props {
  item: Item;
  folder?: Folder;
  /** Режим «Випадкове»: показуємо кнопку «Ще одне» */
  onNext?: () => void;
  onEdit: () => void;
  onClose: () => void;
}

/** Перегляд поста всередині застосунку: плеєр (де соцмережа дозволяє) + повний підпис. */
export function Viewer({ item, folder, onNext, onEdit, onClose }: Props) {
  const p = PLATFORMS[item.platform];
  const embed = embedFor(item);
  const author = item.author || p.label;
  const src = item.thumb ?? item.image;

  useEffect(() => {
    void markViewed(item.id);
  }, [item.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.key === 'ArrowRight' || e.key === ' ') && onNext && document.activeElement?.tagName !== 'IFRAME') {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, onNext]);

  return (
    <div className="overlay viewer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="viewer" role="dialog" aria-modal="true" aria-label={item.title}>
        <button className="icon-btn viewer-close" onClick={onClose} aria-label="Закрити">✕</button>

        <div className="viewer-media">
          {embed ? (
            <div className="viewer-frame" style={{ ['--ratio' as string]: embed.ratio }}>
              <iframe
                key={item.id}
                src={embed.src}
                title={item.title}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          ) : src ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="viewer-still" style={{ ['--ratio' as string]: mediaRatio(item) }}>
              <img src={src} alt="" referrerPolicy="no-referrer" />
              <span className="viewer-still-hint">Відкрити в {p.label} ↗</span>
            </a>
          ) : (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="viewer-empty" style={{ background: p.color }}>
              {p.label} ↗
            </a>
          )}
        </div>

        <aside className="viewer-info">
          <header className="card-head">
            <div className="avatar" style={{ background: avatarColor(author) }}>
              {author.replace(/^@/, '').charAt(0).toUpperCase()}
              <span className="avatar-platform" style={{ background: p.color }} />
            </div>
            <div className="who">
              <div className="author">{author}</div>
              <div className="date">{prettyUrl(item.url)}</div>
            </div>
          </header>

          <div className="viewer-caption">{captionOf(item) || prettyUrl(item.url)}</div>
          {item.note && <div className="note">{item.note}</div>}

          <div className="card-foot">
            <span className="folder-label">
              {folder ? <>{folder.icon ?? '📁'} {folder.name}</> : <span className="muted">Без папки</span>}
            </span>
            {item.tags.map((t) => (
              <span key={t} className="tag-link" style={{ color: tagColor(t) }}>#{t}</span>
            ))}
          </div>

          <div className="viewer-actions">
            <a className="btn primary" href={item.url} target="_blank" rel="noopener noreferrer">Відкрити в {p.label} ↗</a>
            <button className="btn" onClick={onEdit}>✎ Редагувати</button>
            <button className="btn ghost" onClick={() => db.items.update(item.id, { viewedAt: undefined }).then(onClose)}>
              Позначити непереглянутим
            </button>
          </div>

          {onNext && (
            <button className="btn random-next" onClick={onNext}>🎲 Ще одне випадкове</button>
          )}
        </aside>
      </div>
    </div>
  );
}
