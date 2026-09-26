// 네트워크를 먼저 쓰고, 인터넷이 없을 때만 저장해 둔 파일로 화면을 연다.
// 브라우저 캐시(GitHub Pages는 10분)에 남은 옛 파일이 새 파일과 섞이지 않도록
// 매번 서버에 최신인지 확인한다(cache: 'no-cache').
// 새 버전을 올릴 때는 이 CACHE 번호와 HTML의 ?v= 번호를 함께 올린다.
const CACHE = 'books100-v6';
const FILES = [
    './',
    'index.html',
    'upload.html',
    'list.html',
    'register.html',
    'reading.html',
    'reading-edit.html',
    'backup.html',
    'style.css',
    'common.js',
    'app.js',
    'upload.js',
    'list.js',
    'register.js',
    'reading.js',
    'reading-edit.js',
    'backup.js',
    'register-sw.js',
    'books-template.csv',
    'manifest.webmanifest',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache =>
        cache.addAll(FILES.map(file => new Request(file, { cache: 'reload' })))));
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
        fetch(event.request, { cache: 'no-cache' })
            .then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE).then(cache => cache.put(event.request, copy));
                }
                return response;
            })
            .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
});
