import type { Item } from './db';
import { PLATFORMS } from './platforms';

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** Кожне слово запиту має знайтись. `#слово` шукає лише серед тегів. */
export function matches(item: Item, query: string, folderName: Map<string, string>): boolean {
  const q = query.trim();
  if (!q) return true;
  const hay = norm(
    [
      item.title, item.description, item.note, item.author, item.url,
      item.tags.join(' '),
      item.folderId ? folderName.get(item.folderId) : '',
      PLATFORMS[item.platform].label,
    ].filter(Boolean).join('\n'),
  );
  const tags = item.tags.map(norm);
  return q.split(/\s+/).every((tok) => {
    if (tok.startsWith('#') && tok.length > 1) {
      const t = norm(tok.slice(1));
      return tags.some((x) => x.startsWith(t));
    }
    return hay.includes(norm(tok));
  });
}
