const CACHE_NAME = "rogers-tracker-v1";
const OFFLINE_QUEUE_DB = "rogers-tracker-offline-queue";

const APP_SHELL = [
  "/",
  "/dashboard",
  "/dashboard.html",
  "/entry",
  "/entry.html",
  "/log",
  "/log.html",
  "/summary",
  "/summary.html",
  "/settings",
  "/settings.html",
  "/manifest.json",
  "/static/app.js",
  "/static/dashboard.js",
  "/static/entry.js",
  "/static/log.js",
  "/static/settings.js",
  "/static/summary.js",
  "/static/style.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/") && request.method === "POST") {
    event.respondWith(handleApiPost(request));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.method === "GET") {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});

async function handleApiPost(request) {
  try {
    return await fetch(request);
  } catch {
    const body = await request.clone().json();
    await queueRequest({ url: request.url, body });
    notifyClients();
    return Response.json(
      { queued: true, message: "Saved offline. Will sync when back online." },
      { status: 202 }
    );
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-queue") {
    event.waitUntil(flushQueue());
  }
});

async function notifyClients() {
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: "OFFLINE_QUEUED" });
  });
}

async function queueRequest(item) {
  const db = await openQueueDb();
  const tx = db.transaction("queue", "readwrite");
  tx.objectStore("queue").add({ ...item, timestamp: Date.now() });
  await txComplete(tx);
}

async function flushQueue() {
  const db = await openQueueDb();
  const tx = db.transaction("queue", "readwrite");
  const store = tx.objectStore("queue");
  const items = await store.getAll();

  for (const item of items) {
    try {
      await fetch(item.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.body),
      });
      store.delete(item.id);
    } catch {
      // Keep queued until we are back online.
    }
  }

  await txComplete(tx);
}

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_QUEUE_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("queue", {
        keyPath: "id",
        autoIncrement: true,
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txComplete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
