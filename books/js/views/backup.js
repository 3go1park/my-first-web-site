// 백업 · 복원: 모든 데이터를 파일 하나로 저장하고 다시 불러온다
App.route('/backup', {
    title: '백업 · 복원',
    back: '/',
    render(el) {
        const { formatDate, relativeDay, readFileText, today } = App.util;
        const { icon } = App.ui;
        const store = App.store;

        el.innerHTML = `
            <p class="lead">책 목록, 읽기 기록, 독서 일지는 이 탭 안에만 저장돼요. 앱을 지우거나 브라우저 데이터를 삭제하면 사라지니, 백업 파일을 만들어 안전한 곳에 보관하세요.</p>
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
                    <p class="hint">백업 파일(.json)을 고르면 지금 저장된 내용이 <strong>백업 파일 내용으로 바뀌어요</strong>.</p>
                    <label class="file-drop">
                        <input id="restore" type="file" accept=".json,application/json">
                        ${icon('download')}
                        <span>여기를 눌러 백업 파일을 선택하세요</span>
                    </label>
                    <p id="message" class="message error" hidden></p>
                </section>
            </div>`;

        const download = el.querySelector('#download');
        const share = el.querySelector('#share');
        const restoreInput = el.querySelector('#restore');
        const message = el.querySelector('#message');

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

        restoreInput.addEventListener('change', async () => {
            const file = restoreInput.files[0];
            message.hidden = true;
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
            if (!parsed) return fail('이 앱의 백업 파일이 아니에요. "reading-life-backup-날짜.json" 파일을 골라 주세요.');

            const { next, hasJournal } = parsed;
            const records = Object.keys(next.reading).length;
            const journalText = hasJournal ? `독서 일지 ${next.journal.length}개` : '독서 일지 없음(지금 일지는 그대로 둬요)';
            const when = json.exportedAt ? formatDate(json.exportedAt.slice(0, 10)) + ' 백업' : '백업 파일';
            if (!confirm(`${when}: 책 ${next.books.length}권, 읽기 기록 ${records}개, ${journalText}\n지금 저장된 내용을 이 백업으로 바꿀까요?`)) {
                restoreInput.value = '';
                return;
            }
            store.restore(parsed);
            App.ui.toast(`복원했어요. 책 ${store.books().length}권, 읽기 기록 ${records}개, 독서 일지 ${store.journal().length}개`, { next: true });
            App.router.go('/');
        });

        renderSummary();
    }
});
