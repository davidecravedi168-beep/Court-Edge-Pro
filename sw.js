const CACHE='court-edge-pro-v4-3-2';
const CORE=[
  './','./index.html','./betting-ux.js','./match-details-v43.js','./quant-math-v5.js','./quant-desk-v5.js',
  './court-quality-governance-v6.js','./court-intel.js','./court-simple-ui.js','./legal.html','./manifest.webmanifest',
  './assets/icon-192.png','./assets/icon-512.png'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  const live=/\/data\/((nba|euroleague)-(v4|quant)-board|automation-health)\.json$/.test(u.pathname);
  const nav=e.request.mode==='navigate';
  const runtime=/\.(js|css)$/.test(u.pathname);
  if(live||nav||runtime){
    e.respondWith(
      fetch(e.request,{cache:'no-store'})
        .then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(e.request,r.clone()));return r})
        .catch(()=>caches.match(e.request).then(x=>x||(nav?caches.match('./index.html'):Response.error())))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(e.request,r.clone()));return r})));
});
