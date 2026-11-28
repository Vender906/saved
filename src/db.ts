import Dexie, { type Table } from 'dexie';
import type { Platform } from './platforms';

export interface Item {
  id: string;
  url: string;
  title: string;
  description?: string;
  /** Посилання на превʼю з сайту */
  image?: string;
  /** Збережена копія превʼю (data URL), щоб не зникала, коли посилання протухне */
  thumb?: string;
  author?: string;
  platform: Platform;
  folderId: string | null;
  tags: string[];
  note?: string;
  createdAt: number;
  updatedAt: number;
  /** Якщо задано — запис у кошику */
  deletedAt?: number;
  /** Коли вперше відкрили пост (з застосунку) */
  viewedAt?: number;
}

export interface Folder {
  id: string;
  name: string;
  icon?: string;
  createdAt: number;
}

/** Значки для папок, згруповані за темами (порядок — як у виборі). */
export const FOLDER_ICON_GROUPS: { name: string; icons: string[] }[] = [
  { name: 'Загальні', icons: ['📁', '📂', '🗂️', '📌', '⭐', '🔥', '💡', '✅', '❤️', '💜', '🔖', '🏷️', '📝', '🗒️', '📎', '🎯'] },
  { name: 'Їжа', icons: ['🍝', '🍕', '🍔', '🍣', '🥗', '🍰', '🧁', '🍪', '☕', '🍷', '🍹', '🥑', '🍳', '🥘', '🌮', '🍜'] },
  { name: 'Навчання й робота', icons: ['📚', '🧠', '🎓', '✏️', '💼', '📊', '📈', '💻', '🖥️', '📱', '🤖', '⚙️', '🛠️', '🔧', '🧪', '🔬'] },
  { name: 'Розваги', icons: ['🎬', '🎵', '🎧', '🎮', '🎨', '📷', '🎤', '🎸', '🎭', '📺', '🍿', '🎲', '😂', '🤣', '✨', '🎉'] },
  { name: 'Життя', icons: ['🏠', '🛋️', '🌱', '🪴', '🐶', '🐱', '👶', '👗', '👟', '💄', '💅', '🧴', '🛒', '🎁', '💍', '🧸'] },
  { name: 'Здоровʼя й спорт', icons: ['🏋️', '🧘', '🏃', '🚴', '⚽', '🏀', '🎾', '🏊', '🥊', '💪', '🩺', '💊', '😴', '🧖', '🥦', '💧'] },
  { name: 'Подорожі', icons: ['✈️', '🌍', '🗺️', '🏖️', '🏔️', '🏕️', '🚗', '🚆', '🏙️', '🗽', '🏝️', '🧳', '📍', '⛺', '🚀', '🌅'] },
  { name: 'Гроші', icons: ['💰', '💵', '💳', '🪙', '📉', '🏦', '💎', '🧾'] },
];
export const FOLDER_ICONS = FOLDER_ICON_GROUPS.flatMap((g) => g.icons);

class SavedDB extends Dexie {
  items!: Table<Item, string>;
  folders!: Table<Folder, string>;

  constructor() {
    super('saved');
    this.version(1).stores({
      items: 'id, url, createdAt, folderId, platform, *tags',
      folders: 'id, name, createdAt',
    });
  }
}

export const db = new SavedDB();

export function uid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* небезпечний контекст (http) */ }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export async function createFolder(name: string): Promise<string> {
  const clean = name.trim();
  const existing = (await db.folders.toArray()).find((f) => f.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing.id;
  const id = uid();
  await db.folders.add({ id, name: clean, createdAt: Date.now() });
  return id;
}

export async function deleteFolder(id: string): Promise<void> {
  await db.transaction('rw', db.items, db.folders, async () => {
    await db.items.where('folderId').equals(id).modify({ folderId: null });
    await db.folders.delete(id);
  });
}

/** Просить браузер не видаляти дані при нестачі місця. */
export async function requestPersist(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export const moveToTrash = (id: string) => db.items.update(id, { deletedAt: Date.now() });
// Dexie видаляє поле, якщо передати undefined
export const restoreFromTrash = (id: string) => db.items.update(id, { deletedAt: undefined });

export const markViewed = (id: string) =>
  db.items.where('id').equals(id).modify((i) => {
    if (!i.viewedAt) i.viewedAt = Date.now();
  });

/** Масові зміни. Повертають функцію «Скасувати», яка відновлює попередній стан цих записів. */
export async function bulkPatch(ids: string[], patch: (i: Item) => Partial<Item>): Promise<() => Promise<void>> {
  const before = await db.items.bulkGet(ids);
  await db.transaction('rw', db.items, async () => {
    for (const i of before) if (i) await db.items.update(i.id, patch(i));
  });
  return async () => {
    await db.items.bulkPut(before.filter((i): i is Item => !!i));
  };
}

const TAG_COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#60a5fa', '#a78bfa', '#f472b6'];
const AVATAR_COLORS = ['#7c3aed', '#db2777', '#ea580c', '#0891b2', '#16a34a', '#2563eb', '#c026d3', '#ca8a04'];
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
export const tagColor = (t: string) => TAG_COLORS[hash(t) % TAG_COLORS.length];
export const avatarColor = (s: string) => AVATAR_COLORS[hash(s) % AVATAR_COLORS.length];

export function normalizeTag(t: string): string {
  return t.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase();
}
