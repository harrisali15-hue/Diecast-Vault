// Diecast Vault service worker — auto-updating.
//
// Strategy: NETWORK-FIRST for everything on our own origin. Every load asks the
// server for the freshest copy (revalidating, so unchanged files cost only a tiny
// 304), and the cache is used purely as an offline fallback. That's what stops
// old builds sticking around, the problem the previous cache-first worker had.
//
// Bump VERSION with every release: this file changing is what makes the browser
// install the new worker, which then takes over immediately and the page reloads
// itself (see the SERVICE WORKER block in index.html).
//
// Only same-origin GETs are touched. Supabase API/storage calls are cross-origin
// and pass straight through untouched, so no private user data is ever cached.
var VERSION = "2.8.0";
var CACHE_NAME = "diecast-vault-" + VERSION;
var APP_SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", function(event){
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return Promise.all(APP_SHELL.map(function(url){
        return fetch(url, { cache: "no-cache" }).then(function(res){
          if(res && res.ok) return cache.put(url, res);
        }).catch(function(){ /* one missing file must not block the install */ });
      }));
    })
  );
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(event){
  var req = event.request;
  if(req.method !== "GET") return;
  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req, { cache: "no-cache" }).then(function(res){
      if(res && res.ok && res.type === "basic"){
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
      }
      return res;
    }).catch(function(){
      // Offline: serve the cached copy; for page navigations fall back to the app shell.
      return caches.match(req).then(function(cached){
        if(cached) return cached;
        if(req.mode === "navigate") return caches.match("./index.html").then(function(shell){ return shell || caches.match("./"); });
        return undefined;
      });
    })
  );
});
