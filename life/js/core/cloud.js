// 구글 드라이브 자동 백업. "하루 하루 삶의 기록"과 "책읽는 삶의 재미"가 같은 파일을 쓴다
// (두 앱의 js/core/cloud.js 는 똑같이 유지한다).
//
// 자료를 저장할 때마다(store.save) 몇 초 뒤 전체 백업을 구글 Apps Script 웹 앱으로 보내고,
// 웹 앱이 내 구글 드라이브의 "삶의 기록 앱 백업" 폴더에 저장한다 (apps-script/drive-backup.gs).
// 설정(웹 앱 주소, 비밀 키)은 같은 사이트의 두 앱이 함께 쓴다.
//
// 안전 장치: 이 브라우저에서 처음 백업하기 전에는 드라이브의 백업을 먼저 읽어 "합쳐서 복원"한 뒤 올린다.
// 그래서 빈 브라우저(새로 설치한 앱 등)에서 저장해도 드라이브의 기록을 덮어 지우지 않는다.
App.cloud = (() => {
    const SETTINGS_KEY = 'cloudbackup.settings';
    const STATUS_KEY = 'cloudbackup.status';
    const CODE_URL = '../apps-script/drive-backup.gs';
    let appName = '';
    let exporter = null;
    let timer = null;
    let running = false;
    let again = false;
    const listeners = new Set();

    function readJson(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (err) { return fallback; }
    }
    function writeJson(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* 공간 부족 */ }
    }

    const settings = () => readJson(SETTINGS_KEY, {});
    const configured = () => Boolean(settings().url && settings().key);
    const status = () => readJson(STATUS_KEY, {})[appName] || {};

    function setStatus(patch) {
        const all = readJson(STATUS_KEY, {});
        all[appName] = { ...(all[appName] || {}), ...patch };
        writeJson(STATUS_KEY, all);
        listeners.forEach(fn => fn());
    }

    function onChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    }

    // 웹 앱에 요청. 실패하면 알아보기 쉬운 글로 오류를 낸다.
    async function call(action, extra = {}, s = settings()) {
        if (!navigator.onLine) throw new Error('인터넷에 연결되어 있지 않아요');
        let res;
        try {
            res = await fetch(s.url, { method: 'POST', body: JSON.stringify({ key: s.key, app: appName, action, ...extra }) });
        } catch (err) {
            throw new Error('웹 앱에 연결하지 못했어요. 주소와 인터넷 연결을 확인해 주세요');
        }
        let json;
        try { json = await res.json(); } catch (err) {
            throw new Error('웹 앱의 응답을 읽지 못했어요. 배포할 때 "액세스: 모든 사용자"로 했는지 확인해 주세요');
        }
        if (!json.ok) throw new Error(json.error === 'key' ? '비밀 키가 Apps Script 의 SECRET 과 달라요' : json.error || '알 수 없는 오류');
        return json;
    }

    // 드라이브 백업을 지금 자료에 합친다. 합친 내용이 있으면 요약을, 없으면 null
    function mergeRemote(remote) {
        if (!remote) return null;
        const parsed = App.store.parseBackup(remote);
        if (!parsed) return null;
        const merged = App.store.previewMerge(parsed);
        if (!merged.summary.changed) return null;
        App.store.applyMerge(merged);
        return merged.summary;
    }

    function refreshScreen() {
        const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        if (!typing) App.router.render();
    }

    async function backupNow() {
        if (!appName || !configured()) return false;
        if (running) { again = true; return false; }
        running = true;
        clearTimeout(timer);
        timer = null;
        try {
            if (!status().linked) {
                // 이 브라우저에서 처음: 드라이브 기록을 먼저 합친다
                const remote = await call('load');
                if (mergeRemote(remote.data)) {
                    App.ui.toast('구글 드라이브의 백업을 이 기기 기록에 합쳤어요.');
                    refreshScreen();
                }
                setStatus({ linked: true });
            }
            const result = await call('save', { data: exporter() });
            setStatus({ lastOk: Date.parse(result.savedAt) || Date.now(), pending: false, error: '' });
            return true;
        } catch (err) {
            setStatus({ pending: true, error: err.message, lastTry: Date.now() });
            return false;
        } finally {
            running = false;
            if (again) { again = false; schedule(1000); }
        }
    }

    // 자료를 저장할 때마다 부른다 (store.save). 잇달아 저장하면 마지막 것 한 번만 보낸다.
    function schedule(delay = 3000) {
        if (!appName || !configured()) return;
        if (!status().pending) setStatus({ pending: true });
        clearTimeout(timer);
        timer = setTimeout(backupNow, delay);
    }

    // 연결하고 켜기: 주소·키를 확인하고, 드라이브 기록을 합친 뒤 첫 백업
    async function connect(url, key) {
        const s = { url: url.trim(), key: key.trim() };
        if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(s.url)) {
            throw new Error('웹 앱 주소는 "https://script.google.com/macros/s/…/exec" 모양이에요');
        }
        if (!s.key) throw new Error('비밀 키를 넣어 주세요');
        await call('ping', {}, s);
        writeJson(SETTINGS_KEY, s);
        setStatus({ linked: false, error: '' });
        return backupNow();
    }

    function disconnect() {
        localStorage.removeItem(SETTINGS_KEY);
        localStorage.removeItem(STATUS_KEY);
        clearTimeout(timer);
        listeners.forEach(fn => fn());
    }

    // 드라이브에서 가장 최근 백업 읽기 → { data, savedAt }
    async function load() {
        return call('load');
    }

    function ago(time) {
        const minutes = Math.round((Date.now() - time) / 60000);
        if (minutes < 1) return '방금';
        if (minutes < 60) return `${minutes}분 전`;
        if (minutes < 60 * 24) return `${Math.round(minutes / 60)}시간 전`;
        return `${Math.round(minutes / 60 / 24)}일 전`;
    }

    // 홈 화면 백업 타일에 쓸 한 줄. 꺼져 있으면 null
    function summary() {
        if (!configured()) return null;
        const s = status();
        if (s.error && s.pending) return { text: '자동 백업 실패', bad: true };
        if (s.lastOk) return { text: `자동 백업 ${ago(s.lastOk)}`, bad: false, lastOk: s.lastOk };
        return { text: '자동 백업 대기 중', bad: false };
    }

    // 백업 화면의 "구글 드라이브 자동 백업" 카드. onLoaded(백업 글자)는 불러온 백업으로 복원 화면을 띄운다.
    function renderCard(box, { onLoaded }) {
        const { escapeHtml } = App.util;
        const { toast } = App.ui;
        let editing = false;
        const draft = { url: settings().url || '', key: settings().key || '' };   // 입력하던 값 (실패해도 남김)

        function render() {
            if (!document.body.contains(box)) return;
            const on = configured();
            const s = status();
            const line = !on ? '꺼져 있어요. 아래에 웹 앱 주소와 비밀 키를 넣으면 켜져요.'
                : s.error && s.pending ? `⚠️ 마지막 백업 실패: ${escapeHtml(s.error)}`
                : s.lastOk ? `마지막 자동 백업: ${new Date(s.lastOk).toLocaleString('ko-KR')} (${ago(s.lastOk)})`
                : '첫 백업을 준비하고 있어요.';
            box.innerHTML = `
                <div class="section-head">
                    <h3>구글 드라이브 자동 백업</h3>
                    <span class="cloud-state ${on ? (s.error && s.pending ? 'is-bad' : 'is-on') : ''}">${on ? (s.error && s.pending ? '확인 필요' : '켜짐') : '꺼짐'}</span>
                </div>
                <p class="hint">저장할 때마다 내 구글 드라이브의 <b>"삶의 기록 앱 백업"</b> 폴더에 자동으로 백업해요.
                    탭을 바꾸거나 브라우저 자료가 지워져도 드라이브에서 다시 불러올 수 있어요.</p>
                <p class="cloud-line ${s.error && s.pending ? 'is-bad' : ''}">${line}</p>
                ${on && !editing ? `
                    <div class="button-row">
                        <button class="btn btn-small" data-cloud="now" type="button">지금 백업</button>
                        <button class="btn btn-small btn-outline" data-cloud="load" type="button">드라이브에서 불러오기</button>
                        <button class="btn-text" data-cloud="edit" type="button">설정 바꾸기</button>
                    </div>` : `
                    <label class="field">웹 앱 주소
                        <input id="cloud-url" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="${escapeHtml(draft.url)}" autocomplete="off">
                    </label>
                    <label class="field">비밀 키 <span class="hint small">(Apps Script 코드의 SECRET 과 같은 글자)</span>
                        <input id="cloud-key" type="password" value="${escapeHtml(draft.key)}" autocomplete="off">
                    </label>
                    <div class="button-row">
                        <button class="btn" data-cloud="connect" type="button">연결하고 켜기</button>
                        ${on ? '<button class="btn btn-outline" data-cloud="cancel" type="button">취소</button><button class="btn-danger-text" data-cloud="off" type="button">자동 백업 끄기</button>' : ''}
                    </div>
                    <details class="cloud-help">
                        <summary>설정 방법 보기</summary>
                        <ol class="tip-list">
                            <li>컴퓨터에서 <b>script.google.com</b> → <b>새 프로젝트</b></li>
                            <li>아래 <b>코드 복사</b>로 복사해 붙여 넣고, 맨 위 <code>SECRET</code> 을 나만 아는 긴 글자로 바꾸기</li>
                            <li><b>배포 → 새 배포 → 웹 앱</b>, 실행: <b>나</b>, 액세스: <b>모든 사용자</b> → 권한 허용</li>
                            <li>나온 <b>웹 앱 URL</b>과 SECRET 글자를 위 칸에 넣고 <b>연결하고 켜기</b></li>
                        </ol>
                        <button class="btn btn-small btn-outline" data-cloud="code" type="button">Apps Script 코드 복사</button>
                    </details>`}
                <p class="hint small">설정은 "하루 하루 삶의 기록"과 "책읽는 삶의 재미"가 함께 써요. 한 앱에서 켜면 다른 앱도 켜져요.</p>`;
        }

        box.addEventListener('input', event => {
            if (event.target.id === 'cloud-url') draft.url = event.target.value;
            if (event.target.id === 'cloud-key') draft.key = event.target.value;
        });

        box.addEventListener('click', async event => {
            const button = event.target.closest('[data-cloud]');
            if (!button) return;
            const action = button.dataset.cloud;
            if (action === 'edit') { editing = true; render(); return; }
            if (action === 'cancel') { editing = false; render(); return; }
            if (action === 'off') {
                const ok = await App.ui.confirmDialog({
                    title: '자동 백업 끄기',
                    bodyHtml: '<p>두 앱 모두 자동 백업을 꺼요. 드라이브에 있는 백업은 지워지지 않아요.</p>',
                    confirmText: '끄기'
                });
                if (!ok) return;
                disconnect();
                editing = false;
                render();
                return;
            }
            if (action === 'code') {
                try {
                    const text = await (await fetch(CODE_URL, { cache: 'no-cache' })).text();
                    await navigator.clipboard.writeText(text);
                    toast('Apps Script 코드를 복사했어요.');
                } catch (err) {
                    toast('복사하지 못했어요. 컴퓨터에서 GitHub 의 apps-script/drive-backup.gs 를 열어 복사해 주세요.');
                }
                return;
            }
            button.disabled = true;
            try {
                if (action === 'connect') {
                    const ok = await connect(draft.url, draft.key);
                    editing = false;
                    toast(ok ? '연결했어요. 이제 저장할 때마다 구글 드라이브에 자동으로 백업해요.' : '연결은 됐지만 첫 백업에 실패했어요. 잠시 뒤 "지금 백업"을 눌러 주세요.');
                }
                if (action === 'now') {
                    toast(await backupNow() ? '구글 드라이브에 백업했어요.' : `백업하지 못했어요: ${status().error}`);
                }
                if (action === 'load') {
                    const result = await load();
                    if (!result.data) toast('드라이브에 아직 이 앱의 백업이 없어요.');
                    else onLoaded(JSON.stringify(result.data));
                }
            } catch (err) {
                toast(err.message);
            } finally {
                button.disabled = false;
                render();
            }
        });

        const stop = onChange(() => (document.body.contains(box) ? render() : stop()));
        render();
    }

    // 앱 시작 때 한 번: 앱 이름과 백업 내용을 만드는 함수를 알려 준다
    function init(name, exportFn) {
        appName = name;
        exporter = exportFn;
        window.addEventListener('online', () => { if (status().pending) backupNow(); });
        document.addEventListener('visibilitychange', () => {
            // 앱을 닫거나 다른 앱으로 갈 때 기다리던 백업을 바로 보낸다
            if (document.visibilityState === 'hidden' && timer) backupNow();
        });
        if (configured() && (status().pending || !status().linked)) setTimeout(backupNow, 2000);
    }

    return { init, schedule, backupNow, connect, disconnect, load, settings, configured, status, summary, onChange, renderCard };
})();
