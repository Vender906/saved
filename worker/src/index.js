/**
 * Saved — сервіс превʼю.
 *
 *   GET /meta?url=…   → { url, title, description, image, author }
 *   GET /image?url=…  → сама картинка (щоб застосунок міг зберегти її копію)
 *
 * Навіщо сервер: Threads та Instagram віддають текст і фото поста лише краулерам
 * (як превʼю в Telegram/Facebook), а короткі посилання TikTok (vm.tiktok.com)
 * браузер не може розгорнути через CORS.
 */

const CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DAY = 86400;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const okOrigin = !origin || allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': okOrigin && origin ? origin : allowed[0] || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      Vary: 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'method' }, 405, cors);
    // Чужі сайти не можуть користуватись сервісом зі своїх сторінок
    if (!okOrigin) return json({ error: 'origin' }, 403, cors);

    const { pathname, searchParams } = new URL(request.url);
    const target = searchParams.get('url') || '';
    if (!/^https?:\/\/[^/]+\.[^/]+/i.test(target)) return json({ error: 'url' }, 400, cors);

    try {
      if (pathname === '/meta') return await cached(request, ctx, () => meta(target, cors));
      if (pathname === '/image') return await cached(request, ctx, () => image(target, cors));
      return json({ error: 'not found' }, 404, cors);
    } catch (e) {
      return json({ error: String(e?.message || e) }, 502, cors);
    }
  },
};

/** Кешуємо відповіді на добу в кеші Cloudflare: повторні запити миттєві і не навантажують соцмережі. */
// Збільшуй при зміні формату відповіді, щоб не віддавати старі закешовані результати
const CACHE_VERSION = '2';

async function cached(request, ctx, make) {
  const cache = caches.default;
  const keyUrl = new URL(request.url);
  keyUrl.searchParams.set('_v', CACHE_VERSION);
  const key = new Request(keyUrl.toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return withCors(hit, request);
  const res = await make();
  if (res.ok) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

function withCors(res, request) {
  const r = new Response(res.body, res);
  const origin = request.headers.get('Origin');
  if (origin) r.headers.set('Access-Control-Allow-Origin', origin);
  return r;
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? `public, max-age=${DAY}` : 'no-store',
    },
  });
}

// ---------------------------------------------------------------- /meta

async function meta(target, cors) {
  let url = target;
  let host = new URL(url).hostname.replace(/^www\.|^m\./, '');

  if (host.endsWith('tiktok.com')) {
    // Короткі посилання (vm./vt.tiktok.com) розгортаються самі завдяки redirect: 'follow'
    const tt = await tiktok(url);
    if (tt?.title || tt?.image) return json(tt, 200, cors);
    if (tt?.url) url = tt.url;
    host = new URL(url).hostname.replace(/^www\.|^m\./, '');
  }

  if (host === 'youtube.com' || host === 'youtu.be') {
    const o = await oembed(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
    if (o?.title) return json({ url, title: o.title, author: o.author_name, image: o.thumbnail_url }, 200, cors);
  }

  const page = await scrape(url, CRAWLER_UA);
  let result = page;
  // Деякі сайти не люблять краулерів — пробуємо як звичайний браузер
  if (!page.title && !page.image) result = await scrape(url, BROWSER_UA);

  return json(refine(result, host), 200, cors);
}

/**
 * TikTok: oEmbed більше не віддає ні підпису, ні обкладинки, а краулерам — лише ім'я автора.
 * Повні дані є в JSON усередині сторінки, яку бачить звичайний браузер.
 */
async function tiktok(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'uk,en;q=0.8', Accept: 'text/html' },
    });
    const finalUrl = res.url || url;
    const html = await res.text();
    const raw = html.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    if (raw) {
      const scope = JSON.parse(raw).__DEFAULT_SCOPE__ || {};
      const it = scope['webapp.video-detail']?.itemInfo?.itemStruct;
      if (it) {
        const handle = it.author?.uniqueId;
        return {
          url: handle && it.id ? `https://www.tiktok.com/@${handle}/${it.imagePost ? 'photo' : 'video'}/${it.id}` : finalUrl,
          title: it.desc || '',
          author: handle ? `@${handle}` : it.author?.nickname || '',
          image:
            it.imagePost?.images?.[0]?.imageURL?.urlList?.[0] ||
            it.video?.cover || it.video?.originCover || it.video?.dynamicCover || '',
        };
      }
    }
    // Запасний варіант — мета-теги для краулерів: «TikTok · Імʼя» та картка-превʼю
    const page = await scrape(finalUrl, CRAWLER_UA);
    return { url: page.url || finalUrl, title: '', author: page.title.replace(/^TikTok\s*·\s*/, ''), image: page.image };
  } catch {
    return null;
  }
}

async function oembed(endpoint) {
  try {
    const res = await fetch(endpoint, { headers: { 'User-Agent': BROWSER_UA } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Читає мета-теги сторінки (og:*, twitter:*, <title>) потоково, не завантажуючи все підряд. */
async function scrape(url, ua) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': ua, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'uk,en;q=0.8' },
  });
  const out = { url: res.url || url, tags: {}, titleTag: '' };
  if (!res.ok || !(res.headers.get('Content-Type') || '').includes('html')) return pick(out);

  const tags = out.tags;
  const rewriter = new HTMLRewriter()
    .on('meta', {
      element(el) {
        const key = (el.getAttribute('property') || el.getAttribute('name') || el.getAttribute('itemprop') || '').toLowerCase();
        const content = el.getAttribute('content');
        if (key && content && !(key in tags)) tags[key] = content;
      },
    })
    .on('title', {
      text(t) {
        if (out.titleTag.length < 300) out.titleTag += t.text;
      },
    });
  await rewriter.transform(res).arrayBuffer();
  return pick(out);
}

function pick({ url, tags, titleTag }) {
  const t = (k) => decode(tags[k] || '');
  return {
    url,
    title: t('og:title') || t('twitter:title') || decode(titleTag.trim()),
    description: t('og:description') || t('twitter:description') || t('description'),
    image: t('og:image') || t('og:image:url') || t('og:image:secure_url') || t('twitter:image') || t('twitter:image:src'),
    author: t('author') || t('article:author') || t('twitter:creator'),
  };
}

/** Прибирає з заголовків службові хвости соцмереж і дістає автора. */
function refine(m, host) {
  const r = { ...m };
  if (host.startsWith('threads.')) {
    // «Name (@handle) on Threads» → автор, а сам текст поста в описі
    const a = r.title.match(/^(.*?)\s*\(@([\w.]+)\)/);
    if (a) r.author = r.author || `@${a[2]}`;
    if (r.description) [r.title, r.description] = [r.description, ''];
  } else if (host.startsWith('instagram.')) {
    // «Name on Instagram: "caption"» або «123 likes, 4 comments - user on date: "caption"»
    const a = r.title.match(/^(.*?) on Instagram:\s*"?([\s\S]*?)"?$/) || r.description.match(/-\s*([\w.]+) on [^:]+:\s*"?([\s\S]*?)"?\.?$/);
    if (a) {
      r.author = r.author || a[1];
      if (a[2]) [r.title, r.description] = [a[2], ''];
    }
  } else if (host === 'x.com' || host === 'twitter.com') {
    const a = r.title.match(/^(.*?) on X$/);
    if (a) {
      r.author = r.author || a[1];
      if (r.description) [r.title, r.description] = [r.description, ''];
    }
  }
  if (r.image?.startsWith('//')) r.image = 'https:' + r.image;
  return r;
}

function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------- /image

async function image(target, cors) {
  const res = await fetch(target, { headers: { 'User-Agent': BROWSER_UA, Referer: '' } });
  const type = res.headers.get('Content-Type') || '';
  const size = Number(res.headers.get('Content-Length') || 0);
  // Віддаємо лише картинки, щоб сервіс не став проксі для чого завгодно
  if (!res.ok || !type.startsWith('image/') || size > MAX_IMAGE_BYTES) {
    return json({ error: 'not an image' }, 415, cors);
  }
  return new Response(res.body, {
    headers: { ...cors, 'Content-Type': type, 'Cache-Control': `public, max-age=${7 * DAY}` },
  });
}
