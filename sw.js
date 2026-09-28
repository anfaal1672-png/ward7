/* Web 版をオフラインでも遊べるようにする（設計指示書 第 15.5 節）。
   一度開いたら本体・three.js・写真素材を端末にしまい、次からは回線なしで起動する。
   しまった物はすぐ返し、裏で新しい版を取りに行く（次に開いたときから新しい版）。
   キャッシュの名前は組み立てのたびに中身から作る（game/build.mjs が 75ecdb30d898 を埋める）。 */
var CACHE = 'ward7-__HASH__';
var FILES = ['./', './index.html', './ward7.html', './three.min.js', './assets.js'];
self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(FILES.map(function(f){ return c.add(f).catch(function(){}); }));
  }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k.indexOf('ward7-') === 0 && k !== CACHE; })
                          .map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(function(c){
    return c.match(e.request).then(function(hit){
      var net = fetch(e.request).then(function(res){
        if(res && res.ok && new URL(e.request.url).origin === location.origin) c.put(e.request, res.clone());
        return res;
      }).catch(function(){ return hit; });
      return hit || net;
    });
  }));
});
