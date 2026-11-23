import { useState } from 'react';
import { bulkPatch, createFolder, db, normalizeTag, type Folder } from '../db';

interface Props {
  ids: string[];
  total: number;
  folders: Folder[];
  inTrash: boolean;
  onSelectAll: () => void;
  onDone: (msg: string, undo?: () => unknown) => void;
  onCancel: () => void;
}

type Panel = null | 'folder' | 'tag';

/** Нижня панель дій для вибраних карток. */
export function SelectionBar({ ids, total, folders, inTrash, onSelectAll, onDone, onCancel }: Props) {
  const [panel, setPanel] = useState<Panel>(null);
  const [tagDraft, setTagDraft] = useState('');
  const n = ids.length;
  const none = n === 0;

  async function run(msg: string, patch: Parameters<typeof bulkPatch>[1]) {
    const undo = await bulkPatch(ids, patch);
    setPanel(null);
    onDone(msg, undo);
  }

  async function moveTo(value: string) {
    if (value === '__new__') {
      const name = prompt('Назва нової папки');
      if (!name?.trim()) return;
      value = await createFolder(name);
    }
    const id = value || null;
    const name = id ? folders.find((f) => f.id === id)?.name ?? 'нову папку' : '«Без папки»';
    await run(`Перенесено ${n} в ${id ? `«${name}»` : name}`, () => ({ folderId: id }));
  }

  async function addTag() {
    const tags = tagDraft.split(',').map(normalizeTag).filter(Boolean);
    if (!tags.length) return;
    setTagDraft('');
    await run(`Додано ${tags.map((t) => '#' + t).join(' ')} до ${n}`, (i) => ({ tags: [...new Set([...i.tags, ...tags])] }));
  }

  return (
    <div className="selection-bar" role="toolbar" aria-label="Дії з вибраними">
      {panel === 'folder' && (
        <div className="selection-panel">
          <button className="chip" onClick={() => moveTo('')}>📄 Без папки</button>
          {folders.map((f) => (
            <button key={f.id} className="chip" onClick={() => moveTo(f.id)}>{f.icon ?? '📁'} {f.name}</button>
          ))}
          <button className="chip ghost" onClick={() => moveTo('__new__')}>＋ Нова папка</button>
        </div>
      )}
      {panel === 'tag' && (
        <form
          className="selection-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void addTag();
          }}
        >
          <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="тег або кілька через кому" autoFocus />
          <button className="btn primary" disabled={!tagDraft.trim()}>Додати</button>
        </form>
      )}

      <div className="selection-main">
        <button className="icon-btn" onClick={onCancel} aria-label="Скасувати вибір">✕</button>
        <span className="selection-count">Вибрано: <b>{n}</b></span>
        {n < total && <button className="link-btn" onClick={onSelectAll}>Вибрати всі ({total})</button>}
        <span className="spacer" />
        {inTrash ? (
          <>
            <button className="btn" disabled={none} onClick={() => run(`Відновлено ${n}`, () => ({ deletedAt: undefined }))}>↩ Відновити</button>
            <button
              className="btn danger"
              disabled={none}
              onClick={async () => {
                if (!confirm(`Видалити назавжди ${n} запис(ів)? Це не можна скасувати.`)) return;
                await db.items.bulkDelete(ids);
                onDone(`Видалено назавжди: ${n}`);
              }}
            >
              Видалити
            </button>
          </>
        ) : (
          <>
            <button className={`btn ${panel === 'folder' ? 'active' : ''}`} disabled={none} onClick={() => setPanel(panel === 'folder' ? null : 'folder')}>📁 <span className="btn-label">Перенести</span></button>
            <button className={`btn ${panel === 'tag' ? 'active' : ''}`} disabled={none} onClick={() => setPanel(panel === 'tag' ? null : 'tag')}># <span className="btn-label">Тег</span></button>
            <button className="btn" disabled={none} onClick={() => run(`Позначено переглянутими: ${n}`, (i) => ({ viewedAt: i.viewedAt ?? Date.now() }))}>✓ <span className="btn-label">Переглянуто</span></button>
            <button className="btn danger" disabled={none} onClick={() => run(`У кошику: ${n}`, () => ({ deletedAt: Date.now() }))}>🗑 <span className="btn-label">У кошик</span></button>
          </>
        )}
      </div>
    </div>
  );
}
