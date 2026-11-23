/**
 * Адреса власного сервісу превʼю (Cloudflare Worker з папки worker/).
 * Порожньо — застосунок працює без нього, через публічні сервіси (з обмеженнями).
 */
export const META_API: string = (import.meta.env.VITE_META_API as string | undefined)?.replace(/\/$/, '') ?? '';
