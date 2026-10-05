// 네트워크를 먼저 쓰고, 인터넷이 없을 때만 저장해 둔 파일로 화면을 연다.
// 브라우저 캐시(GitHub Pages는 10분)에 남은 옛 파일이 섞이지 않도록 매번 서버에 최신인지 확인한다.
// CACHE 번호와 FILES 목록은 tools/release.py 가 자동으로 고친다. 직접 고치지 않는다.
const CACHE = 'books100-v25';
const FILES = [
    // FILES:START
    './',
    'backup.html',
    'books-template.csv',
    'css/app.css',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png',
    'index.html',
    'journal.html',
    'js/app.js',
    'js/core/folder-backup.js',
    'js/core/insights.js',
    'js/core/install.js',
    'js/core/ocr.js',
    'js/core/router.js',
    'js/core/scan.js',
    'js/core/store.js',
    'js/core/ui.js',
    'js/core/util.js',
    'js/views/backup.js',
    'js/views/book-form.js',
    'js/views/books.js',
    'js/views/home.js',
    'js/views/install.js',
    'js/views/journal.js',
    'js/views/move.js',
    'js/views/reading.js',
    'js/views/stats.js',
    'js/views/upload.js',
    'list.html',
    'manifest.webmanifest',
    'reading-edit.html',
    'reading.html',
    'register.html',
    'upload.html'
    // FILES:END
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
