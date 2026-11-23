// Тестові дані для перевірки вигляду: відкрий http://localhost:5173/#demo (лише в режимі розробки).
import { db, uid, type Item } from './db';

export async function seedDemo() {
  if ((await db.items.count()) > 0) return;
  const now = Date.now();
  const day = 86400000;
  const f = [
    { id: uid(), name: 'Маркетинг', icon: '📈', createdAt: now },
    { id: uid(), name: 'Рецепти', icon: '🍝', createdAt: now + 1 },
    { id: uid(), name: 'Кіно на вечір', icon: '🎬', createdAt: now + 2 },
    { id: uid(), name: 'Дизайн', icon: '🎨', createdAt: now + 3 },
  ];
  await db.folders.bulkAdd(f);
  const mk = (i: number, p: Partial<Item>): Item => ({
    id: uid(), url: `https://example.com/${i}`, title: '', platform: 'web', folderId: null, tags: [],
    createdAt: now - i * day * 0.7, updatedAt: now, ...p,
  });
  const yt = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const pic = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`;
  await db.items.bulkAdd([
    mk(0, { platform: 'tiktok', url: 'https://www.tiktok.com/@chef/video/1', author: 'chef.anna', title: 'Паста з лимоном за 15 хвилин 🍋 Зберігай, щоб не загубити! #паста #вечеря', image: pic('pasta', 400, 640), folderId: f[1].id, tags: ['паста', 'швидко'], note: 'Спробувати в суботу' }),
    mk(1, { platform: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', author: 'Rick Astley', title: 'Rick Astley - Never Gonna Give You Up (Official Video)', image: yt('dQw4w9WgXcQ'), folderId: f[2].id, tags: ['музика'] }),
    mk(2, { platform: 'threads', url: 'https://www.threads.net/@m/post/1', author: 'marketing.daily', title: 'Як я зробив 10 000 підписників за місяць без реклами. Тред 🧵\n\n1. Публікуй щодня в один і той самий час.\n2. Відповідай на кожен коментар у першу годину.\n3. Перші 2 секунди відео вирішують усе.', folderId: f[0].id, tags: ['ріст', 'контент'] }),
    mk(3, { platform: 'instagram', url: 'https://www.instagram.com/reel/abc/', author: 'design.soroka', title: 'Мінімалістичний лендинг за 10 хвилин у Figma', image: pic('figma', 400, 640), folderId: f[3].id, tags: ['figma', 'ui'] }),
    mk(4, { platform: 'youtube', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', author: 'jawed', title: 'Me at the zoo', image: yt('jNQXAC9IVRw'), tags: ['історія'] }),
    mk(5, { platform: 'tiktok', url: 'https://www.tiktok.com/@a/video/2', author: 'kava.ira', title: 'Як хакнути пробний режим у будь-якому SaaS 👀', image: pic('saas', 400, 640), folderId: f[0].id, tags: ['saas', 'ріст'], note: 'Показати команді' }),
    mk(6, { platform: 'web', url: 'https://github.com/', author: 'GitHub', title: 'GitHub · Change is constant', description: 'Join the world’s most widely adopted developer platform.', image: pic('gh', 800, 420), tags: ['інструменти'] }),
    mk(7, { platform: 'telegram', url: 'https://t.me/channel/123', author: 'Кіноман', title: '5 трилерів, які тримають до останньої хвилини: Полонянки, Зодіак, Острів проклятих, Виживе найсильніший, Ворог', folderId: f[2].id, tags: ['трилери'] }),
    mk(8, { platform: 'tiktok', url: 'https://www.tiktok.com/@b/video/3', author: 'frame.set', title: 'Освітлення для відео вдома за $20', image: pic('light', 400, 640), folderId: f[3].id, tags: ['відео'] }),
    mk(9, { platform: 'instagram', url: 'https://www.instagram.com/p/xyz/', author: 'helioscoffee', title: 'Нова кавʼярня на Подолі ☕️ Круасани з фісташкою — must try', image: pic('coffee', 640, 800), tags: ['київ', 'кава'] }),
    mk(10, { platform: 'x', url: 'https://x.com/u/status/1', author: 'levelsio', title: 'Ship fast. Most of my products started as a single HTML file.', folderId: f[0].id, tags: ['продукт'] }),
    mk(11, { platform: 'youtube', url: 'https://www.youtube.com/shorts/abcdefghijk', author: 'Petya English', title: 'Фрази, які звучать як у носія', image: pic('eng', 400, 640), tags: ['англійська'] }),
  ]);
}
