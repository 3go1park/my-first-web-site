// 책 목록 화면: 검색, 장르·상태로 걸러 보기 / 책 상세 화면
App.route('/books', {
    title: '책 목록',
    back: '/',
    render(el, ctx) {
        const { escapeHtml } = App.util;
        const { statusBadge, emptyState, icon } = App.ui;
        const store = App.store;
        const FILTER_KEY = 'readinglife.bookFilter';
        const books = store.books();

        if (!books.length) {
            el.innerHTML = emptyState('아직 등록된 책이 없어요. 책 목록을 업로드하거나 직접 등록해 주세요.',
                '<a class="btn btn-outline" href="#/books/upload">책 목록 업로드</a><a class="btn btn-outline" href="#/books/new">책 등록</a>');
            return;
        }

        let saved = {};
        try { saved = JSON.parse(sessionStorage.getItem(FILTER_KEY) || '{}'); } catch (err) { /* 무시 */ }
        const filter = {
            text: saved.text || '',
            genre: saved.genre || 'all',
            status: ctx.query.get('status') || saved.status || 'all'
        };
        const genres = [...new Set(books.map(b => b.genre).filter(Boolean))].sort();

        el.innerHTML = `
            <div class="toolbar">
                <label class="search-box">${icon('search')}
                    <input id="search" type="search" placeholder="제목, 저자, 출판사로 찾기" value="${escapeHtml(filter.text)}" autocomplete="off">
                </label>
                <select id="genre" class="pill-select" aria-label="장르">
                    <option value="all">모든 장르</option>
                    ${genres.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('')}
                </select>
                <select id="status" class="pill-select" aria-label="읽기 상태">
                    <option value="all">모든 상태</option>
                    ${Object.entries(store.STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
                </select>
                <span id="count" class="toolbar-count"></span>
                <a class="btn btn-small" href="#/books/new">+ 책 등록</a>
            </div>
            <section class="table-card">
                <div class="book-row book-row-head">
                    <span>번호</span><span>제목</span><span class="col-author">저자</span><span>장르</span><span>상태</span>
                </div>
                <ol id="rows"></ol>
                <p id="no-match" class="hint no-match" hidden>찾는 책이 없어요.</p>
            </section>`;

        const search = el.querySelector('#search');
        const genreSelect = el.querySelector('#genre');
        const statusSelect = el.querySelector('#status');
        genreSelect.value = genres.includes(filter.genre) ? filter.genre : 'all';
        statusSelect.value = filter.status in store.STATUS ? filter.status : 'all';

        function renderRows() {
            const text = search.value.trim().toLowerCase();
            const shown = books.filter(b =>
                (genreSelect.value === 'all' || b.genre === genreSelect.value)
                && (statusSelect.value === 'all' || store.statusOf(b.id) === statusSelect.value)
                && (!text || [b.title, b.originalTitle, b.author, b.publisher].some(v => (v || '').toLowerCase().includes(text))));
            el.querySelector('#rows').innerHTML = shown.map(b => `
                <li><a class="book-row" href="#/book/${b.id}" data-id="${b.id}">
                    <span class="col-no">${escapeHtml(b.no)}</span>
                    <span class="col-title">
                        <strong>${escapeHtml(b.title)}</strong>
                        <small class="col-author-inline">${escapeHtml(b.author)}</small>
                        <small>${escapeHtml(b.summary)}</small>
                    </span>
                    <span class="col-author">${escapeHtml(b.author)}</span>
                    <span class="col-muted">${escapeHtml(b.genre)}</span>
                    <span>${statusBadge(store.statusOf(b.id))}</span>
                </a></li>`).join('');
            el.querySelector('#count').textContent = `${shown.length}권`;
            el.querySelector('#no-match').hidden = shown.length > 0;
            sessionStorage.setItem(FILTER_KEY, JSON.stringify({ text: search.value, genre: genreSelect.value, status: statusSelect.value }));
        }

        search.addEventListener('input', renderRows);
        genreSelect.addEventListener('change', renderRows);
        statusSelect.addEventListener('change', renderRows);
        renderRows();
    }
});

App.route('/book/:id', {
    title: ctx => (App.store.book(ctx.params.id) || {}).title || '책',
    back: ctx => ctx.query.get('from') || '/books',
    render(el, ctx) {
        const { escapeHtml, escapeMultiline, formatDate, formatDay, daysBetween } = App.util;
        const { statusBadge, emptyState, progressBar, stars } = App.ui;
        const store = App.store;
        const book = store.book(ctx.params.id);
        if (!book) {
            el.innerHTML = emptyState('책을 찾지 못했어요.', '<a class="btn btn-outline" href="#/books">책 목록</a>');
            return;
        }
        const status = store.statusOf(book.id);
        const record = store.record(book.id) || {};
        const progress = store.progressOf(book.id);
        const entries = store.entriesOf(book.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
        const meta = [book.author, book.publisher, book.year && `${book.year}년`, book.genre, book.country, book.pages && `${book.pages}쪽`].filter(Boolean);

        const dates = [
            ['시작일', formatDate(record.start)],
            ['완료예정일', formatDate(record.due)],
            ['완료일', formatDate(record.done)],
            ['걸린 기간', record.start && record.done ? `${daysBetween(record.start, record.done) + 1}일` : '']
        ].filter(([, v]) => v);

        el.innerHTML = `
            <div class="detail-grid">
                <section class="card">
                    <p class="eyebrow">${escapeHtml(book.no)}번 책</p>
                    <h2 class="detail-title">${escapeHtml(book.title)}</h2>
                    ${book.originalTitle ? `<p class="hint">${escapeHtml(book.originalTitle)}</p>` : ''}
                    <p class="book-meta">${meta.map(escapeHtml).join(' · ')}</p>
                    ${book.summary ? `<p class="detail-summary">${escapeHtml(book.summary)}</p>` : ''}
                    <div class="button-row">
                        <a class="btn btn-outline" href="#/book/${book.id}/edit">책 정보 수정</a>
                    </div>
                </section>

                <section class="card">
                    <div class="section-head"><h3>읽기 기록</h3>${statusBadge(status)}</div>
                    ${progress !== null ? progressBar(progress, `${progress}%` + (store.lastPage(book.id) && status !== 'done' ? ` · ${store.lastPage(book.id)} / ${book.pages}쪽` : '')) : ''}
                    ${dates.length
                        ? `<dl class="date-list">${dates.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`
                        : '<p class="hint">아직 읽기 시작하지 않았어요.</p>'}
                    ${record.rating ? `<p class="detail-rating">${stars(record.rating)}</p>` : ''}
                    ${record.review ? `<blockquote class="review">${escapeMultiline(record.review)}</blockquote>` : ''}
                    <div class="button-row">
                        <a class="btn" href="#/book/${book.id}/reading">${status === 'none' ? '읽기 시작하기' : '읽기 기록 수정'}</a>
                    </div>
                </section>
            </div>

            <section class="journal-section">
                <div class="section-head">
                    <h3>독서 일지 <span class="count-badge">${entries.length}개</span></h3>
                    <a class="btn btn-small" href="#/journal?book=${book.id}">+ 일지 쓰기</a>
                </div>
                ${entries.length
                    ? `<ol class="journal-list">${entries.slice(0, 5).map(e => `
                        <li class="card journal-entry">
                            <p class="journal-meta">${formatDay(e.date)}${e.page ? ` · ${escapeHtml(e.page)}쪽까지` : ''}</p>
                            <p class="journal-content">${escapeMultiline(e.content)}</p>
                        </li>`).join('')}</ol>
                       ${entries.length > 5 ? `<a class="text-link" href="#/journal?book=${book.id}&filter=${book.id}">일지 ${entries.length}개 모두 보기</a>` : ''}`
                    : '<p class="hint">이 책에 쓴 일지가 없어요.</p>'}
            </section>`;
    }
});
