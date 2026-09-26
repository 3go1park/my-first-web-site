// 독서 일지: 날짜를 고르고 읽은 내용을 적는다. 아래에 날짜별로 묶은 목록.
App.route('/journal', {
    title: '독서 일지',
    back: ctx => (ctx.query.get('book') ? `/book/${ctx.query.get('book')}` : '/'),
    render(el, ctx) {
        const { escapeHtml, escapeMultiline, today, formatDay } = App.util;
        const store = App.store;
        const PAGE_SIZE = 30;
        let editingId = null;
        let limit = PAGE_SIZE;

        el.innerHTML = `
            <form id="journal-form" class="card" novalidate>
                <h3 id="form-title">오늘 읽은 내용</h3>
                <div class="journal-fields">
                    <label class="field"><span>일자 *</span><input name="date" type="date"></label>
                    <label class="field"><span>책</span><select name="book"></select></label>
                    <label class="field"><span>여기까지 읽음 (쪽)</span><input name="page" type="text" inputmode="numeric" placeholder="예: 58"></label>
                </div>
                <label class="field"><span>읽은 내용 *</span>
                    <textarea name="content" rows="4" placeholder="읽은 부분, 기억에 남는 문장, 느낀 점을 적어 보세요."></textarea>
                </label>
                <p id="message" class="message error" hidden></p>
                <div class="form-actions">
                    <button id="submit" class="btn btn-primary" type="submit">등록하기</button>
                    <button id="cancel-edit" class="btn btn-outline" type="button" hidden>수정 취소</button>
                </div>
            </form>

            <section class="journal-section">
                <div class="section-head">
                    <h3>일지 목록 <span id="count" class="count-badge"></span></h3>
                    <label class="inline-select"><span>책</span><select id="filter" class="pill-select"></select></label>
                </div>
                <ol id="list" class="journal-list"></ol>
                <button id="more" class="btn btn-outline" type="button" hidden>더 보기</button>
                <p id="empty" class="card hint" hidden>아직 적은 일지가 없어요.</p>
            </section>`;

        const form = el.querySelector('#journal-form');
        const bookSelect = form.elements.book;
        const filterSelect = el.querySelector('#filter');
        const message = el.querySelector('#message');

        // 책 선택: 읽는 중인 책을 맨 위에
        function fillBooks() {
            const isNow = b => ['reading', 'late'].includes(store.statusOf(b.id));
            const option = b => `<option value="${b.id}">${escapeHtml(b.no)}. ${escapeHtml(b.title)}</option>`;
            const now = store.books().filter(isNow);
            const others = store.books().filter(b => !isNow(b));
            bookSelect.innerHTML = '<option value="">선택 안 함</option>'
                + (now.length ? `<optgroup label="읽는 중">${now.map(option).join('')}</optgroup>` : '')
                + (others.length ? `<optgroup label="다른 책">${others.map(option).join('')}</optgroup>` : '');
            // 주소로 받은 책 → 마지막으로 쓴 책 → 읽는 중인 첫 책
            const last = [...store.journal()].sort((a, b) => b.createdAt - a.createdAt)[0];
            const preferred = [ctx.query.get('book'), last && last.bookId, now[0] && now[0].id].find(id => id && store.book(id));
            bookSelect.value = preferred || '';
        }

        function fillFilter() {
            const current = filterSelect.value || ctx.query.get('filter') || 'all';
            const ids = [...new Set(store.journal().map(e => e.bookId).filter(Boolean))];
            filterSelect.innerHTML = '<option value="all">전체</option>'
                + ids.map(id => `<option value="${id}">${escapeHtml((store.book(id) || {}).title || '')}</option>`).join('')
                + (store.journal().some(e => !e.bookId) ? '<option value="">책 없이 쓴 일지</option>' : '');
            filterSelect.value = [...filterSelect.options].some(o => o.value === current) ? current : 'all';
        }

        function renderList() {
            const filter = filterSelect.value;
            const shown = store.journal()
                .filter(e => filter === 'all' || e.bookId === filter)
                .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
            el.querySelector('#count').textContent = `${shown.length}개`;
            el.querySelector('#empty').hidden = shown.length > 0;
            // 일지가 많아도 빠르게: 30개씩 보여 주고 "더 보기"로 늘린다
            const more = el.querySelector('#more');
            more.hidden = shown.length <= limit;
            more.textContent = `더 보기 (${shown.length - limit}개 남음)`;
            let lastDate = '';
            el.querySelector('#list').innerHTML = shown.slice(0, limit).map(e => {
                const heading = e.date !== lastDate ? `<li class="journal-date">${formatDay(e.date)}</li>` : '';
                lastDate = e.date;
                const title = store.bookTitleOf(e);
                return `${heading}
                    <li class="card journal-entry${e.id === editingId ? ' is-editing' : ''}" data-id="${e.id}">
                        ${title || e.page ? `<p class="journal-meta">${e.bookId ? `<a href="#/book/${e.bookId}">${escapeHtml(title)}</a>` : escapeHtml(title)}${e.page ? ` · ${escapeHtml(e.page)}쪽까지` : ''}</p>` : ''}
                        <p class="journal-content">${escapeMultiline(e.content)}</p>
                        <div class="journal-actions">
                            <button type="button" class="btn-text" data-edit="${e.id}">수정</button>
                            <button type="button" class="btn-text danger" data-delete="${e.id}">삭제</button>
                        </div>
                    </li>`;
            }).join('');
        }

        function resetForm() {
            editingId = null;
            el.querySelector('#form-title').textContent = '오늘 읽은 내용';
            el.querySelector('#submit').textContent = '등록하기';
            el.querySelector('#cancel-edit').hidden = true;
            form.elements.content.value = '';
            form.elements.page.value = '';
            message.hidden = true;
        }

        function fail(text, name) {
            message.textContent = text;
            message.hidden = false;
            form.elements[name].focus();
        }

        form.addEventListener('submit', event => {
            event.preventDefault();
            const date = form.elements.date.value;
            const bookId = bookSelect.value;
            const page = form.elements.page.value.trim();
            const content = form.elements.content.value.trim();
            const book = bookId && store.book(bookId);

            if (!date) return fail('일자를 골라 주세요.', 'date');
            if (date > today()) return fail('앞으로의 날짜에는 일지를 쓸 수 없어요.', 'date');
            if (page && !/^\d+$/.test(page)) return fail('쪽수는 숫자로만 적어 주세요.', 'page');
            if (page && book && book.pages && Number(page) > Number(book.pages)) return fail(`이 책은 ${book.pages}쪽까지 있어요.`, 'page');
            if (!content) return fail('읽은 내용을 적어 주세요.', 'content');

            const notes = [];
            if (editingId) {
                store.updateEntry(editingId, { date, bookId, page, content });
                notes.push(`${formatDay(date)} 일지를 고쳤어요.`);
            } else {
                store.addEntry({ date, bookId, page, content });
                notes.push(`${formatDay(date)} 일지를 등록했어요.`);
            }

            // 읽기 전인 책에 처음 일지를 쓰면 그날을 시작일로 기록한다
            if (book && store.statusOf(book.id) === 'none') {
                store.setRecord(book.id, { start: date });
                notes.push(`'${book.title}' 읽기 시작일도 기록했어요.`);
            }

            // 마지막 쪽까지 읽었으면 읽기 완료를 권한다
            const record = book && store.record(book.id);
            if (book && book.pages && Number(page) >= Number(book.pages) && store.statusOf(book.id) !== 'done'
                && confirm(`'${book.title}'을(를) 마지막 쪽까지 읽었어요! 읽기 완료로 표시할까요?`)) {
                store.setRecord(book.id, { done: date >= record.start ? date : record.start });
                App.ui.toast(`읽기 완료! '${book.title}'의 별점과 감상을 남겨 보세요.`, { next: true });
                App.router.go(`/book/${book.id}/reading`);
                return;
            }

            resetForm();
            fillBooks();
            fillFilter();
            renderList();
            App.ui.toast(notes.join(' '));
        });

        el.querySelector('#cancel-edit').addEventListener('click', () => {
            resetForm();
            form.elements.date.value = today();
            renderList();
        });

        el.querySelector('#list').addEventListener('click', event => {
            const editId = event.target.dataset.edit;
            const deleteId = event.target.dataset.delete;
            if (editId) {
                const entry = store.journal().find(e => e.id === editId);
                editingId = editId;
                form.elements.date.value = entry.date;
                bookSelect.value = store.book(entry.bookId) ? entry.bookId : '';
                form.elements.page.value = entry.page || '';
                form.elements.content.value = entry.content;
                el.querySelector('#form-title').textContent = '일지 수정';
                el.querySelector('#submit').textContent = '수정 저장';
                el.querySelector('#cancel-edit').hidden = false;
                renderList();
                form.scrollIntoView({ block: 'start', behavior: 'smooth' });
                form.elements.content.focus();
            }
            if (deleteId && confirm('이 일지를 지울까요?')) {
                store.deleteEntry(deleteId);
                if (editingId === deleteId) resetForm();
                fillFilter();
                renderList();
                App.ui.toast('일지를 지웠어요.');
            }
        });

        filterSelect.addEventListener('change', () => {
            limit = PAGE_SIZE;
            renderList();
        });
        el.querySelector('#more').addEventListener('click', () => {
            limit += PAGE_SIZE;
            renderList();
        });

        form.elements.date.value = today();
        form.elements.date.max = today();
        fillBooks();
        fillFilter();
        renderList();
    }
});
