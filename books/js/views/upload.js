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
            '출간연도': 'year', '장르': 'genre', '국가': 'country', '쪽수': 'pages', '한줄소개': 'summary'
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
                    <p class="hint">이미 있는 책(제목·저자가 같은 책)은 새로 추가하지 않고 정보만 갱신해요. 읽기 기록과 일지는 그대로 남아요.</p>
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
            planBox.innerHTML = `
                <ul class="plan-list">
                    <li><b>${plan.add.length}</b>권 새로 추가</li>
                    ${hasBooks ? `<li><b>${plan.update.length}</b>권 정보 갱신 (읽기 기록 유지)</li>` : ''}
                    ${hasBooks ? `<li><b>${plan.missing.length}</b>권은 파일에 없음</li>` : ''}
                    ${skipped.length ? `<li class="plan-warn">제목이나 저자가 빠져 건너뛴 줄: ${escapeHtml(skipped.join(', '))}</li>` : ''}
                </ul>
                <div class="button-column">
                    <button class="btn btn-primary" data-mode="merge" type="button">${hasBooks ? '목록에 합치기' : '저장하기'}</button>
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
                App.ui.toast(`책 목록을 저장했어요. 새 책 ${plan.add.length}권, 갱신 ${plan.update.length}권`, { next: true });
                App.router.go('/books');
            };
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
