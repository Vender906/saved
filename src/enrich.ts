import { db, type Item } from './db';
import { cacheThumbnail, fetchMeta } from './metadata';
import { cleanUrl, prettyUrl } from './platforms';

/**
 * Доповнює вже збережений запис у фоні: назва, опис, автор, превʼю.
 * Запускається після збереження, тож користувачу не треба чекати.
 * Заповнює лише порожні поля, а назву чіпає тільки якщо користувач її не вписав сам.
 */
export async function enrichItem(id: string, url: string, keepTitle: boolean): Promise<void> {
  try {
    const meta = await fetchMeta(url);
    const item = await db.items.get(id);
    if (!item) return;

    const patch: Partial<Item> = {};
    const canonical = meta.url ? cleanUrl(meta.url) : null;
    if (canonical && canonical !== item.url) patch.url = canonical;
    // Назву-заглушку (адресу сторінки) замінюємо завжди, справжню — лише якщо користувач її не вписав сам
    const placeholder = !item.title || item.title === prettyUrl(item.url) || item.title === prettyUrl(url);
    if ((!keepTitle || placeholder) && meta.title && item.title !== meta.title) patch.title = meta.title;
    if (!item.description && meta.description) patch.description = meta.description;
    if (!item.author && meta.author) patch.author = meta.author;
    if (!item.image && meta.image) patch.image = meta.image;
    if (Object.keys(patch).length) await db.items.update(id, patch);

    const image = item.image ?? meta.image;
    if (image && !item.thumb) {
      const thumb = await cacheThumbnail(image);
      if (thumb) await db.items.update(id, { thumb });
    }
  } catch {
    /* фонове доповнення не критичне */
  }
}

/**
 * Доробляє записи, яким не встигли підтягнутись дані (наприклад, застосунок закрили одразу після збереження).
 * Запускається при відкритті застосунку. Лише свіжі записи: посилання на картинки соцмереж живуть кілька днів.
 */
export async function repairPending(): Promise<void> {
  const since = Date.now() - 3 * 86400000;
  const pending = (await db.items.where('createdAt').above(since).toArray())
    .filter((i) => !i.deletedAt && (!i.thumb || i.title === prettyUrl(i.url)))
    .slice(0, 15);
  for (const i of pending) {
    await enrichItem(i.id, i.url, true);
  }
}
