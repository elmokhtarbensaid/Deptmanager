const CACHE="credit-card-manager-v48";const ASSETS=["./","./index.html","./style1.css?v=6","./style2.css?v=5","./app1.js?v=8","./app2.js?v=48","./app3.js?v=48","./app5.js?v=6","./manifest.webmanifest","./icon.svg"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok&&new URL(event.request.url).origin===self.location.origin){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
  return response;
 }).catch(()=>caches.match(event.request)));
});