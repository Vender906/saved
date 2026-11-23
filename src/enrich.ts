import { db, type Item } from './db';
import { cacheThumbnail, fetchMeta } from './metadata';

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
    if (!keepTitle && meta.title && item.title !== meta.title) patch.title = meta.title;
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
