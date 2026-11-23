import { detectPlatform, youtubeId, type Platform } from './platforms';

export interface Meta {
  platform: Platform;
  title?: string;
  description?: string;
  image?: string;
  author?: string;
}

// Заголовки-заглушки, які соцмережі віддають замість реального вмісту
const GENERIC = new Set([
  'instagram', 'login • instagram', 'tiktok', 'tiktok - make your day', 'threads', 'x', 'youtube',
  'facebook', 'log in or sign up to view', 'reddit - dive into anything', 'telegram', 'pinterest',
]);

async function getJson(url: string, ms = 8000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function text(s: unknown): string | undefined {
  if (typeof s !== 'string') return;
  const v = s.replace(/\s+/g, ' ').trim();
  if (!v || GENERIC.has(v.toLowerCase())) return;
  return v.length > 400 ? v.slice(0, 399) + '…' : v;
}

async function viaOembed(endpoint: string): Promise<Partial<Meta>> {
  const d = await getJson(endpoint);
  if (d?.error) throw new Error(d.error);
  return { title: text(d.title), author: text(d.author_name), image: d.thumbnail_url };
}

async function viaMicrolink(url: string): Promise<Partial<Meta>> {
  const d = await getJson(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, 12000);
  if (d?.status !== 'success') throw new Error('microlink');
  const x = d.data ?? {};
  return {
    title: text(x.title),
    description: text(x.description),
    image: x.image?.url,
    author: text(x.author),
  };
}

/** Підтягує назву, превʼю та автора. Ніколи не кидає помилок: у гіршому випадку повертає лише платформу. */
export async function fetchMeta(url: string): Promise<Meta> {
  const platform = detectPlatform(url);
  const result: Meta = { platform };
  const yt = platform === 'youtube' ? youtubeId(url) : null;
  if (yt) result.image = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;

  const enc = encodeURIComponent(url);
  const sources: Array<() => Promise<Partial<Meta>>> = [];
  if (platform === 'youtube') sources.push(() => viaOembed(`https://noembed.com/embed?url=${enc}`));
  if (platform === 'tiktok') sources.push(() => viaOembed(`https://www.tiktok.com/oembed?url=${enc}`));
  sources.push(() => viaMicrolink(url));

  for (const source of sources) {
    try {
      const m = await source();
      for (const k of ['title', 'description', 'image', 'author'] as const) {
        if (!result[k] && m[k]) result[k] = m[k];
      }
      if (result.title && result.image) break;
    } catch { /* пробуємо наступне джерело */ }
  }
  return result;
}

/** Зберігає зменшену копію превʼю, якщо сайт дозволяє (CORS). Інакше лишається просто посилання. */
export async function cacheThumbnail(src: string): Promise<string | undefined> {
  try {
    const res = await fetch(src, { mode: 'cors' });
    if (!res.ok) return;
    const bmp = await createImageBitmap(await res.blob());
    const scale = Math.min(1, 480 / bmp.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.78);
  } catch {
    return;
  }
}
