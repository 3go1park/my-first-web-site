// 책 목록 업로드: CSV를 읽어 새 책·갱신·빠진 책을 보여 주고, 합치거나 바꾼다
App.route('/books/upload', {
    title: '책 목록 업로드',
    back: '/books',
    render(el) {
        const { parseCsv, readFileText, escapeHtml } = App.util;
        const { icon } = App.ui;
        const store = App.store;

        // 한글 항목 이름 → 저장할 때 쓰는 이름
        const COLUMNS = {
            '번호': 'no', '제목': 'title', '원제': 'originalTitle', '저자': 'author', '출판사': 'publisher',
            '출간연도': 'year', '장르': 'genre', '국가': 'country', '쪽수': 'pages', '한줄소개': 'summary',
            '시작일': 'start', '완료예정일': 'due', '완료일': 'done', '별점': 'rating'
        };

        el.innerHTML = `
            <div class="two-columns">
                <section class="card">
                    <h3>파일 올리기</h3>
                    <label class="file-drop">
                        <input id="file-input" type="file" accept=".csv,text/csv">
                        ${icon('upload')}
                        <span>여기를 눌러 CSV 파일을 선택하세요</span>
                    </label>
                    <p id="message" class="message error" hidden></p>
                    <div id="plan" hidden></div>
                </section>
                <section class="card">
                    <h3>양식 파일</h3>
                    <p class="hint">첫 줄의 항목 이름은 그대로 두고, 둘째 줄부터 책을 한 줄에 한 권씩 채워 주세요.</p>
                    <p class="hint">항목: ${Object.keys(COLUMNS).join(', ')}<br>(제목과 저자는 꼭 필요해요)</p>
                    <p class="hint">이미 다 읽은 책은 <b>완료일</b>만 적어도 <b>읽기 완료</b>가 돼요. 날짜는 2026-09-26 또는 2026.9.26 처럼 적어 주세요.</p>
                    <p class="hint">이미 있는 책(제목·저자가 같은 책)은 새로 추가하지 않고 <b>값이 있는 칸만</b> 갱신해요. 빈 칸은 기존 값을 그대로 두고, 읽기 기록과 일지도 그대로 남아요.</p>
                    <p class="hint">제목이나 저자를 바꾸면 다른 책으로 보고 새로 추가해요. 이름을 고칠 때는 책 상세의 <b>책 정보 수정</b>을 쓰세요.</p>
                    <a class="btn btn-outline" href="books-template.csv" download="책목록-양식.csv">양식 파일 받기</a>
                </section>
            </div>`;

        const input = el.querySelector('#file-input');
        const message = el.querySelector('#message');
        const planBox = el.querySelector('#plan');

        function toRows(rows) {
            const keys = rows[0].map(h => COLUMNS[h.trim().replace(/^﻿/, '')]);
            if (!keys.includes('title') || !keys.includes('author')) {
                throw new Error('첫 줄에 "제목"과 "저자" 항목이 있어야 해요. 양식 파일의 첫 줄을 그대로 써 주세요.');
            }
            const books = [];
            const skipped = [];
            rows.slice(1).forEach((cells, i) => {
                const book = {};
                keys.forEach((key, col) => { if (key) book[key] = (cells[col] || '').trim(); });
                if (!book.title || !book.author) skipped.push(`${i + 2}번째 줄`);
                else books.push(book);
            });
            return { books, skipped };
        }

        function showPlan(plan, skipped) {
            const hasBooks = store.books().length > 0;
            // 책 정보가 실제로 바뀌는 책 (읽기 기록만 넣는 책은 따로 센다)
            const infoUpdates = plan.update.filter(u => Object.keys(u.fields).length).length;
            const renumbered = plan.renumbered.map(r => r.isNew
                ? `'${r.title}' ${r.wanted}번 → ${r.used}번`
                : `'${r.title}' ${r.wanted}번 대신 ${r.used}번 유지`);
            planBox.innerHTML = `
                <ul class="plan-list">
                    <li><b>${plan.add.length}</b>권 새로 추가</li>
                    ${hasBooks ? `<li><b>${infoUpdates}</b>권 정보 갱신 <small class="hint">(값이 있는 칸만, 읽기 기록 유지)</small></li>` : ''}
                    ${plan.same ? `<li><b>${plan.same}</b>권 변경 없음</li>` : ''}
                    ${plan.records ? `<li><b>${plan.records}</b>권 읽기 기록 넣기${plan.done ? ` <small class="hint">(그중 읽기 완료 ${plan.done}권)</small>` : ''}</li>` : ''}
                    ${hasBooks ? `<li><b>${plan.missing.length}</b>권은 파일에 없음</li>` : ''}
                    ${renumbered.length ? `<li class="plan-warn">번호가 겹쳐 조정: ${escapeHtml(renumbered.slice(0, 5).join(', '))}${renumbered.length > 5 ? ` 외 ${renumbered.length - 5}권` : ''}</li>` : ''}
                    ${skipped.length ? `<li class="plan-warn">제목이나 저자가 빠져 건너뛴 줄: ${escapeHtml(skipped.join(', '))}</li>` : ''}
                    ${plan.recordProblems.length ? `<li class="plan-warn">읽기 기록을 건너뜀 (책은 등록): ${escapeHtml(plan.recordProblems.slice(0, 5).join(', '))}${plan.recordProblems.length > 5 ? ` 외 ${plan.recordProblems.length - 5}권` : ''}</li>` : ''}
                </ul>
                <div class="button-column">
                    <button class="btn btn-primary" data-mode="merge" type="button"
                        ${plan.add.length || plan.update.length ? '' : 'disabled'}>${hasBooks ? '목록에 합치기' : '저장하기'}</button>
                    ${hasBooks && plan.missing.length
                        ? `<button class="btn btn-outline" data-mode="replace" type="button">파일 목록으로 바꾸기 (없는 ${plan.missing.length}권 지움)</button>`
                        : ''}
                </div>`;
            planBox.hidden = false;
            planBox.onclick = event => {
                const mode = event.target.dataset.mode;
                if (!mode) return;
                if (mode === 'replace' && !confirm(`파일에 없는 ${plan.missing.length}권과 그 읽기 기록을 지울까요? 독서 일지는 남겨 둬요.`)) return;
                store.applyImport(plan, mode);
                App.ui.toast(`책 목록을 저장했어요. 새 책 ${plan.add.length}권, 갱신 ${infoUpdates}권` +
                    (plan.records ? `, 읽기 기록 ${plan.records}권` : ''), { next: true });
                App.router.go('/books');
            };
        }

        // CSV 글자를 읽어 업로드 계획을 보여 준다
        function planFromText(text) {
            message.hidden = true;
            planBox.hidden = true;
            try {
                const rows = parseCsv(text);
                if (rows.length < 2) throw new Error('책 정보가 없어요. 둘째 줄부터 책을 채워 주세요.');
                const { books, skipped } = toRows(rows);
                if (!books.length) throw new Error('올바른 책 정보가 한 권도 없어요.');
                showPlan(store.planImport(books), skipped);
            } catch (err) {
                message.textContent = err.message;
                message.hidden = false;
            }
        }

        // 안드로이드 앱 안에서는 앱이 직접 파일을 골라 읽어 준다
        if (App.folderBackup && App.folderBackup.canPickText()) {
            el.querySelector('.file-drop').addEventListener('click', async event => {
                event.preventDefault();
                try {
                    planFromText((await App.folderBackup.pickTextFile()).text);
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        message.textContent = err.message;
                        message.hidden = false;
                    }
                }
            });
        }

        input.addEventListener('change', async () => {
            const file = input.files[0];
            message.hidden = true;
            planBox.hidden = true;
            if (!file) return;
            try {
                const rows = parseCsv(await readFileText(file));
                if (rows.length < 2) throw new Error('책 정보가 없어요. 둘째 줄부터 책을 채워 주세요.');
                const { books, skipped } = toRows(rows);
                if (!books.length) throw new Error('올바른 책 정보가 한 권도 없어요.');
                showPlan(store.planImport(books), skipped);
            } catch (err) {
                message.textContent = err.message;
                message.hidden = false;
            }
            input.value = '';
        });
    }
});
