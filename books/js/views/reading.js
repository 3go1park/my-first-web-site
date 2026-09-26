// 책 읽기 등록: 상태별 목록 / 읽기 기록(시작일·완료예정일·완료일·별점·감상)
App.route('/reading', {
    title: '책 읽기 등록',
    back: '/',
    render(el, ctx) {
        const { escapeHtml, formatDate } = App.util;
        const { statusBadge, emptyState } = App.ui;
        const store = App.store;
        const FILTER_KEY = 'readinglife.readingFilter';
        const FILTERS = ['all', 'reading', 'late', 'done', 'none'];
        const books = store.books();

        if (!books.length) {
            el.innerHTML = emptyState('아직 등록된 책이 없어요. 먼저 책 목록을 업로드하거나 책을 등록해 주세요.',
                '<a class="btn btn-outline" href="#/books/upload">책 목록 업로드</a><a class="btn btn-outline" href="#/books/new">책 등록</a>');
            return;
        }

        let current = ctx.query.get('status') || sessionStorage.getItem(FILTER_KEY) || 'all';
        if (!FILTERS.includes(current)) current = 'all';
        const items = books.map(book => ({ book, record: store.record(book.id) || {}, status: store.statusOf(book.id) }));

        el.innerHTML = `
            <p class="lead">책을 눌러 시작일, 완료예정일, 완료일을 기록하세요.</p>
            <div id="filters" class="filter-tabs" role="tablist"></div>
            <section class="table-card">
                <div class="reading-row book-row-head">
                    <span>번호</span><span>제목</span><span>상태</span>
                    <span class="col-date">시작일</span><span class="col-date">완료예정일</span><span class="col-date">완료일</span>
                </div>
                <ol id="rows"></ol>
                <p id="no-match" class="hint no-match" hidden>이 상태의 책이 없어요.</p>
            </section>`;

        function render() {
            const counts = { all: items.length };
            items.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1; });
            el.querySelector('#filters').innerHTML = FILTERS.map(key => `
                <button type="button" role="tab" data-filter="${key}" aria-selected="${key === current}"
                    class="filter-tab status-${key}${key === current ? ' is-active' : ''}">
                    ${key === 'all' ? '전체' : store.STATUS[key]} <b>${counts[key] || 0}</b>
                </button>`).join('');

            const shown = items.filter(i => current === 'all' || i.status === current);
            el.querySelector('#rows').innerHTML = shown.map(({ book, record, status }) => `
                <li><a class="reading-row" href="#/book/${book.id}/reading?from=/reading" data-id="${book.id}">
                    <span class="col-no">${escapeHtml(book.no)}</span>
                    <span class="col-title"><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.author)}</small></span>
                    <span>${statusBadge(status)}</span>
                    <span class="col-date">${formatDate(record.start)}</span>
                    <span class="col-date${status === 'late' ? ' is-late' : ''}">${formatDate(record.due)}</span>
                    <span class="col-date">${formatDate(record.done)}</span>
                </a></li>`).join('');
            el.querySelector('#no-match').hidden = shown.length > 0;
        }

        el.querySelector('#filters').addEventListener('click', event => {
            const button = event.target.closest('[data-filter]');
            if (!button) return;
            current = button.dataset.filter;
            sessionStorage.setItem(FILTER_KEY, current);
            render();
        });
        render();
    }
});

App.route('/book/:id/reading', {
    title: '읽기 기록',
    back: ctx => ctx.query.get('from') || `/book/${ctx.params.id}`,
    render(el, ctx) {
        const { escapeHtml, today } = App.util;
        const { statusBadge, emptyState } = App.ui;
        const store = App.store;
        const book = store.book(ctx.params.id);
        if (!book) {
            el.innerHTML = emptyState('책을 찾지 못했어요.', '<a class="btn btn-outline" href="#/reading">책 읽기 목록</a>');
            return;
        }
        const record = store.record(book.id);
        const back = ctx.query.get('from') || `/book/${book.id}`;

        el.innerHTML = `
            <div class="two-columns">
                <section class="card">
                    <p class="eyebrow">${escapeHtml(book.no)}번 책</p>
                    <h2 class="detail-title">${escapeHtml(book.title)}</h2>
                    <p class="book-meta">${[book.author, book.publisher, book.genre].filter(Boolean).map(escapeHtml).join(' · ')}</p>
                    ${book.summary ? `<p class="hint">${escapeHtml(book.summary)}</p>` : ''}
                    <p>현재 상태 ${statusBadge(store.statusOf(book.id))}</p>
                    <div class="button-row">
                        <a class="btn btn-outline" href="#/book/${book.id}">책 상세 보기</a>
                        <a class="btn btn-outline" href="#/journal?book=${book.id}">일지 쓰기</a>
                    </div>
                </section>

                <form id="reading-form" class="card" novalidate>
                    <div class="form-grid form-grid-3">
                        <label class="field"><span>시작일 *</span><input name="start" type="date"></label>
                        <label class="field"><span>완료예정일</span><input name="due" type="date"></label>
                        <label class="field"><span>완료일</span><input name="done" type="date"></label>
                    </div>
                    <div class="field">
                        <span>별점 <small class="hint">(다 읽은 뒤에)</small></span>
                        <div class="star-input" role="radiogroup" aria-label="별점">
                            ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" aria-label="${n}점">★</button>`).join('')}
                            <button type="button" class="star-clear" data-star="0">지우기</button>
                        </div>
                    </div>
                    <label class="field"><span>한줄 감상</span>
                        <textarea name="review" rows="2" placeholder="이 책을 한 문장으로 기억한다면?"></textarea>
                    </label>
                    <p id="message" class="message error" hidden></p>
                    <div class="form-actions">
                        <button class="btn btn-primary" type="submit">저장하기</button>
                        ${record ? '<button id="clear" class="btn btn-danger-text" type="button">읽기 기록 지우기</button>' : ''}
                    </div>
                </form>
            </div>`;

        const form = el.querySelector('#reading-form');
        const message = el.querySelector('#message');
        let rating = Number(record && record.rating) || 0;

        // 처음 기록하는 책은 시작일을 오늘로 채워 둔다
        form.elements.start.value = (record && record.start) || today();
        form.elements.due.value = (record && record.due) || '';
        form.elements.done.value = (record && record.done) || '';
        form.elements.done.max = today();
        form.elements.review.value = (record && record.review) || '';

        const starBox = el.querySelector('.star-input');
        function paintStars() {
            starBox.querySelectorAll('[data-star]').forEach(b => {
                const n = Number(b.dataset.star);
                if (n) {
                    b.classList.toggle('is-on', n <= rating);
                    b.setAttribute('aria-pressed', n === rating);
                }
            });
        }
        starBox.addEventListener('click', event => {
            const b = event.target.closest('[data-star]');
            if (!b) return;
            rating = Number(b.dataset.star);
            paintStars();
        });
        paintStars();

        form.addEventListener('submit', event => {
            event.preventDefault();
            const start = form.elements.start.value;
            const due = form.elements.due.value;
            const done = form.elements.done.value;
            const fail = (text, name) => {
                message.textContent = text;
                message.hidden = false;
                form.elements[name].focus();
            };
            if (!start) return fail('시작일은 꼭 입력해 주세요.', 'start');
            if (due && due < start) return fail('완료예정일은 시작일보다 빠를 수 없어요.', 'due');
            if (done && done < start) return fail('완료일은 시작일보다 빠를 수 없어요.', 'done');
            if (done && done > today()) return fail('완료일은 오늘 이후로 정할 수 없어요.', 'done');

            store.setRecord(book.id, { start, due, done, rating, review: form.elements.review.value.trim() });
            App.ui.toast(`'${book.title}'을(를) 저장했어요. 상태: ${store.STATUS[store.statusOf(book.id)]}`, { next: true });
            App.ui.highlight(book.id);
            App.router.go(back);
        });

        const clear = el.querySelector('#clear');
        if (clear) {
            clear.addEventListener('click', () => {
                if (!confirm('이 책의 읽기 기록을 지울까요? 상태가 "읽기 전"으로 돌아가요.')) return;
                store.clearRecord(book.id);
                App.ui.toast(`'${book.title}'의 읽기 기록을 지웠어요.`, { next: true });
                App.ui.highlight(book.id);
                App.router.go(back);
            });
        }
    }
});
