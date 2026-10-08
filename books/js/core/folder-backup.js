// 갤탭 폴더 자동 저장. "하루 하루 삶의 기록"과 "책읽는 삶의 재미"가 같은 파일을 쓴다
// (두 앱의 js/core/folder-backup.js 는 똑같이 유지한다).
//
// 처음 한 번 탭의 폴더(예: 내 파일 → 문서 → 삶의기록)를 고르면, 자료를 저장할 때마다(store.save)
// 몇 초 뒤 그 폴더에 백업 파일을 자동으로 쓴다. 브라우저 자료가 지워져도 폴더의 파일은 남는다.
//   daily-life-latest.json / reading-life-latest.json : 가장 최근 상태 ("폴더에서 불러오기"로 읽음)
//   …-YYYY-MM-DD.json            : 날짜별 (그날의 마지막 상태, 90일 지나면 지움)
//   …-before-shrink-시각.json    : 기록 수가 줄어든 저장이 오면 덮어쓰기 전 내용을 따로 남김
// 파일 이름은 영어로 쓴다 (한글 파일 이름을 못 쓰는 저장소가 있음)
//
// 안전 장치: 이 브라우저에서 처음 쓰기 전에는 폴더의 최신 파일을 먼저 "합쳐서 복원"한 뒤 쓴다.
// 그래서 새로 설치한 빈 앱에서 저장해도 폴더의 기록을 덮어 지우지 않는다.
// 폴더 고르기(showDirectoryPicker)를 못 하는 브라우저에서는 대신 "저장할 때마다 다운로드 폴더에
// 백업 파일 받기"를 켤 수 있다 (다운로드는 덮어쓰지 못해 파일이 쌓이므로 폴더 저장을 먼저 권한다).
App.folderBackup = (() => {
    const STATUS_KEY = 'folderbackup.status';
    const DOWNLOAD_KEY = 'downloadbackup.on';    // 다운로드 자동 저장 켜짐 (두 앱이 함께 씀)
    const DB_NAME = 'records-backup';
    const KEEP_DAYS = 90;
    const NAMES = { 'daily-life': 'daily-life', 'books100': 'reading-life' };
    let appName = '';
    let exporter = null;
    let timer = null;
    let running = false;
    let again = false;
    let folder = null;          // 고른 폴더 (IndexedDB 에 보관)
    const listeners = new Set();

    // 안드로이드 앱(APK) 안에서 돌 때: 앱이 주는 AndroidBridge 로 폴더에 쓴다 (한 번 고르면 계속 허락됨)
    const bridge = window.AndroidBridge || null;
    const supported = () => Boolean(bridge) || (typeof window.showDirectoryPicker === 'function' && 'indexedDB' in window);

    // AndroidBridge 를 웹의 폴더(FileSystemDirectoryHandle)처럼 쓸 수 있게 감싼다
    function nativeDir() {
        const name = bridge.folderName();
        if (!name) return null;
        const fail = result => {
            if (result === 'ok') return;
            const err = new Error(result.replace(/^\w+:/, ''));
            err.name = result.startsWith('denied') ? 'NotAllowedError' : 'Error';
            throw err;
        };
        return {
            kind: 'directory',
            name,
            async queryPermission() { return 'granted'; },
            async requestPermission() { return 'granted'; },
            async getFileHandle(file, options = {}) {
                if (!options.create && !bridge.hasFile(file)) {
                    const err = new Error('파일이 없어요');
                    err.name = 'NotFoundError';
                    throw err;
                }
                return {
                    kind: 'file',
                    name: file,
                    async getFile() {
                        const text = bridge.readFile(file);
                        return { text: async () => text };
                    },
                    async createWritable() {
                        let buffer = '';
                        return {
                            async write(chunk) { buffer += chunk; },
                            async close() { fail(bridge.writeFile(file, buffer)); }
                        };
                    }
                };
            },
            async *values() {
                for (const n of JSON.parse(bridge.listFiles())) yield { kind: 'file', name: n };
            },
            async removeEntry(file) { bridge.deleteFile(file); }
        };
    }

    // 앱의 폴더 고르기 창. 고른 폴더 이름을 돌려준다 (취소하면 AbortError)
    function nativePick() {
        return new Promise((resolve, reject) => {
            window.__onNativeFolder = name => {
                window.__onNativeFolder = null;
                if (name) resolve(name);
                else {
                    const err = new Error('취소');
                    err.name = 'AbortError';
                    reject(err);
                }
            };
            bridge.pickFolder();
        });
    }

    // 파일 하나를 "내 파일 → 다운로드"에 저장 (앱 안에서는 AndroidBridge, 브라우저에서는 내려받기)
    function saveFile(name, text) {
        if (bridge) {
            const result = bridge.saveDownload(name, text);
            if (result !== 'ok') throw new Error(result.replace(/^\w+:/, ''));
            return true;
        }
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        return true;
    }
    const prefix = () => NAMES[appName] || appName;

    // ---- 상태 (앱마다) ---------------------------------------------------
    function readJson(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (err) { return fallback; }
    }
    const status = () => readJson(STATUS_KEY, {})[appName] || {};
    function setStatus(patch) {
        const all = readJson(STATUS_KEY, {});
        all[appName] = { ...(all[appName] || {}), ...patch };
        try { localStorage.setItem(STATUS_KEY, JSON.stringify(all)); } catch (err) { /* 공간 부족 */ }
        listeners.forEach(fn => fn());
    }
    function onChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    }

    // ---- 고른 폴더 보관 (IndexedDB, 두 앱이 함께 씀) ------------------------
    function db() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore('kv');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    async function kv(mode, fn) {
        const d = await db();
        return new Promise((resolve, reject) => {
            const req = fn(d.transaction('kv', mode).objectStore('kv'));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    async function getFolder() {
        if (bridge) return nativeDir();
        if (folder) return folder;
        if (!supported()) return null;
        try { folder = (await kv('readonly', s => s.get('folder'))) || null; } catch (err) { folder = null; }
        return folder;
    }
    const connected = () => Boolean(status().folderName);
    const downloadOn = () => !connected() && localStorage.getItem(DOWNLOAD_KEY) === '1';

    function setDownload(on) {
        if (on) localStorage.setItem(DOWNLOAD_KEY, '1');
        else localStorage.removeItem(DOWNLOAD_KEY);
        listeners.forEach(fn => fn());
    }

    // 다운로드 폴더에 백업 파일 받기 (예: daily-life-backup-2026-10-05-143012.json)
    function downloadNow() {
        clearTimeout(timer);
        timer = null;
        try {
            const now = new Date();
            if (App.store.markBackedUp && App.store.settings().lastBackup !== stamp(now)) {
                App.store.markBackedUp();   // 이 저장으로 다시 받기가 예약되지 않게 바로 지운다
                clearTimeout(timer);
                timer = null;
            }
            saveFile(`${prefix()}-backup-${stamp(now, true)}.json`, JSON.stringify(exporter(), null, 1));
            setStatus({ lastDownload: Date.now(), pending: false });
            return true;
        } catch (err) {
            setStatus({ pending: true, error: err.message || String(err) });
            return false;
        }
    }

    async function permission(dir) {
        if (!dir.queryPermission) return 'granted';
        try { return await dir.queryPermission({ mode: 'readwrite' }); } catch (err) { return 'prompt'; }
    }
    // 권한 때문에 실패한 것인지 (폴더 쓰기를 다시 허용해야 함)
    const isPermissionError = err => err && ['NotAllowedError', 'SecurityError'].includes(err.name);

    // ---- 파일 읽기·쓰기 --------------------------------------------------
    async function writeFile(dir, name, text) {
        const handle = await dir.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
    }
    async function readFile(dir, name) {
        try {
            const handle = await dir.getFileHandle(name);
            return await (await handle.getFile()).text();
        } catch (err) {
            if (isPermissionError(err)) throw err;
            return null;   // 아직 없음
        }
    }
    // 백업 안의 목록(할일, 일기, 책, 일지 …) 개수
    function countRecords(backup) {
        const data = (backup && backup.data) || {};
        return Object.keys(data).reduce((n, k) => n + (Array.isArray(data[k]) ? data[k].length
            : k === 'reading' && data[k] && typeof data[k] === 'object' ? Object.keys(data[k]).length : 0), 0);
    }
    const pad = n => String(n).padStart(2, '0');
    function stamp(d, withTime) {
        const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        return withTime ? `${day}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}` : day;
    }
    async function prune(dir) {
        if (!dir.values) return;
        const limit = stamp(new Date(Date.now() - KEEP_DAYS * 86400000));
        const pattern = new RegExp(`^${prefix()}-(?:before-shrink-)?(\\d{4}-\\d{2}-\\d{2})`);
        for await (const entry of dir.values()) {
            const m = entry.kind === 'file' && entry.name.match(pattern);
            if (m && m[1] < limit && dir.removeEntry) await dir.removeEntry(entry.name);
        }
    }

    // 폴더의 최신 파일을 지금 자료에 합친다. 합친 내용이 있으면 true
    function mergeText(text) {
        if (!text) return false;
        let json;
        try { json = JSON.parse(text); } catch (err) { return false; }
        const parsed = App.store.parseBackup(json);
        if (!parsed) return false;
        const merged = App.store.previewMerge(parsed);
        if (!merged.summary.changed) return false;
        App.store.applyMerge(merged);
        return true;
    }

    function refreshScreen() {
        const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        if (!typing) App.router.render();
    }

    // ---- 저장 --------------------------------------------------------------
    async function backupNow() {
        if (!appName || !connected()) return false;
        if (running) { again = true; return false; }
        running = true;
        clearTimeout(timer);
        timer = null;
        try {
            const dir = await getFolder();
            if (!dir) throw new Error('고른 폴더를 찾지 못했어요. 폴더를 다시 골라 주세요');
            // 브라우저가 "다시 물어봄" 상태라고 해도 실제로는 쓸 수 있는 경우가 있어 일단 써 본다.
            // 권한 때문에 실패하면 그때 "다시 허용하기"를 안내한다.
            await permission(dir);
            const latestName = `${prefix()}-latest.json`;
            const oldText = await readFile(dir, latestName);
            if (!status().linked) {
                // 이 브라우저에서 처음: 폴더의 기록을 먼저 합친다
                if (mergeText(oldText)) {
                    App.ui.toast('폴더에 저장된 기록을 이 앱 기록에 합쳤어요.');
                    refreshScreen();
                }
                setStatus({ linked: true });
            }
            const now = new Date();
            // 백업 날짜 표시도 함께 남긴다 (이 저장으로 다시 저장이 예약되지 않게 바로 지움)
            if (App.store.markBackedUp && App.store.settings().lastBackup !== stamp(now)) {
                App.store.markBackedUp();
                clearTimeout(timer);
                timer = null;
            }
            const backup = exporter();
            const text = JSON.stringify(backup, null, 1);
            if (oldText) {
                let old = null;
                try { old = JSON.parse(oldText); } catch (err) { /* 깨진 파일 */ }
                if (!old || countRecords(old) > countRecords(backup)) {
                    await writeFile(dir, `${prefix()}-before-shrink-${stamp(now, true)}.json`, oldText);
                }
            }
            await writeFile(dir, latestName, text);
            await writeFile(dir, `${prefix()}-${stamp(now)}.json`, text);
            if (status().prunedOn !== stamp(now)) {
                await prune(dir).catch(() => {});
                setStatus({ prunedOn: stamp(now) });
            }
            setStatus({ lastOk: Date.now(), pending: false, needsPermission: false, needsRepick: false, error: '' });
            return true;
        } catch (err) {
            const hadChanges = status().pending;
            if (isPermissionError(err)) {
                setStatus({ pending: true, needsPermission: true, error: '폴더에 저장하도록 다시 허용해 주세요', lastTry: Date.now() });
            } else {
                setStatus({ pending: true, error: `${err.name || ''} ${err.message || err}`.trim(), lastTry: Date.now() });
            }
            // 폴더에 못 쓰면 바뀐 기록을 다운로드 폴더에라도 백업 파일로 남긴다
            if (hadChanges && downloadNow()) setStatus({ fallbackAt: Date.now() });
            return false;
        } finally {
            running = false;
            if (again) { again = false; schedule(1000); }
        }
    }

    // 자료를 저장할 때마다 부른다 (store.save). 잇달아 저장하면 마지막 것 한 번만 쓴다.
    function schedule(delay = 2000) {
        if (appName && downloadOn()) {
            // 잇달아 고치는 동안은 기다렸다가 마지막에 한 번만 받는다
            clearTimeout(timer);
            timer = setTimeout(downloadNow, 5000);
            return;
        }
        if (!appName || !connected()) return;
        if (!status().pending) setStatus({ pending: true });
        clearTimeout(timer);
        timer = setTimeout(backupNow, delay);
    }

    // 폴더 고르기 (버튼을 누를 때만 부를 수 있음)
    async function chooseFolder() {
        let dir;
        if (bridge) {
            await nativePick();
            dir = nativeDir();
            if (!dir) throw new Error('폴더에 쓸 허락을 받지 못했어요. 다시 골라 주세요');
        } else {
            dir = await window.showDirectoryPicker({ id: 'records-backup', mode: 'readwrite', startIn: 'documents' });
            folder = dir;
            await kv('readwrite', s => s.put(dir, 'folder'));
        }
        // 다른 앱(같은 탭의 책 앱 등)도 이 폴더를 쓰도록 이름을 남긴다
        const all = readJson(STATUS_KEY, {});
        Object.keys(NAMES).forEach(name => { all[name] = { ...(all[name] || {}), folderName: dir.name, linked: name === appName ? false : (all[name] || {}).linked && (all[name] || {}).folderName === dir.name }; });
        try { localStorage.setItem(STATUS_KEY, JSON.stringify(all)); } catch (err) { /* 공간 부족 */ }
        return backupNow();
    }

    // 다시 허용 (버튼을 누를 때만 부를 수 있음)
    // 버튼을 누른 그 순간에만 브라우저가 허용 창을 띄워 준다. 그래서 다른 기다림 없이 바로 묻는다.
    // 허용 창을 못 띄우는 브라우저면 같은 폴더를 다시 고르게 한다 (고르면 권한이 다시 생김).
    async function allowAgain() {
        const dir = folder || await getFolder();
        if (!dir) return chooseFolder();
        if (!dir.requestPermission) return chooseFolder();
        let result = 'denied';
        try { result = await dir.requestPermission({ mode: 'readwrite' }); } catch (err) { result = 'denied'; }
        if (result !== 'granted') {
            setStatus({ needsPermission: true, needsRepick: true });
            return false;
        }
        return backupNow();
    }

    async function stop() {
        localStorage.removeItem(DOWNLOAD_KEY);
        try { await kv('readwrite', s => s.delete('folder')); } catch (err) { /* 무시 */ }
        folder = null;
        localStorage.removeItem(STATUS_KEY);
        clearTimeout(timer);
        listeners.forEach(fn => fn());
    }

    // 폴더의 최신 파일 글자 (없으면 null)
    async function loadText() {
        const dir = await getFolder();
        if (!dir) throw new Error('고른 폴더가 없어요');
        if (await permission(dir) !== 'granted' && dir.requestPermission) {
            try { await dir.requestPermission({ mode: 'readwrite' }); } catch (err) { /* 그래도 읽어 본다 */ }
        }
        try {
            return await readFile(dir, `${prefix()}-latest.json`);
        } catch (err) {
            setStatus({ needsPermission: true, needsRepick: true });
            throw new Error('폴더를 읽을 권한이 없어요. "같은 폴더 다시 고르기"를 눌러 주세요');
        }
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
        if (downloadOn()) {
            const last = status().lastDownload;
            return last ? { text: `자동 다운로드 ${ago(last)}`, bad: false, lastOk: last } : { text: '자동 다운로드 대기 중', bad: false };
        }
        if (!connected()) return null;
        const s = status();
        if (s.needsPermission && s.fallbackAt) return { text: `다운로드에 백업 ${ago(s.fallbackAt)}`, bad: true, lastOk: s.fallbackAt };
        if (s.needsPermission) return { text: '폴더 저장 허용 필요', bad: true };
        if (s.error && s.pending) return { text: '폴더 저장 실패', bad: true };
        if (s.lastOk) return { text: `폴더 저장 ${ago(s.lastOk)}`, bad: false, lastOk: s.lastOk };
        return { text: '폴더 저장 대기 중', bad: false };
    }

    // 백업 화면의 "갤탭 폴더에 자동 저장" 카드. onLoaded(백업 글자)는 복원 화면을 띄운다.
    function renderCard(box, { onLoaded }) {
        const { escapeHtml } = App.util;
        const { toast } = App.ui;

        // 폴더 저장을 못 하거나 꺼져 있을 때: 저장할 때마다 다운로드 폴더에 백업 파일 받기
        function downloadHtml() {
            const on = downloadOn();
            const last = status().lastDownload;
            return `
                <div class="auto-download">
                    <div class="section-head">
                        <h4>저장할 때마다 다운로드 폴더에 백업 파일 받기</h4>
                        <span class="auto-state ${on ? 'is-on' : ''}">${on ? '켜짐' : '꺼짐'}</span>
                    </div>
                    <p class="hint small">저장하고 몇 초 뒤 "내 파일 → 다운로드"에 백업 파일을 받아요.
                        다운로드는 덮어쓰지 못해서 <b>저장할 때마다 파일이 하나씩 쌓여요</b> (가끔 오래된 것을 지워 주세요).
                        처음에 크롬이 "여러 파일 다운로드"를 물어보면 <b>허용</b>을 눌러 주세요.</p>
                    ${on && last ? `<p class="auto-line">마지막으로 받은 때: ${new Date(last).toLocaleString('ko-KR')} (${ago(last)})</p>` : ''}
                    <div class="button-row">
                        ${on ? '<button class="btn btn-small" data-auto="download-now" type="button">지금 받기</button><button class="btn-danger-text" data-auto="download-off" type="button">끄기</button>'
                            : '<button class="btn btn-small btn-outline" data-auto="download-on" type="button">켜기</button>'}
                    </div>
                </div>`;
        }

        function render() {
            if (!document.body.contains(box)) return;
            if (!supported()) {
                box.innerHTML = `
                    <h3>갤탭에 자동 저장</h3>
                    <p class="auto-line">이 브라우저는 탭의 폴더를 골라 직접 쓰는 기능을 지원하지 않아요. 대신 아래 방법을 켜 두세요.</p>
                    ${downloadHtml()}`;
                return;
            }
            const on = connected();
            const s = status();
            const bad = s.needsPermission || (s.error && s.pending);
            const line = !on ? '꺼져 있어요. 저장할 폴더를 한 번 고르면 켜져요.'
                : s.needsRepick ? `⚠️ 허용 창이 뜨지 않았어요. <b>같은 폴더 다시 고르기</b>를 눌러 "${escapeHtml(s.folderName || '')}" 폴더를 한 번 더 골라 주세요. 기록은 그대로예요.`
                : s.needsPermission ? '⚠️ 폴더에 저장하도록 다시 허용해 주세요. 아래 버튼을 누르고 <b>허용</b>을 눌러 주세요.'
                : s.error && s.pending ? `⚠️ 마지막 저장 실패: ${escapeHtml(s.error)}`
                : s.lastOk ? `마지막 저장: ${new Date(s.lastOk).toLocaleString('ko-KR')} (${ago(s.lastOk)})`
                : '첫 저장을 준비하고 있어요.';
            box.innerHTML = `
                <div class="section-head">
                    <h3>갤탭 폴더에 자동 저장</h3>
                    <span class="auto-state ${on ? (bad ? 'is-bad' : 'is-on') : ''}">${on ? (bad ? '확인 필요' : '켜짐') : '꺼짐'}</span>
                </div>
                <p class="hint">저장할 때마다 탭의 폴더에 백업 파일을 자동으로 써요. 브라우저 자료가 지워지거나 앱을 다시 설치해도
                    폴더의 파일은 남아서 다시 불러올 수 있어요.</p>
                <p class="auto-line ${bad ? 'is-bad' : ''}">${on ? `폴더: <b>${escapeHtml(s.folderName || '')}</b> · ` : ''}${line}</p>
                ${on && bad && s.fallbackAt ? `<p class="hint small">대신 저장할 때마다 <b>"내 파일 → 다운로드"</b>에 백업 파일을 받고 있어요
                    (마지막: ${new Date(s.fallbackAt).toLocaleString('ko-KR')}). 기록은 안전해요.</p>` : ''}
                <div class="button-row">
                    ${!on ? '<button class="btn" data-auto="choose" type="button">저장할 폴더 고르기</button>' : ''}
                    ${on && s.needsPermission && !s.needsRepick ? '<button class="btn" data-auto="allow" type="button">다시 허용하기</button>' : ''}
                    ${on && s.needsRepick ? '<button class="btn" data-auto="choose" type="button">같은 폴더 다시 고르기</button>' : ''}
                    ${on && !s.needsPermission ? '<button class="btn btn-small" data-auto="now" type="button">지금 저장</button>' : ''}
                    ${on ? '<button class="btn btn-small btn-outline" data-auto="load" type="button">폴더에서 불러오기</button>' : ''}
                    ${on ? '<button class="btn-text" data-auto="choose" type="button">폴더 바꾸기</button><button class="btn-danger-text" data-auto="stop" type="button">끄기</button>' : ''}
                </div>
                ${!on ? `<p class="hint small">폴더 고르기 화면에서 <b>내 파일(내장 저장공간) → Documents</b> 등에 <b>새 폴더(예: 삶의기록)</b>를 만들고
                    <b>이 폴더 사용 → 허용</b>을 누르세요. "하루 하루 삶의 기록"과 "책읽는 삶의 재미"가 같은 폴더를 함께 써요.</p>` : ''}
                ${!on ? `<details class="auto-more"${downloadOn() ? ' open' : ''}><summary>폴더 고르기가 안 되나요?</summary>${downloadHtml()}</details>` : ''}`;
        }

        box.addEventListener('click', async event => {
            const button = event.target.closest('[data-auto]');
            if (!button) return;
            const action = button.dataset.auto;
            if (action === 'stop') {
                const ok = await App.ui.confirmDialog({
                    title: '폴더 자동 저장 끄기',
                    bodyHtml: '<p>두 앱 모두 폴더 자동 저장을 꺼요. 폴더에 있는 파일은 지워지지 않아요.</p>',
                    confirmText: '끄기'
                });
                if (ok) await stop();
                render();
                return;
            }
            if (action === 'download-on') {
                setDownload(true);
                toast(downloadNow() ? '켰어요. 지금 백업 파일을 받았어요. 다운로드 폴더를 확인해 주세요.' : '백업 파일을 받지 못했어요.');
                render();
                return;
            }
            if (action === 'download-off') { setDownload(false); render(); return; }
            if (action === 'download-now') {
                toast(downloadNow() ? '백업 파일을 받았어요. 다운로드 폴더를 확인해 주세요.' : '백업 파일을 받지 못했어요.');
                render();
                return;
            }
            button.disabled = true;
            try {
                if (action === 'choose') {
                    toast(await chooseFolder() ? '폴더에 저장했어요. 이제 저장할 때마다 이 폴더에 자동으로 저장해요.' : `저장하지 못했어요: ${status().error}`);
                }
                if (action === 'allow') {
                    const ok = await allowAgain();
                    toast(ok ? '다시 허용했어요. 폴더에 저장했어요.'
                        : status().needsRepick ? '같은 폴더 다시 고르기를 눌러 주세요.' : `저장하지 못했어요: ${status().error}`);
                }
                if (action === 'now') toast(await backupNow() ? '폴더에 저장했어요.' : `저장하지 못했어요: ${status().error}`);
                if (action === 'load') {
                    const text = await loadText();
                    if (!text) toast('폴더에 아직 이 앱의 저장 파일이 없어요.');
                    else onLoaded(text);
                }
            } catch (err) {
                if (err && err.name === 'AbortError') return;   // 폴더 고르기를 취소함
                toast(err.message || String(err));
            } finally {
                button.disabled = false;
                render();
            }
        });

        const stopListening = onChange(() => (document.body.contains(box) ? render() : stopListening()));
        render();
    }

    // 앱 시작 때 한 번: 앱 이름과 백업 내용을 만드는 함수를 알려 준다
    function init(name, exportFn) {
        appName = name;
        exporter = exportFn;
        document.addEventListener('visibilitychange', () => {
            // 앱을 닫거나 다른 앱으로 갈 때 기다리던 저장을 바로 한다
            if (document.visibilityState === 'hidden' && timer) {
                if (downloadOn()) downloadNow();
                else backupNow();
            }
        });
        if (connected() && (status().pending || !status().linked)) setTimeout(backupNow, 1500);
    }

    // 안드로이드 앱에서 아직 폴더를 고르지 않았으면 홈 화면에 안내를 띄운다
    function renderNativePrompt(box) {
        if (!box || !bridge || connected()) return;
        box.innerHTML = `
            <section class="card native-prompt">
                <div class="native-text">
                    <strong>기록을 갤탭 폴더에 자동 저장하세요</strong>
                    <span class="hint small">폴더를 한 번만 고르면, 저장할 때마다 그 폴더에 백업 파일이 저장돼요.
                        예전에 쓰던 "삶의 기록" 폴더를 고르면 그 안의 기록도 이 앱으로 가져와요.</span>
                </div>
                <button class="btn" type="button" data-native-pick>폴더 고르기</button>
            </section>`;
        box.querySelector('[data-native-pick]').addEventListener('click', async () => {
            try {
                App.ui.toast(await chooseFolder() ? '폴더를 골랐어요. 이제 저장할 때마다 자동으로 저장해요.' : `저장하지 못했어요: ${status().error}`);
                box.innerHTML = '';
                App.router.render();
            } catch (err) {
                if (err.name !== 'AbortError') App.ui.toast(err.message || String(err));
            }
        });
    }

    const isNative = () => Boolean(bridge);

    // 안드로이드 앱이 직접 글자 파일을 고르고 읽어 준다 (웹 화면의 파일 고르기가 갤탭에서 잘 안 되어서)
    const canPickText = () => Boolean(bridge && typeof bridge.pickTextFile === 'function');
    function readPicked() {
        const raw = bridge.takePickedFile();
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (err) { return { error: '고른 파일을 읽지 못했어요' }; }
    }
    // keepKey 를 주면 받은 파일을 그 이름으로 sessionStorage 에 바로 남긴다 (화면이 다시 그려져도 쓰도록)
    function pickTextFile(keepKey) {
        return new Promise((resolve, reject) => {
            window.__onNativeFile = () => {
                window.__onNativeFile = null;
                const picked = readPicked();
                if (keepKey && picked && picked.text) {
                    try { sessionStorage.setItem(keepKey, JSON.stringify({ name: picked.name, text: picked.text })); } catch (err) { /* 무시 */ }
                }
                if (!picked) return reject(new Error('파일을 받지 못했어요. 다시 골라 주세요'));
                if (picked.cancel) {
                    const err = new Error('취소');
                    err.name = 'AbortError';
                    return reject(err);
                }
                if (picked.error) return reject(new Error(picked.error));
                return resolve(picked);
            };
            bridge.pickTextFile();
        });
    }
    // 파일을 고르는 동안 앱이 다시 시작된 경우: 화면이 열릴 때 남아 있는 파일을 가져간다
    function takePendingFile() {
        if (!canPickText()) return null;
        const picked = readPicked();
        return picked && picked.text ? picked : null;
    }

    return { init, schedule, backupNow, supported, connected, status, summary, onChange, renderCard, renderNativePrompt, saveFile, isNative, canPickText, pickTextFile, takePendingFile };
})();
