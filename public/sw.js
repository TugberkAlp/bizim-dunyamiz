// Service Worker - Arka Plan Çalıştırıcısı
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Yüklendi');
});

self.addEventListener('fetch', (e) => {
  // İstekleri doğrudan sunucuya yönlendirir
  e.respondWith(fetch(e.request));
});