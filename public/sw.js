/* NOVA service worker — app shell caching, offline fallback, web push. */
const VERSION = "nova-sw-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const ASSET_CACHE = `${VERSION}-assets`;

const PRECACHE = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/badge-96.png", "/icons/apple-touch-icon.png"];
// Main screens are warmed after login so they open offline even if never visited.
const WARM_PAGES = ["/", "/today", "/insights", "/ask", "/habits", "/goals", "/journal", "/timeline", "/more", "/memory", "/experiments", "/data", "/settings"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "WARM") event.waitUntil(warmPages());
  if (event.data?.type === "CLEAR") event.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.includes("pages")).map((k) => caches.delete(k)))));
});

async function warmPages() {
  const cache = await caches.open(PAGE_CACHE);
  await Promise.all(
    WARM_PAGES.map(async (p) => {
      try {
        const res = await fetch(p, { credentials: "same-origin" });
        if (res.ok && !res.redirected) await cache.put(p, res);
      } catch {
        /* offline */
      }
    }),
  );
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses here — the app keeps its own encrypted-at-rest-by-OS IndexedDB cache.
  if (url.pathname.startsWith("/api/")) return;

  // Immutable build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Page navigations: network-first (fresh data), cached shell when offline, offline page last.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGE_CACHE);
        try {
          const res = await Promise.race([fetch(req), timeout(6000)]);
          if (res.ok && !res.redirected) cache.put(url.pathname, res.clone());
          return res;
        } catch {
          return (await cache.match(url.pathname)) || (await cache.match("/")) || (await caches.match("/offline")) || Response.error();
        }
      })(),
    );
    return;
  }

  // React Server Component payloads for client-side navigation: network-first with cache fallback.
  if (req.headers.get("RSC") === "1") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGE_CACHE);
        const key = `${url.pathname}::rsc`;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(key, res.clone());
          return res;
        } catch {
          return (await cache.match(key)) || Response.error();
        }
      })(),
    );
  }
});

/* ------------------------------ Web push ------------------------------ */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "NOVA", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "NOVA";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      dir: "rtl",
      lang: "he",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || data.id || undefined,
      renotify: false,
      data: { url: data.url || "/", id: data.id },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { url, id } = event.notification.data || {};
  event.waitUntil(
    (async () => {
      if (id && id !== "test") {
        fetch(`/api/notifications/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "clicked" }), credentials: "same-origin" }).catch(() => {});
      }
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const target = new URL(url || "/", self.location.origin).href;
      for (const c of all) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c) return c.navigate(target).catch(() => c.postMessage({ type: "NAVIGATE", url: target }));
          return c.postMessage({ type: "NAVIGATE", url: target });
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
