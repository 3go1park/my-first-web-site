// 백업 · 복원: 모든 데이터를 파일 하나로 저장하고 다시 불러온다
App.route('/backup', {
    title: '백업 · 복원',
    back: '/',
    render(el) {
        const { formatDate, relativeDay, readFileText, today } = App.util;
        const { icon } = App.ui;
        const store = App.store;

        el.innerHTML = `
            <p class="lead">책 목록, 읽기 기록, 독서 일지는 이 탭의 브라우저 안에 저장돼요. 브라우저 데이터를 삭제하면 사라지니, 갤탭 폴더 자동 저장을 켜 두거나 백업 파일을 만들어 보관하세요.</p>
            <section id="auto-card" class="card auto-card"></section>
            <div class="two-columns">
                <section class="card">
                    <h3>백업하기</h3>
                    <p id="summary" class="hint"></p>
                    <p id="last" class="hint"></p>
                    <button id="download" class="btn btn-primary" type="button">백업 파일 저장</button>
                    <button id="share" class="btn btn-outline" type="button" hidden>드라이브·메일 등으로 보내기</button>
                    <p class="hint">저장한 파일은 탭의 "내 파일 → 다운로드" 폴더에 있어요. 구글 드라이브 같은 곳에 한 부 더 보관하면 탭을 바꿔도 복원할 수 있어요.</p>
                </section>
                <section class="card">
                    <h3>복원하기</h3>
                    <p class="hint">다른 기기에서 만든 백업 파일(.json)을 고르면, 지금 기록에 <strong>합칠지</strong> 아니면 백업으로 <strong>바꿀지</strong> 고를 수 있어요.</p>
                    <label class="file-drop">
                        <input id="restore" type="file" accept=".json,application/json">
                        ${icon('download')}
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
                <p class="hint">이렇게 하면 두 기기의 기록이 같아져요. 같은 기록을 양쪽에서 고쳤다면 더 나중에 고친 내용이 남아요.</p>
            </section>`;

        const download = el.querySelector('#download');
        const share = el.querySelector('#share');
        const restoreInput = el.querySelector('#restore');
        const message = el.querySelector('#message');
        const planBox = el.querySelector('#restore-plan');

        function renderSummary() {
            const records = store.books().filter(b => store.record(b.id)).length;
            el.querySelector('#summary').textContent =
                `지금 저장된 내용: 책 ${store.books().length}권, 읽기 기록 ${records}개, 독서 일지 ${store.journal().length}개`;
            const last = store.settings().lastBackup;
            el.querySelector('#last').textContent = last ? `마지막 백업: ${formatDate(last)} (${relativeDay(last)})` : '아직 백업한 적이 없어요.';
            download.disabled = store.books().length === 0 && store.journal().length === 0;
        }

        function backupFile() {
            const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' });
            return new File([blob], `reading-life-backup-${today()}.json`, { type: 'application/json' });
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
        share.hidden = !(navigator.canShare && navigator.canShare({ files: [backupFile()] }));
        share.addEventListener('click', async () => {
            try {
                await navigator.share({ files: [backupFile()], title: '책읽는 삶의 재미 백업' });
                store.markBackedUp();
                renderSummary();
            } catch (err) { /* 공유 창을 닫은 경우 */ }
        });

        // 합치면 무엇이 바뀌는지 한 줄씩
        function mergeLines(summary) {
            const lines = [
                [summary.booksAdded, '권 새 책'],
                [summary.booksUpdated, '권 책 정보 갱신'],
                [summary.recordsAdded, '개 새 읽기 기록'],
                [summary.recordsUpdated, '개 읽기 기록 갱신'],
                [summary.entriesAdded, '개 새 독서 일지'],
                [summary.entriesUpdated, '개 독서 일지 갱신'],
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

        // 백업 글자(파일 내용, 폴더의 저장 파일)를 읽어 "합쳐서 복원 / 백업으로 바꾸기"를 보여 준다
        function showPlan(text, fail) {
            planBox.hidden = true;
            let json;
            try {
                json = JSON.parse(text);
            } catch (err) {
                return fail('백업 파일을 읽지 못했어요. 이 앱에서 만든 백업 파일(.json)인지 확인해 주세요.');
            }
            const parsed = store.parseBackup(json);
            if (!parsed) return fail('이 앱의 백업 파일이 아니에요. "reading-life-backup-날짜.json" 파일을 골라 주세요.');

            const { next, hasJournal } = parsed;
            const records = Object.keys(next.reading).length;
            const when = json.exportedAt ? formatDate(json.exportedAt.slice(0, 10)) + ' 백업' : '백업 파일';
            const merged = store.previewMerge(parsed);

            planBox.innerHTML = `
                <p class="plan-title">${when}: 책 ${next.books.length}권, 읽기 기록 ${records}개, ${hasJournal ? `독서 일지 ${next.journal.length}개` : '독서 일지 없음'}</p>
                <div class="restore-option">
                    <h4>합쳐서 복원 <span class="recommend">추천</span></h4>
                    <p class="hint">지금 기록은 그대로 두고, 백업에만 있는 것을 더해요.</p>
                    <ul class="plan-list">${mergeLines(merged.summary)}</ul>
                    <button class="btn btn-primary" data-action="merge" type="button" ${merged.summary.changed ? '' : 'disabled'}>합쳐서 복원</button>
                </div>
                <div class="restore-option">
                    <h4>백업으로 바꾸기</h4>
                    <p class="hint">지금 기록을 모두 지우고 백업 내용으로 바꿔요.${hasJournal ? '' : ' 독서 일지는 지금 것을 그대로 둬요.'}</p>
                    <button class="btn btn-outline" data-action="replace" type="button">백업으로 바꾸기</button>
                </div>`;
            planBox.hidden = false;

            planBox.onclick = event => {
                const action = event.target.dataset.action;
                if (action === 'merge') {
                    store.applyMerge(merged);
                    const s = merged.summary;
                    App.ui.toast(`합쳤어요. 새 책 ${s.booksAdded}권, 새 일지 ${s.entriesAdded}개, 읽기 기록 ${s.recordsAdded + s.recordsUpdated}개 반영`, { next: true });
                    App.router.go('/');
                }
                if (action === 'replace') {
                    if (!confirm('지금 저장된 내용을 모두 지우고 이 백업으로 바꿀까요?')) return;
                    store.restore(parsed);
                    App.ui.toast(`백업으로 바꿨어요. 책 ${store.books().length}권, 읽기 기록 ${records}개, 독서 일지 ${store.journal().length}개`, { next: true });
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

        renderSummary();
    }
});
