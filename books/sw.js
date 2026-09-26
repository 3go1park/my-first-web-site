// 네트워크를 먼저 쓰고, 인터넷이 없을 때만 저장해 둔 파일로 화면을 연다.
const CACHE = 'books100-v2';
const FILES = [
    './',
    'index.html',
    'upload.html',
    'list.html',
    'style.css',
    'app.js',
    'upload.js',
    'list.js',
    'register-sw.js',
    'books-template.csv',
    'manifest.webmanifest',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key !== CACHE).map(key => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        fetch(event.request)
            .then(response => {
                const copy = response.clone();
                caches.open(CACHE).then(cache => cache.put(event.request, copy));
                return response;
            })
            .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
});
