import { META_API } from './config';
import { detectPlatform, youtubeId, type Platform } from './platforms';

export interface Meta {
  platform: Platform;
  /** Справжнє посилання після розгортання коротких (vm.tiktok.com → www.tiktok.com/@…/video/…) */
  url?: string;
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

async function getJson(url: string, ms = 5000): Promise<any> {
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
  return v.length > 600 ? v.slice(0, 599) + '…' : v;
}

/** Власний сервіс превʼю (Cloudflare Worker): розгортає короткі посилання, бачить Threads/Instagram як краулер. */
async function viaWorker(url: string): Promise<Partial<Meta>> {
  const d = await getJson(`${META_API}/meta?url=${encodeURIComponent(url)}`, 9000);
  if (d?.error) throw new Error(d.error);
  return { url: d.url, title: text(d.title), description: text(d.description), image: d.image, author: text(d.author) };
}

async function viaOembed(endpoint: string): Promise<Partial<Meta>> {
  const d = await getJson(endpoint);
  if (d?.error || d?.code) throw new Error(String(d.error ?? d.code));
  return { title: text(d.title), author: text(d.author_name), image: d.thumbnail_url };
}

async function viaMicrolink(url: string): Promise<Partial<Meta>> {
  const d = await getJson(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, 7000);
  if (d?.status !== 'success') throw new Error('microlink');
  const x = d.data ?? {};
  return {
    url: x.url,
    title: text(x.title),
    description: text(x.description),
    image: x.image?.url,
    author: text(x.author),
  };
}

// Один запит на посилання за сесію: діалог і фонове доповнення після збереження ділять той самий результат
const cache = new Map<string, Promise<Meta>>();

/** Підтягує назву, превʼю та автора. Ніколи не кидає помилок: у гіршому випадку повертає лише платформу. */
export function fetchMeta(url: string): Promise<Meta> {
  let p = cache.get(url);
  if (!p) {
    p = loadMeta(url).then((m) => {
      if (!m.title) cache.delete(url); // невдачу можна спробувати ще раз пізніше
      return m;
    });
    cache.set(url, p);
  }
  return p;
}

async function loadMeta(url: string): Promise<Meta> {
  const platform = detectPlatform(url);
  const result: Meta = { platform };
  const yt = platform === 'youtube' ? youtubeId(url) : null;
  if (yt) result.image = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;

  const enc = encodeURIComponent(url);
  const sources: Array<() => Promise<Partial<Meta>>> = [];
  if (platform === 'youtube') sources.push(() => viaOembed(`https://noembed.com/embed?url=${enc}`));
  if (META_API) sources.push(() => viaWorker(url));
  // oEmbed TikTok більше не віддає ні підпису, ні обкладинки — тому для TikTok лише сервіс або microlink
  sources.push(() => viaMicrolink(url));

  for (const source of sources) {
    try {
      const m = await source();
      for (const k of ['url', 'title', 'description', 'image', 'author'] as const) {
        if (!result[k] && m[k]) result[k] = m[k];
      }
      if (result.title && result.image) break;
    } catch { /* пробуємо наступне джерело */ }
  }
  return result;
}

/**
 * Зберігає зменшену копію превʼю, щоб вона не зникла, коли посилання на картинку протухне
 * (у TikTok, Threads та Instagram це кілька днів). Через власний сервіс працює для будь-якого сайту,
 * без нього — лише там, де сайт дозволяє (CORS).
 */
export function cacheThumbnail(src: string): Promise<string | undefined> {
  let p = thumbCache.get(src);
  if (!p) {
    p = loadThumbnail(src).then((t) => {
      if (!t) thumbCache.delete(src);
      return t;
    });
    thumbCache.set(src, p);
  }
  return p;
}
const thumbCache = new Map<string, Promise<string | undefined>>();

async function loadThumbnail(src: string): Promise<string | undefined> {
  if (src.startsWith('data:')) return src;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const via = META_API ? `${META_API}/image?url=${encodeURIComponent(src)}` : src;
  try {
    const res = await fetch(via, { mode: 'cors', signal: ctrl.signal });
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
  } finally {
    clearTimeout(timer);
  }
}
