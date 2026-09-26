// 홈 화면에 설치하고 인터넷 없이도 열리도록 서비스 워커를 등록한다.
if ('serviceWorker' in navigator) {
    // 새 버전이 설치되어 화면을 넘겨받으면 한 번 새로고침해서
    // 옛 파일과 새 파일이 섞인 채로 보이지 않게 한다.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloaded) return;
        reloaded = true;
        location.reload();
    });

    navigator.serviceWorker.register('sw.js').catch(() => {});
}
