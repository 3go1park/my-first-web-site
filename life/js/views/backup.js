// 백업 · 복원: 할일과 일기를 파일 하나로 저장하고 다시 불러온다
App.route('/backup', {
    title: '백업 · 복원',
    back: '/',
    render(el) {
        const { formatDate, relativeDay, readFileText, today } = App.util;
        const { icon, confirmDialog } = App.ui;
        const store = App.store;

        el.innerHTML = `
            <p class="lead">할일과 일기는 이 탭의 브라우저 안에 저장돼요. 브라우저 데이터를 삭제하면 사라지니, 갤탭 폴더 자동 저장을 켜 두거나 백업 파일을 만들어 보관하세요.</p>
            <section id="auto-card" class="card auto-card"></section>
            <div class="two-columns">
                <section class="card">
                    <h3>백업하기</h3>
                    <p id="summary" class="hint"></p>
                    <p id="last" class="hint"></p>
                    <button id="download" class="btn btn-primary" type="button">${icon('download')} 백업 파일 저장</button>
                    <button id="share" class="btn btn-outline" type="button" hidden>드라이브·메일 등으로 보내기</button>
                    <button id="copy" class="btn btn-outline" type="button">백업 내용 복사 (파일 없이 옮기기)</button>
                    <textarea id="copy-box" class="copy-box" rows="4" readonly hidden></textarea>
                    <p id="copy-hint" class="hint small" hidden>위 글을 길게 눌러 <b>모두 선택 → 복사</b>한 뒤, 옮길 곳의 "붙여 넣어 복원"에 붙여 넣으세요.</p>
                    <p class="hint">저장한 파일은 탭의 "내 파일 → 다운로드" 폴더에 있어요. 구글 드라이브 같은 곳에 한 부 더 보관하면 탭을 바꿔도 복원할 수 있어요.</p>
                </section>
                <section class="card">
                    <h3>복원하기</h3>
                    <p class="hint">백업 파일(.json)을 고르면, 지금 기록에 <strong>합칠지</strong> 아니면 백업으로 <strong>바꿀지</strong> 고를 수 있어요.</p>
                    <label class="file-drop">
                        <input id="restore" type="file" accept=".json,application/json">
                        ${icon('save')}
                        <span>여기를 눌러 백업 파일을 선택하세요</span>
                    </label>
                    <details class="paste-restore">
                        <summary>백업 파일이 없나요? 복사한 백업 내용을 붙여 넣어 복원</summary>
                        <textarea id="paste-box" class="copy-box" rows="4" placeholder="여기에 길게 눌러 붙여 넣기"></textarea>
                        <button id="paste-restore" class="btn btn-outline" type="button">붙여 넣은 내용으로 복원</button>
                    </details>
                    <p id="message" class="message error" hidden></p>
                    <div id="restore-plan" class="restore-plan" hidden></div>
                </section>
            </div>
            <section class="card tip-card">
                <h3>두 기기의 기록을 맞추는 방법</h3>
                <ol class="tip-list">
                    <li>기기 A에서 <b>백업 파일 저장</b> → 파일을 기기 B로 보내기 (카카오톡, 드라이브 등)</li>
                    <li>기기 B에서 그 파일로 <b>합쳐서 복원</b></li>
                    <li>기기 B에서 다시 <b>백업 파일 저장</b> → 기기 A에서 <b>합쳐서 복원</b></li>
                </ol>
                <p class="hint">같은 기록을 양쪽에서 고쳤다면 더 나중에 고친 내용이 남아요. 같은 날 일기를 양쪽에서 따로 썼다면 두 글을 이어 붙여요.</p>
            </section>`;

        const $ = sel => el.querySelector(sel);
        const download = $('#download');
        const share = $('#share');
        const restoreInput = $('#restore');
        const message = $('#message');
        const planBox = $('#restore-plan');

        function renderSummary() {
            $('#summary').textContent = `지금 저장된 내용: 할일 ${store.todos().length}개, 일기 ${store.diary().length}편`;
            const last = store.settings().lastBackup;
            $('#last').textContent = last ? `마지막 백업: ${formatDate(last)} (${relativeDay(last)})` : '아직 백업한 적이 없어요.';
            download.disabled = store.todos().length === 0 && store.diary().length === 0;
        }

        function backupFile() {
            const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' });
            return new File([blob], `daily-life-backup-${today()}.json`, { type: 'application/json' });
        }

        download.addEventListener('click', () => {
            if (window.AndroidBridge && App.folderBackup) {
                // 안드로이드 앱 안: 앱이 "내 파일 → 다운로드"에 바로 저장한다
                const file = backupFile();
                file.text().then(text => {
                    try {
                        App.folderBackup.saveFile(file.name, text);
                        store.markBackedUp();
                        renderSummary();
                        App.ui.toast(`"내 파일 → 다운로드"에 ${file.name} 을(를) 저장했어요.`);
                    } catch (err) {
                        App.ui.toast(`저장하지 못했어요: ${err.message}`);
                    }
                });
                return;
            }
            const file = backupFile();
            const url = URL.createObjectURL(file);
            const link = document.createElement('a');
            link.href = url;
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            store.markBackedUp();
            renderSummary();
            // 앱 안의 브라우저 등에서는 내려받기가 조용히 막힐 수 있어 확인을 부탁한다
            App.ui.toast('백업 파일 내려받기를 시작했어요. "내 파일 → 다운로드"에 파일이 있는지 꼭 확인하세요.');
        });

        // 파일 없이 옮기기: 백업 내용을 글자로 복사한다
        el.querySelector('#copy').addEventListener('click', async () => {
            const text = JSON.stringify(store.exportData());
            const box = el.querySelector('#copy-box');
            try {
                await navigator.clipboard.writeText(text);
                store.markBackedUp();
                renderSummary();
                App.ui.toast('백업 내용을 복사했어요. 옮길 곳의 "붙여 넣어 복원"에 붙여 넣으세요.');
            } catch (err) {
                // 복사가 막히면 글을 보여 주고 직접 복사하게 한다
                box.value = text;
                box.hidden = false;
                el.querySelector('#copy-hint').hidden = false;
                box.focus();
                box.select();
            }
        });

        // 탭의 공유 기능(드라이브, 메일, 카카오톡 등)으로 바로 보내기
        try {
            share.hidden = !(navigator.canShare && navigator.canShare({ files: [backupFile()] }));
        } catch (err) { share.hidden = true; }
        share.addEventListener('click', async () => {
            try {
                await navigator.share({ files: [backupFile()], title: '하루 하루 삶의 기록 백업' });
                store.markBackedUp();
                renderSummary();
            } catch (err) { /* 공유 창을 닫은 경우 */ }
        });

        function mergeLines(summary) {
            const lines = [
                [summary.todosAdded, '개 새 할일'],
                [summary.todosUpdated, '개 할일 갱신'],
                [summary.diaryAdded, '편 새 일기'],
                [summary.diaryUpdated, '편 일기 갱신'],
                [summary.removed, '개 다른 기기에서 지운 항목 반영']
            ].filter(([n]) => n > 0);
            return lines.length
                ? lines.map(([n, text]) => `<li><b>${n}</b>${text}</li>`).join('')
                : '<li>더할 새 내용이 없어요. 두 기기의 기록이 이미 같아요.</li>';
        }

        restoreInput.addEventListener('change', async () => {
            const file = restoreInput.files[0];
            message.hidden = true;
            planBox.hidden = true;
            if (!file) return;
            const fail = text => {
                message.textContent = text;
                message.hidden = false;
                restoreInput.value = '';
            };
            let text;
            try {
                text = await readFileText(file);
            } catch (err) {
                return fail('백업 파일을 읽지 못했어요. 이 앱에서 만든 백업 파일(.json)인지 확인해 주세요.');
            }
            restoreInput.value = '';
            showPlan(text, fail);
        });

        el.querySelector('#paste-restore').addEventListener('click', () => {
            message.hidden = true;
            planBox.hidden = true;
            const text = el.querySelector('#paste-box').value.trim();
            const fail = t => { message.textContent = t; message.hidden = false; };
            if (!text) return fail('복사한 백업 내용을 먼저 붙여 넣어 주세요.');
            showPlan(text, fail);
        });

        // 백업 글자를 읽어 "합쳐서 복원 / 백업으로 바꾸기"를 보여 준다
        function showPlan(text, fail) {
            let json;
            try {
                json = JSON.parse(text);
            } catch (err) {
                return fail('백업 내용을 읽지 못했어요. 이 앱에서 만든 백업 파일이나 복사한 백업 내용인지 확인해 주세요.');
            }
            const parsed = store.parseBackup(json);
            if (!parsed) return fail('이 앱의 백업이 아니에요. "daily-life-backup-날짜.json" 파일이나 "백업 내용 복사"로 복사한 내용을 써 주세요.');

            const { next } = parsed;
            const when = json.exportedAt ? formatDate(json.exportedAt.slice(0, 10)) + ' 백업' : '백업 파일';
            const merged = store.previewMerge(parsed);

            planBox.innerHTML = `
                <p class="plan-title">${when}: 할일 ${next.todos.length}개, 일기 ${next.diary.length}편</p>
                <div class="restore-option">
                    <h4>합쳐서 복원 <span class="recommend">추천</span></h4>
                    <p class="hint">지금 기록은 그대로 두고, 백업에만 있는 것을 더해요.</p>
                    <ul class="plan-list">${mergeLines(merged.summary)}</ul>
                    <button class="btn btn-primary" data-action="merge" type="button" ${merged.summary.changed ? '' : 'disabled'}>합쳐서 복원</button>
                </div>
                <div class="restore-option">
                    <h4>백업으로 바꾸기</h4>
                    <p class="hint">지금 기록을 모두 지우고 백업 내용으로 바꿔요.</p>
                    <button class="btn btn-outline" data-action="replace" type="button">백업으로 바꾸기</button>
                </div>`;
            planBox.hidden = false;

            planBox.onclick = async event => {
                const action = event.target.dataset.action;
                if (action === 'merge') {
                    store.applyMerge(merged);
                    const s = merged.summary;
                    App.ui.toast(`합쳤어요. 새 할일 ${s.todosAdded}개, 새 일기 ${s.diaryAdded}편 반영`, { next: true });
                    App.router.go('/');
                }
                if (action === 'replace') {
                    const ok = await confirmDialog({
                        title: '백업으로 바꾸기',
                        bodyHtml: `<p>지금 저장된 할일 ${store.todos().length}개, 일기 ${store.diary().length}편을 모두 지우고 이 백업으로 바꿀까요?</p>`,
                        confirmText: '바꾸기',
                        danger: true
                    });
                    if (!ok) return;
                    store.restore(parsed);
                    App.ui.toast(`백업으로 바꿨어요. 할일 ${store.todos().length}개, 일기 ${store.diary().length}편`, { next: true });
                    App.router.go('/');
                }
            };
        }

        // 갤탭 폴더 자동 저장 카드. "폴더에서 불러오기"는 파일 복원과 같은 화면으로
        if (!App.folderBackup) {
            el.querySelector('#auto-card').innerHTML = `<h3>갤탭에 자동 저장</h3>
                <p class="hint">자동 저장 기능을 불러오지 못했어요. 인터넷에 연결된 상태에서 새로고침해 주세요.</p>
                <div class="button-row"><button class="btn btn-small" type="button" onclick="location.reload()">새로고침</button></div>`;
        } else App.folderBackup.renderCard(el.querySelector('#auto-card'), {
            onLoaded(text) {
                message.hidden = true;
                showPlan(text, t => { message.textContent = t; message.hidden = false; });
                planBox.scrollIntoView({ block: 'center' });
            }
        });


        // 안드로이드 앱 안에서는 앱이 직접 파일을 골라 읽어 준다.
        // 고른 파일은 복원하거나 다른 파일을 고를 때까지 sessionStorage 에 두어,
        // 앱으로 돌아오며 화면이 다시 그려져도 고른 파일과 복원 화면을 다시 보여 준다.
        const nativeFiles = App.folderBackup && App.folderBackup.canPickText();
        const PICKED_KEY = 'restore.picked';
        const failRestore = t => { message.textContent = t; message.hidden = false; };
        function showPicked(picked) {
            let line = el.querySelector('#picked-file');
            if (!line) {
                line = document.createElement('p');
                line.id = 'picked-file';
                line.className = 'picked-file';
                el.querySelector('.file-drop').after(line);
            }
            const kb = Math.max(1, Math.round((picked.text || '').length / 1024));
            line.innerHTML = `고른 파일: <b>${App.util.escapeHtml(picked.name || '이름 없음')}</b> (${kb}KB)`;
        }
        function planFromPicked(picked) {
            message.hidden = true;
            showPicked(picked);
            try {
                showPlan(picked.text, failRestore);
            } catch (err) {
                failRestore(`복원 화면을 열지 못했어요: ${err.message}`);
            }
            const target = planBox.hidden ? message : planBox;
            if (!target.hidden) requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }));
        }
        function keepPicked(picked) {
            try { sessionStorage.setItem(PICKED_KEY, JSON.stringify({ name: picked.name, text: picked.text })); } catch (err) { /* 무시 */ }
        }
        // 복원(합치기·바꾸기)을 누르면 고른 파일을 잊는다
        planBox.addEventListener('click', event => {
            if (event.target.closest('[data-action]')) sessionStorage.removeItem(PICKED_KEY);
        }, true);
        if (nativeFiles) {
            el.querySelector('.file-drop').addEventListener('click', async event => {
                event.preventDefault();
                try {
                    const picked = await App.folderBackup.pickTextFile(PICKED_KEY);
                    planFromPicked(picked);
                } catch (err) {
                    if (err.name !== 'AbortError') failRestore(err.message);
                }
            });
            const pending = App.folderBackup.takePendingFile();
            if (pending) keepPicked(pending);
            let kept = null;
            try { kept = JSON.parse(sessionStorage.getItem(PICKED_KEY) || 'null'); } catch (err) { kept = null; }
            if (kept && kept.text) planFromPicked(kept);
        }

        renderSummary();
    }
});
