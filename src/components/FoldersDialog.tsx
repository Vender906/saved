import { useState } from 'react';
import { createFolder, db, deleteFolder, FOLDER_ICONS, type Folder } from '../db';
import { Modal } from './Modal';

interface Props {
  folders: Folder[];
  counts: Map<string, number>;
  onClose: () => void;
}

function IconPicker({ value, onPick }: { value: string; onPick: (icon: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="icon-picker">
      <button type="button" className="icon-choice" onClick={() => setOpen((o) => !o)} aria-label="Іконка папки">{value}</button>
      {open && (
        <div className="icon-grid">
          {FOLDER_ICONS.map((i) => (
            <button type="button" key={i} className={i === value ? 'active' : ''} onClick={() => { onPick(i); setOpen(false); }}>{i}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FoldersDialog({ folders, counts, onClose }: Props) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(FOLDER_ICONS[1]);

  async function add() {
    if (!name.trim()) return;
    const id = await createFolder(name);
    await db.folders.update(id, { icon });
    setName('');
  }

  async function rename(f: Folder, value: string) {
    const v = value.trim();
    if (v && v !== f.name) await db.folders.update(f.id, { name: v });
  }

  async function remove(f: Folder) {
    const n = counts.get(f.id) ?? 0;
    const msg = n
      ? `Видалити папку «${f.name}»? ${n} запис(ів) залишаться, але без папки.`
      : `Видалити папку «${f.name}»?`;
    if (confirm(msg)) await deleteFolder(f.id);
  }

  return (
    <Modal title="Папки" onClose={onClose}>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <IconPicker value={icon} onPick={setIcon} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Нова папка" autoFocus />
        <button className="btn primary" disabled={!name.trim()}>Додати</button>
      </form>
      <ul className="folder-list">
        {folders.map((f) => (
          <li key={f.id}>
            <IconPicker value={f.icon ?? '📁'} onPick={(i) => db.folders.update(f.id, { icon: i })} />
            <input
              defaultValue={f.name}
              onBlur={(e) => rename(f, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              aria-label="Назва папки"
            />
            <span className="muted count">{counts.get(f.id) ?? 0}</span>
            <button className="icon-btn" onClick={() => remove(f)} aria-label={`Видалити ${f.name}`}>🗑</button>
          </li>
        ))}
        {folders.length === 0 && <li className="muted">Папок ще немає. Створи першу вище.</li>}
      </ul>
    </Modal>
  );
}
