// 앱 시작: 화면 전환을 켜고, 홈 화면 설치·오프라인용 서비스 워커를 등록한다.
App.router.start();

if ('serviceWorker' in navigator) {
    // 새 버전이 설치되어 화면을 넘겨받으면 한 번 새로고침해서 옛 파일과 섞이지 않게 한다
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloaded) return;
        reloaded = true;
        location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
