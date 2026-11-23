var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var CRAWLER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
var BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
var MAX_IMAGE_BYTES = 8 * 1024 * 1024;
var DAY = 86400;
var src_default = {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const okOrigin = !origin || allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": okOrigin && origin ? origin : allowed[0] || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      Vary: "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ error: "method" }, 405, cors);
    if (!okOrigin) return json({ error: "origin" }, 403, cors);
    const { pathname, searchParams } = new URL(request.url);
    const target = searchParams.get("url") || "";
    if (!/^https?:\/\/[^/]+\.[^/]+/i.test(target)) return json({ error: "url" }, 400, cors);
    try {
      if (pathname === "/meta") return await cached(request, ctx, () => meta(target, cors));
      if (pathname === "/image") return await cached(request, ctx, () => image(target, cors));
      return json({ error: "not found" }, 404, cors);
    } catch (e) {
      return json({ error: String(e?.message || e) }, 502, cors);
    }
  }
};
var CACHE_VERSION = "2";
async function cached(request, ctx, make) {
  const cache = caches.default;
  const keyUrl = new URL(request.url);
  keyUrl.searchParams.set("_v", CACHE_VERSION);
  const key = new Request(keyUrl.toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return withCors(hit, request);
  const res = await make();
  if (res.ok) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
__name(cached, "cached");
function withCors(res, request) {
  const r = new Response(res.body, res);
  const origin = request.headers.get("Origin");
  if (origin) r.headers.set("Access-Control-Allow-Origin", origin);
  return r;
}
__name(withCors, "withCors");
function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": status === 200 ? `public, max-age=${DAY}` : "no-store"
    }
  });
}
__name(json, "json");
async function meta(target, cors) {
  let url = target;
  let host = new URL(url).hostname.replace(/^www\.|^m\./, "");
  if (host.endsWith("tiktok.com")) {
    const tt = await tiktok(url);
    if (tt?.title || tt?.image) return json(tt, 200, cors);
    if (tt?.url) url = tt.url;
    host = new URL(url).hostname.replace(/^www\.|^m\./, "");
  }
  if (host === "youtube.com" || host === "youtu.be") {
    const o = await oembed(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
    if (o?.title) return json({ url, title: o.title, author: o.author_name, image: o.thumbnail_url }, 200, cors);
  }
  const page = await scrape(url, CRAWLER_UA);
  let result = page;
  if (!page.title && !page.image) result = await scrape(url, BROWSER_UA);
  return json(refine(result, host), 200, cors);
}
__name(meta, "meta");
async function tiktok(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": BROWSER_UA, "Accept-Language": "uk,en;q=0.8", Accept: "text/html" }
    });
    const finalUrl = res.url || url;
    const html = await res.text();
    const raw = html.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    if (raw) {
      const scope = JSON.parse(raw).__DEFAULT_SCOPE__ || {};
      const it = scope["webapp.video-detail"]?.itemInfo?.itemStruct;
      if (it) {
        const handle = it.author?.uniqueId;
        return {
          url: handle && it.id ? `https://www.tiktok.com/@${handle}/${it.imagePost ? "photo" : "video"}/${it.id}` : finalUrl,
          title: it.desc || "",
          author: handle ? `@${handle}` : it.author?.nickname || "",
          image: it.imagePost?.images?.[0]?.imageURL?.urlList?.[0] || it.video?.cover || it.video?.originCover || it.video?.dynamicCover || ""
        };
      }
    }
    const page = await scrape(finalUrl, CRAWLER_UA);
    return { url: page.url || finalUrl, title: "", author: page.title.replace(/^TikTok\s*·\s*/, ""), image: page.image };
  } catch {
    return null;
  }
}
__name(tiktok, "tiktok");
async function oembed(endpoint) {
  try {
    const res = await fetch(endpoint, { headers: { "User-Agent": BROWSER_UA } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
__name(oembed, "oembed");
async function scrape(url, ua) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml", "Accept-Language": "uk,en;q=0.8" }
  });
  const out = { url: res.url || url, tags: {}, titleTag: "" };
  if (!res.ok || !(res.headers.get("Content-Type") || "").includes("html")) return pick(out);
  const tags = out.tags;
  const rewriter = new HTMLRewriter().on("meta", {
    element(el) {
      const key = (el.getAttribute("property") || el.getAttribute("name") || el.getAttribute("itemprop") || "").toLowerCase();
      const content = el.getAttribute("content");
      if (key && content && !(key in tags)) tags[key] = content;
    }
  }).on("title", {
    text(t) {
      if (out.titleTag.length < 300) out.titleTag += t.text;
    }
  });
  await rewriter.transform(res).arrayBuffer();
  return pick(out);
}
__name(scrape, "scrape");
function pick({ url, tags, titleTag }) {
  const t = /* @__PURE__ */ __name((k) => decode(tags[k] || ""), "t");
  return {
    url,
    title: t("og:title") || t("twitter:title") || decode(titleTag.trim()),
    description: t("og:description") || t("twitter:description") || t("description"),
    image: t("og:image") || t("og:image:url") || t("og:image:secure_url") || t("twitter:image") || t("twitter:image:src"),
    author: t("author") || t("article:author") || t("twitter:creator")
  };
}
__name(pick, "pick");
function refine(m, host) {
  const r = { ...m };
  if (host.startsWith("threads.")) {
    const a = r.title.match(/^(.*?)\s*\(@([\w.]+)\)/);
    if (a) r.author = r.author || `@${a[2]}`;
    if (r.description) [r.title, r.description] = [r.description, ""];
  } else if (host.startsWith("instagram.")) {
    const a = r.title.match(/^(.*?) on Instagram:\s*"?([\s\S]*?)"?$/) || r.description.match(/-\s*([\w.]+) on [^:]+:\s*"?([\s\S]*?)"?\.?$/);
    if (a) {
      r.author = r.author || a[1];
      if (a[2]) [r.title, r.description] = [a[2], ""];
    }
  } else if (host === "x.com" || host === "twitter.com") {
    const a = r.title.match(/^(.*?) on X$/);
    if (a) {
      r.author = r.author || a[1];
      if (r.description) [r.title, r.description] = [r.description, ""];
    }
  }
  if (r.image?.startsWith("//")) r.image = "https:" + r.image;
  return r;
}
__name(refine, "refine");
function decode(s) {
  return s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
__name(decode, "decode");
async function image(target, cors) {
  const res = await fetch(target, { headers: { "User-Agent": BROWSER_UA, Referer: "" } });
  const type = res.headers.get("Content-Type") || "";
  const size = Number(res.headers.get("Content-Length") || 0);
  if (!res.ok || !type.startsWith("image/") || size > MAX_IMAGE_BYTES) {
    return json({ error: "not an image" }, 415, cors);
  }
  return new Response(res.body, {
    headers: { ...cors, "Content-Type": type, "Cache-Control": `public, max-age=${7 * DAY}` }
  });
}
__name(image, "image");

// ../../../Users/romah/AppData/Local/npm-cache/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../Users/romah/AppData/Local/npm-cache/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-r9qvXw/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../Users/romah/AppData/Local/npm-cache/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-r9qvXw/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
