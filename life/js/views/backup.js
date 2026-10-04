// 백업 · 복원: 할일과 일기를 파일 하나로 저장하고 다시 불러온다
App.route('/backup', {
    title: '백업 · 복원',
    back: '/',
    render(el) {
        const { formatDate, relativeDay, readFileText, today } = App.util;
        const { icon, confirmDialog } = App.ui;
        const store = App.store;

        el.innerHTML = `
            <p class="lead">할일과 일기는 이 탭 안에만 저장돼요. 앱을 지우거나 브라우저 데이터를 삭제하면 사라지니, 백업 파일을 만들어 안전한 곳에 보관하세요.</p>
            <div class="two-columns">
                <section class="card">
                    <h3>백업하기</h3>
                    <p id="summary" class="hint"></p>
                    <p id="last" class="hint"></p>
                    <button id="download" class="btn btn-primary" type="button">${icon('download')} 백업 파일 저장</button>
                    <button id="share" class="btn btn-outline" type="button" hidden>드라이브·메일 등으로 보내기</button>
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
            App.ui.toast('백업 파일을 저장했어요.');
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
            let json;
            try {
                json = JSON.parse(await readFileText(file));
            } catch (err) {
                return fail('백업 파일을 읽지 못했어요. 이 앱에서 만든 백업 파일(.json)인지 확인해 주세요.');
            }
            const parsed = store.parseBackup(json);
            if (!parsed) return fail('이 앱의 백업 파일이 아니에요. "daily-life-backup-날짜.json" 파일을 골라 주세요.');
            restoreInput.value = '';

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
        });

        renderSummary();
    }
});
