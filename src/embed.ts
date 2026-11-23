import type { Item } from './db';
import { youtubeId } from './platforms';

export interface Embed {
  src: string;
  /** Висота / ширина плеєра */
  ratio: number;
}

/** Адреса вбудованого плеєра, якщо соцмережа дозволяє показувати пост усередині застосунку. */
export function embedFor(item: Item): Embed | null {
  let u: URL;
  try {
    u = new URL(item.url);
  } catch {
    return null;
  }
  const path = u.pathname;

  if (item.platform === 'youtube') {
    const id = youtubeId(item.url);
    if (!id) return null;
    const t = u.searchParams.get('t');
    const start = t ? `&start=${parseInt(t, 10) || 0}` : '';
    return { src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0${start}`, ratio: path.startsWith('/shorts/') ? 16 / 9 : 9 / 16 };
  }
  if (item.platform === 'tiktok') {
    const m = path.match(/\/(video|photo)\/(\d{8,})/);
    if (!m) return null;
    return m[1] === 'video'
      ? { src: `https://www.tiktok.com/player/v1/${m[2]}?autoplay=1&description=1&music_info=1`, ratio: 16 / 9 }
      : { src: `https://www.tiktok.com/embed/v2/${m[2]}`, ratio: 16 / 9 };
  }
  if (item.platform === 'instagram') {
    const m = path.match(/^\/(p|reels?|tv)\/([\w-]+)/);
    if (!m) return null;
    return { src: `https://www.instagram.com/p/${m[2]}/embed/captioned/`, ratio: m[1].startsWith('reel') ? 16 / 9 : 1.35 };
  }
  if (item.platform === 'x') {
    const id = path.match(/\/status\/(\d+)/)?.[1];
    if (!id) return null;
    return { src: `https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=dark&dnt=true`, ratio: 1.1 };
  }
  return null;
}
