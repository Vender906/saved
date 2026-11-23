// Налаштування вигляду, що зберігаються лише на цьому пристрої

export function readPref<T extends string>(key: string, fallback: T, allowed?: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    if (v !== null && (!allowed || allowed.includes(v))) return v;
  } catch { /* приватний режим */ }
  return fallback;
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch { /* приватний режим */ }
}

export const THEMES = ['dark', 'light', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0a0d' : '#f6f6f8');
}

export const SORTS = ['new', 'old', 'title', 'platform'] as const;
export type Sort = (typeof SORTS)[number];
export const SORT_LABELS: Record<Sort, string> = {
  new: 'Спочатку нові',
  old: 'Спочатку старі',
  title: 'За назвою (А–Я)',
  platform: 'За соцмережею',
};

export const STATUSES = ['all', 'unviewed', 'viewed'] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<Status, string> = {
  all: 'Усі статуси',
  unviewed: 'Не переглянуті',
  viewed: 'Переглянуті',
};

export const LAYOUTS = ['grid', 'list'] as const;
export type Layout = (typeof LAYOUTS)[number];
