// 홈 화면에 설치하고 인터넷 없이도 열리도록 서비스 워커를 등록한다.
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
