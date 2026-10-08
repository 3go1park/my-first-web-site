// 홈 화면 설치: 크롬이 "설치할 수 있어요" 신호(beforeinstallprompt)를 주면 받아 두었다가
// 앱 설치 화면의 버튼으로 설치 창을 띄운다.
App.install = (() => {
    let deferred = null;
    let installed = false;
    const listeners = new Set();
    const notify = () => listeners.forEach(fn => fn());

    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferred = event;
        notify();
    });

    window.addEventListener('appinstalled', () => {
        deferred = null;
        installed = true;
        App.ui.toast('홈 화면에 "책읽는 삶의 재미"를 설치했어요.');
        notify();
    });

    // 홈 화면 아이콘으로 열어서 주소창 없이 실행 중인지
    function isStandalone() {
        if (window.AndroidBridge) return true;   // 안드로이드 앱(APK) 안
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    const canPrompt = () => Boolean(deferred);
    const justInstalled = () => installed;

    async function prompt() {
        if (!deferred) return 'unavailable';
        const event = deferred;
        deferred = null;
        event.prompt();
        const choice = await event.userChoice;
        notify();
        return choice.outcome; // 'accepted' | 'dismissed'
    }

    // 화면이 설치 가능 상태가 바뀔 때 다시 그릴 수 있게
    function onChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    }

    // 앱 주소 (index.html 을 뺀 폴더 주소)
    function appUrl() {
        return location.origin + location.pathname.replace(/index\.html$/, '');
    }

    return { isStandalone, canPrompt, justInstalled, prompt, onChange, appUrl };
})();
