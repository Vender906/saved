import { useEffect, useMemo, useRef, useState } from 'react';
import { createFolder, db, moveToTrash, requestPersist, restoreFromTrash, uid, type Folder, type Item } from '../db';
import { fetchMeta, type Meta } from '../metadata';
import { enrichItem } from '../enrich';
import { cleanUrl, detectPlatform, extractUrl, PLATFORMS, prettyUrl } from '../platforms';
import { Modal } from './Modal';
import { TagInput } from './TagInput';
import { Thumb } from './Thumb';

interface Props {
  item?: Item;
  initialUrl?: string;
  defaultFolderId?: string | null;
  folders: Folder[];
  allTags: string[];
  onClose: () => void;
  onSaved: (message: string) => void;
  onOpenExisting: (item: Item) => void;
}

const NEW_FOLDER = '__new__';

export function ItemDialog({ item, initialUrl, defaultFolderId, folders, allTags, onClose, onSaved, onOpenExisting }: Props) {
  const editing = !!item;
  const [url, setUrl] = useState(item?.url ?? initialUrl ?? '');
  const [title, setTitle] = useState(item?.title ?? '');
  const titleTouched = useRef(editing);
  const fetchNow = useRef(!!initialUrl);
  const [meta, setMeta] = useState<Meta | null>(
    item ? { platform: item.platform, title: item.title, description: item.description, image: item.thumb ?? item.image, author: item.author } : null,
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(item ? item.folderId : defaultFolderId ?? null);
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>(item?.tags ?? []);
  const [note, setNote] = useState(item?.note ?? '');
  const [duplicate, setDuplicate] = useState<Item | null>(null);

  const cleaned = useMemo(() => {
    const u = extractUrl(url);
    return u ? cleanUrl(u) : null;
  }, [url]);

  // Підтягуємо превʼю, коли вставили посилання
  useEffect(() => {
    if (editing) return;
    if (!cleaned) {
      setLoading(false);
      setMeta(null);
      setDuplicate(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // Вставлене посилання вантажимо одразу, а набране вручну — після короткої паузи
    const delay = fetchNow.current ? 0 : 400;
    fetchNow.current = false;
    const timer = setTimeout(() => {
      db.items.where('url').equals(cleaned).first().then((dup) => {
        if (!cancelled) setDuplicate(dup ?? null);
      });
      fetchMeta(cleaned)
        .then((m) => {
          if (cancelled) return;
          setMeta(m);
          if (!titleTouched.current) setTitle(m.title ?? '');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cleaned, editing]);

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        fetchNow.current = true;
        setUrl(extractUrl(text) ?? text);
      }
    } catch {
      alert('Не вдалося прочитати буфер обміну. Встав посилання вручну.');
    }
  }

  async function save() {
    if (!cleaned || saving) return;
    setSaving(true);
    try {
      let fid = folderId;
      if (newFolderName !== null) fid = newFolderName.trim() ? await createFolder(newFolderName) : null;
      const now = Date.now();
      const platform = meta?.platform ?? detectPlatform(cleaned);
      const finalTitle = title.trim() || meta?.title || prettyUrl(cleaned);
      const cleanNote = note.trim() || undefined;

      if (item) {
        await db.items.update(item.id, { title: finalTitle, folderId: fid, tags, note: cleanNote, updatedAt: now });
        onSaved('Зміни збережено');
      } else {
        // Зберігаємо одразу з тим, що вже є; превʼю й решта даних догружаються у фоні
        const id = uid();
        await db.items.add({
          id,
          url: cleaned,
          title: finalTitle,
          description: meta?.description,
          image: meta?.image,
          author: meta?.author,
          platform,
          folderId: fid,
          tags,
          note: cleanNote,
          createdAt: now,
          updatedAt: now,
        });
        void requestPersist();
        void enrichItem(id, cleaned, titleTouched.current && !!title.trim());
        onSaved('Збережено');
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!item) return;
    await moveToTrash(item.id);
    onSaved('Переміщено в кошик');
  }

  async function restoreDuplicate() {
    if (!duplicate) return;
    await restoreFromTrash(duplicate.id);
    onSaved('Відновлено з кошика');
  }

  const platform = meta?.platform ?? (cleaned ? detectPlatform(cleaned) : 'web');

  return (
    <Modal
      title={editing ? 'Редагувати' : 'Зберегти посилання'}
      onClose={onClose}
      footer={
        <>
          {editing && !item.deletedAt && <button className="btn danger ghost" onClick={remove}>У кошик</button>}
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>Скасувати</button>
          <button className="btn primary" onClick={save} disabled={!cleaned || saving}>
            {saving ? 'Зберігаю…' : 'Зберегти'}
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save();
        }}
      >
        {editing ? (
          <a className="url-readonly" href={item.url} target="_blank" rel="noopener noreferrer">{prettyUrl(item.url)} ↗</a>
        ) : (
          <label className="field">
            <span>Посилання</span>
            <div className="row">
              <input
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onPaste={() => { fetchNow.current = true; }}
                placeholder="https://www.tiktok.com/@…"
                autoFocus={!url}
              />
              <button type="button" className="btn" onClick={pasteFromClipboard}>Вставити</button>
            </div>
          </label>
        )}

        {duplicate && (
          <div className="notice">
            {duplicate.deletedAt ? (
              <>
                Це посилання лежить у кошику.{' '}
                <button type="button" className="link-btn" onClick={restoreDuplicate}>Відновити</button>
              </>
            ) : (
              <>
                Це посилання вже збережене.{' '}
                <button type="button" className="link-btn" onClick={() => onOpenExisting(duplicate)}>Відкрити запис</button>
              </>
            )}
          </div>
        )}

        {(cleaned || editing) && (
          <div className="preview">
            <Thumb key={meta?.image ?? 'none'} src={meta?.image} platform={platform} className="preview-thumb" />
            <div className="preview-info">
              <span className="badge" style={{ background: PLATFORMS[platform].color }}>{PLATFORMS[platform].label}</span>
              {loading && <span className="muted"> завантажую превʼю…</span>}
              {meta?.author && <div className="muted">{meta.author}</div>}
            </div>
          </div>
        )}

        <label className="field">
          <span>Назва</span>
          <input
            value={title}
            onChange={(e) => {
              titleTouched.current = true;
              setTitle(e.target.value);
            }}
            placeholder={loading ? 'Завантажую…' : 'Про що це?'}
          />
        </label>

        <label className="field">
          <span>Папка</span>
          <select
            value={newFolderName !== null ? NEW_FOLDER : folderId ?? ''}
            onChange={(e) => {
              if (e.target.value === NEW_FOLDER) {
                setNewFolderName('');
              } else {
                setNewFolderName(null);
                setFolderId(e.target.value || null);
              }
            }}
          >
            <option value="">Без папки</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.icon ?? '📁'} {f.name}</option>
            ))}
            <option value={NEW_FOLDER}>+ Нова папка…</option>
          </select>
          {newFolderName !== null && (
            <input
              className="mt"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Назва нової папки"
              autoFocus
            />
          )}
        </label>

        <div className="field">
          <span>Теги</span>
          <TagInput value={tags} onChange={setTags} suggestions={allTags} />
        </div>

        <label className="field">
          <span>Нотатка</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Чому зберіг, що спробувати…" />
        </label>
      </form>
    </Modal>
  );
}
