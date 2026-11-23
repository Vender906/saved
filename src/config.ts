/**
 * Адреса власного сервісу превʼю (Cloudflare Worker з папки worker/).
 * Можна перевизначити через змінну VITE_META_API; порожній рядок вимикає сервіс
 * (тоді застосунок працює через публічні сервіси, з обмеженнями).
 */
const fromEnv = import.meta.env.VITE_META_API as string | undefined;
export const META_API: string = (fromEnv ?? 'https://saved-meta.vender906.workers.dev').replace(/\/$/, '');
