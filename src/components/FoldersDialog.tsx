import { useEffect, useRef, useState } from 'react';
import { createFolder, db, deleteFolder, FOLDER_ICON_GROUPS, FOLDER_ICONS, type Folder } from '../db';
import { Modal } from './Modal';

interface Props {
  folders: Folder[];
  counts: Map<string, number>;
  /** Папка, яку відкрили для редагування — підсвічуємо і ставимо курсор у назву */
  focus?: string;
  onClose: () => void;
}

function IconPicker({ value, onPick }: { value: string; onPick: (icon: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="icon-picker">
      <button type="button" className="icon-choice" onClick={() => setOpen((o) => !o)} aria-label="Іконка папки">{value}</button>
      {open && (
        <div className="icon-grid">
          {FOLDER_ICON_GROUPS.map((g) => (
            <div key={g.name} className="icon-group">
              <div className="icon-group-name">{g.name}</div>
              <div className="icon-group-list">
                {g.icons.map((i) => (
                  <button type="button" key={i} className={i === value ? 'active' : ''} onClick={() => { onPick(i); setOpen(false); }}>{i}</button>
                ))}
              </div>
            </div>
          ))}
          <label className="icon-custom">
            Своє emoji:
            <input
              maxLength={8}
              placeholder="🙂"
              onChange={(e) => {
                const v = [...new Intl.Segmenter().segment(e.target.value.trim())][0]?.segment;
                if (v) { onPick(v); setOpen(false); }
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

export function FoldersDialog({ folders, counts, focus, onClose }: Props) {
  const focusRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = focusRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    el.select();
  }, []);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(FOLDER_ICONS[1]);

  async function add() {
    if (!name.trim()) return;
    const id = await createFolder(name);
    await db.folders.update(id, { icon });
    setName('');
  }

  // Зберігаємо одразу під час набору: змінюється лише назва, записи в папці лишаються на місці
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
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Нова папка" autoFocus={!focus} />
        <button className="btn primary" disabled={!name.trim()}>Додати</button>
      </form>
      {folders.length > 0 && (
        <p className="muted folder-hint">Натисни на значок або назву, щоб змінити. Записи всередині папки не зміняться.</p>
      )}
      <ul className="folder-list">
        {folders.map((f) => (
          <li key={f.id} className={f.id === focus ? 'focused' : ''}>
            <IconPicker value={f.icon ?? '📁'} onPick={(i) => db.folders.update(f.id, { icon: i })} />
            <label className="folder-name">
              <input
                ref={f.id === focus ? focusRef : undefined}
                defaultValue={f.name}
                onChange={(e) => void rename(f, e.target.value)}
                onBlur={(e) => { if (!e.target.value.trim()) e.target.value = f.name; }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                aria-label="Назва папки"
              />
              <span className="folder-name-pen" aria-hidden>✎</span>
            </label>
            <span className="muted count">{counts.get(f.id) ?? 0}</span>
            <button className="icon-btn" onClick={() => remove(f)} aria-label={`Видалити ${f.name}`}>🗑</button>
          </li>
        ))}
        {folders.length === 0 && <li className="muted">Папок ще немає. Створи першу вище.</li>}
      </ul>
      {folders.length > 0 && (
        <div className="folder-done">
          <button className="btn primary" onClick={onClose}>Готово</button>
        </div>
      )}
    </Modal>
  );
}
