// 앱 시작: 화면 전환을 켜고, 홈 화면 설치·오프라인용 서비스 워커를 등록한다.
App.router.start();

// 갤탭 폴더 자동 저장 (폴더를 골랐을 때만 동작)
if (App.folderBackup) App.folderBackup.init('daily-life', () => App.store.exportData());
// 예전 구글 드라이브 자동 백업 설정은 더 쓰지 않으므로 지운다 (웹 앱 주소·비밀 키)
['cloudbackup.settings', 'cloudbackup.status'].forEach(key => localStorage.removeItem(key));

// 저장 공간이 부족해도 브라우저가 이 앱 자료를 스스로 지우지 않도록 요청한다
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// 같은 기기에서 앱이 두 곳(예: 홈 화면 앱과 크롬 탭)에 열려 있을 때,
// 한쪽에서 저장하면 다른 쪽 화면에도 바로 반영한다.
function refreshIfChanged() {
    if (!App.store.sync()) return;
    // 입력하는 중이면 쓰던 글이 지워지지 않게 화면은 그대로 둔다 (저장할 때 최신 기록에 반영됨)
    const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (!typing) App.router.render();
}
window.addEventListener('storage', event => {
    if (event.key === null || event.key === 'dailylife.data') refreshIfChanged();
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshIfChanged();
});
window.addEventListener('pageshow', refreshIfChanged);

// 안드로이드 앱(APK) 안에서는 파일이 앱에 들어 있어 오프라인용 서비스 워커가 필요 없다
if ('serviceWorker' in navigator && !window.AndroidBridge) {
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
