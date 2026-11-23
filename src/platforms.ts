export type Platform =
  | 'youtube' | 'tiktok' | 'instagram' | 'threads' | 'telegram'
  | 'x' | 'reddit' | 'facebook' | 'pinterest' | 'web';

export const PLATFORMS: Record<Platform, { label: string; color: string }> = {
  youtube: { label: 'YouTube', color: '#ff0033' },
  tiktok: { label: 'TikTok', color: '#fe2c55' },
  instagram: { label: 'Instagram', color: '#d62976' },
  threads: { label: 'Threads', color: '#3a3a3a' },
  telegram: { label: 'Telegram', color: '#229ed9' },
  x: { label: 'X', color: '#3a3a3a' },
  reddit: { label: 'Reddit', color: '#ff4500' },
  facebook: { label: 'Facebook', color: '#1877f2' },
  pinterest: { label: 'Pinterest', color: '#e60023' },
  web: { label: 'Сайт', color: '#6b7280' },
};
export const PLATFORM_ORDER = Object.keys(PLATFORMS) as Platform[];

const RULES: [RegExp, Platform][] = [
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)threads\.(net|com)$/, 'threads'],
  [/(^|\.)(t\.me|telegram\.me)$/, 'telegram'],
  [/(^|\.)(x\.com|twitter\.com)$/, 'x'],
  [/(^|\.)(reddit\.com|redd\.it)$/, 'reddit'],
  [/(^|\.)(facebook\.com|fb\.watch|fb\.com)$/, 'facebook'],
  [/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/, 'pinterest'],
];

export function detectPlatform(url: string): Platform {
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const [re, p] of RULES) if (re.test(host)) return p;
  } catch { /* невалідне посилання */ }
  return 'web';
}

/** Дістає перше посилання з тексту (TikTok/Threads часто діляться текстом із посиланням усередині). */
export function extractUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  let u = text.match(/https?:\/\/[^\s<>"'«»]+/i)?.[0];
  if (!u) {
    const bare = text.trim().match(/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?$/i);
    if (bare) u = 'https://' + bare[0];
  }
  if (!u) return null;
  u = u.replace(/[)\].,!?;:]+$/, '');
  try {
    return new URL(u).toString();
  } catch {
    return null;
  }
}

const GENERIC_DROP = new Set(['fbclid', 'gclid', 'igsh', 'igshid', 'mibextid', 'ref_src', 'ref_url']);
const PLATFORM_DROP: Partial<Record<Platform, Set<string>>> = {
  youtube: new Set(['si', 'feature', 'pp']),
  tiktok: new Set(['is_from_webapp', 'sender_device', 'sender_web_id', '_r', '_t', 'share_app_id', 'share_link_id', 'u_code', 'refer', 'tt_from']),
  x: new Set(['s', 't']),
  threads: new Set(['xmt', 'slof']),
  instagram: new Set(['img_index']),
};

/** Прибирає трекінгові параметри, щоб однакові пости не дублювались. */
export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const extra = PLATFORM_DROP[detectPlatform(raw)];
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(key) || GENERIC_DROP.has(key) || extra?.has(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    const v = u.searchParams.get('v');
    if (v) return v;
    return u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{6,})/)?.[2] ?? null;
  } catch {
    return null;
  }
}

export function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, '');
  } catch {
    return url;
  }
}
