import { useEffect, useRef, useState } from 'react';
import { db, requestPersist, type Folder, type Item } from '../db';
import { Modal } from './Modal';
import { applyTheme, readPref, THEMES, writePref, type Theme } from '../prefs';

interface Props {
  itemCount: number;
  folderCount: number;
  onClose: () => void;
  onMessage: (msg: string, undo?: () => unknown) => void;
}

interface Backup {
  app: 'saved';
  version: 1;
  exportedAt: string;
  folders: Folder[];
  items: Item[];
}

export function SettingsDialog({ itemCount, folderCount, onClose, onMessage }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [theme, setTheme] = useState<Theme>(() => readPref('theme', 'dark', THEMES));

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    // React блокує javascript: у href, тому ставимо атрибут напряму
    const appUrl = new URL(import.meta.env.BASE_URL, location.origin).href;
    const code = `javascript:location.href='${appUrl}?url='+encodeURIComponent(location.href)`;
    bookmarkletRef.current?.setAttribute('href', code);
  }, []);

  async function exportData() {
    const backup: Backup = {
      app: 'saved',
      version: 1,
      exportedAt: new Date().toISOString(),
      folders: await db.folders.toArray(),
      items: await db.items.toArray(),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `saved-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importData(file: File) {
    try {
      const data = JSON.parse(await file.text()) as Partial<Backup>;
      if (data.app !== 'saved' || !Array.isArray(data.items) || !Array.isArray(data.folders)) {
        throw new Error('format');
      }
      const items = data.items.filter((i) => i && typeof i.id === 'string' && typeof i.url === 'string')
        .map((i) => ({ ...i, tags: Array.isArray(i.tags) ? i.tags : [], folderId: i.folderId ?? null }));
      const folders = data.folders.filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string');
      await db.transaction('rw', db.items, db.folders, async () => {
        await db.folders.bulkPut(folders);
        await db.items.bulkPut(items);
      });
      onMessage(`Імпортовано: ${items.length} записів, ${folders.length} папок`);
    } catch {
      alert('Не вдалося прочитати файл. Це має бути резервна копія з Saved (.json).');
    }
  }

  return (
    <Modal title="Налаштування" onClose={onClose}>
      <section className="settings-section">
        <h3>Тема</h3>
        <div className="segmented wide" role="radiogroup" aria-label="Тема">
          {THEMES.map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={theme === t}
              className={theme === t ? 'active' : ''}
              onClick={() => {
                setTheme(t);
                writePref('theme', t);
                applyTheme(t);
              }}
            >
              {t === 'dark' ? '🌙 Темна' : t === 'light' ? '☀️ Світла' : '🖥 Як у системі'}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>Твої дані</h3>
        <p className="muted">
          {itemCount} записів · {folderCount} папок. Усе зберігається лише на цьому пристрої, в браузері.
        </p>
        {persisted === false && (
          <p className="notice">
            Браузер може очистити дані, якщо забракне місця.{' '}
            <button className="link-btn" onClick={async () => setPersisted(await requestPersist())}>Захистити дані</button>
          </p>
        )}
        <div className="row wrap">
          <button className="btn" onClick={exportData}>⬇ Експорт у файл</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>⬆ Імпорт з файлу</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importData(f);
              e.target.value = '';
            }}
          />
        </div>
        <p className="muted small">Експорт підходить для резервної копії та щоб перенести все на інший пристрій.</p>
      </section>

      <section className="settings-section">
        <h3>Як зберігати з телефона</h3>
        <p><b>Android:</b> відкрий Saved у Chrome → меню ⋮ → «Додати на головний екран». Після цього в TikTok, YouTube, Threads тисни «Поділитися» → <b>Saved</b>.</p>
        <p><b>iPhone:</b> Safari → «Поділитися» → «На екран Додому». Потім у соцмережі «Копіювати посилання» → відкрий Saved → <b>+ Додати</b> (посилання вставиться саме).</p>
        <p>
          <b>Комп'ютер:</b> перетягни цю кнопку на панель закладок, а потім тисни її на будь-якій сторінці:{' '}
          <a ref={bookmarkletRef} className="btn small" onClick={(e) => e.preventDefault()}>🔖 В Saved</a>
        </p>
      </section>
    </Modal>
  );
}
