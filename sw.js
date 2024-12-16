(() => {
  // ns-params:@params
  var url = "http://localhost:1313/";

  // <stdin>
  var CACHE_NAME = "luna_sw";
  var OFFLINE_URL = "../offline.html";
  var OFFLINE_IMAGE = "../offline.jpg";
  var ERROR_IMAGE = "../images/error.svg";
  var baseURL = url;
  console.log("load sw.js", baseURL);
  self.addEventListener("install", (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        cache.add(new Request(OFFLINE_URL, {
          cache: "reload"
        }));
        cache.add(new Request(OFFLINE_IMAGE, {
          cache: "reload"
        }));
        cache.add(new Request(ERROR_IMAGE, {
          cache: "reload"
        }));
      })
    );
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
      if ("navigationPreload" in self.registration) {
        await self.registration.navigationPreload.enable();
      }
    })());
    self.clients.claim();
  });
  self.skipWaiting();
  self.addEventListener("fetch", (event) => {
    if (event.request.url.startsWith(self.location.origin) || event.request.url.match(/^https:\/\/cdn\.jsdelivr\.net/)) {
      event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse.status === 200) {
            await cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          let cachedResponse = await cache.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          } else {
            return await cache.match(OFFLINE_URL);
          }
        }
      })());
    }
  });
})();
