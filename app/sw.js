'use strict';
const CACHE='swisscourt-__BUILD__';
const ASSETS=['./','./index.html','./styles.css','./core.js','./brackets.js','./matching.js','./tournament.js','./scheduling.js','./scheduling-worker.js','./planning.js','./storage.js','./protocol.js','./simulation.js','./app.js','./real-ui.js','./planner-ui.js','./display-ui.js','./roster-ui.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
// Never skip waiting: a running tournament keeps one coherent app version.
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())if(name.startsWith('swisscourt-')&&name!==CACHE)await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/api/'))return;
 const scope=new URL(self.registration.scope),name=url.pathname.slice(scope.pathname.length);
 if(event.request.mode!=='navigate'&&!ASSETS.includes('./'+name))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),key=event.request.mode==='navigate'?new URL('./index.html',scope).href:new URL('./'+name,scope).href;
  return await cache.match(key)||fetch(event.request);
 })());
});
