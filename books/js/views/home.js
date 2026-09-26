// 홈 화면: 지금 읽는 책 카드와 그룹별 메뉴
App.route('/', {
    title: '',
    render(el) {
        const { escapeHtml, relativeDay, daysBetween, today } = App.util;
        const { icon, statusBadge, progressBar } = App.ui;
        const store = App.store;
        const insights = App.insights;

        const books = store.books();
        const counts = insights.statusCounts();
        const streak = insights.currentStreak();
        const todayEntries = insights.entriesByDay().get(today()) || 0;
        const lastBackup = store.settings().lastBackup;
        const needsBackup = books.length > 0 && (!lastBackup || daysBetween(lastBackup, today()) >= 7);

        const summary = books.length
            ? `등록된 책 ${books.length}권 · 읽기 완료 ${counts.done}권` + (streak ? ` · ${streak}일 연속 기록 중` : '')
            : '아직 등록된 책이 없어요. 책 목록을 업로드하거나 직접 등록해 보세요.';

        // 지연된 책 → 읽는 중인 책, 최근 일지를 쓴 순서로
        const lastWritten = id => store.entriesOf(id).reduce((max, e) => (e.date > max ? e.date : max), '');
        const now = books
            .filter(b => ['reading', 'late'].includes(store.statusOf(b.id)))
            .sort((a, b) => (store.statusOf(a.id) === 'late' ? -1 : 0) - (store.statusOf(b.id) === 'late' ? -1 : 0)
                || lastWritten(b.id).localeCompare(lastWritten(a.id)));

        function journalText(id) {
            const count = store.entriesOf(id).length;
            return count ? `일지 ${count}개 · 마지막 기록 ${relativeDay(lastWritten(id))}` : '아직 쓴 일지가 없어요';
        }

        function nowCard(book) {
            const status = store.statusOf(book.id);
            const record = store.record(book.id);
            const progress = store.progressOf(book.id);
            const page = store.lastPage(book.id);
            let dueText = `시작 ${relativeDay(record.start)}`;
            if (record.due) {
                const left = daysBetween(today(), record.due);
                dueText = left < 0 ? `예정일 ${-left}일 지남` : left === 0 ? '오늘 완료 예정' : `완료까지 D-${left}`;
            }
            return `
                <article class="now-card" data-id="${book.id}">
                    <a class="now-card-main" href="#/book/${book.id}">
                        <div class="now-card-top">${statusBadge(status)}<span class="now-due">${dueText}</span></div>
                        <strong class="now-title">${escapeHtml(book.title)}</strong>
                        <span class="now-author">${escapeHtml(book.author)}</span>
                        ${progress !== null
                            ? progressBar(progress, `${page} / ${book.pages}쪽`)
                            : `<span class="now-meta">${journalText(book.id)}</span>`}
                    </a>
                    <a class="btn btn-small" href="#/journal?book=${book.id}">${icon('pen')} 일지 쓰기</a>
                </article>`;
        }

        const tile = (href, iconName, label, note = '', extra = '') =>
            `<a class="menu-tile ${extra}" href="${href}">${icon(iconName)}<span>${label}</span>${note ? `<small class="tile-note">${note}</small>` : ''}</a>`;

        el.innerHTML = `
            <header class="home-header">
                <p class="eyebrow">MY READING LIFE</p>
                <h1>책읽는 삶의 재미</h1>
                <p class="lead">${summary}</p>
            </header>

            <section class="home-section">
                <div class="section-head">
                    <h2 class="group-title">지금 읽는 책</h2>
                    ${now.length > 3 ? `<a class="text-link" href="#/reading?status=reading">모두 보기 (${now.length})</a>` : ''}
                </div>
                ${now.length
                    ? `<div class="now-cards">${now.slice(0, 3).map(nowCard).join('')}</div>`
                    : `<div class="card now-empty">
                        <p class="hint">${books.length ? '읽고 있는 책이 없어요. 다음에 읽을 책을 골라 보세요.' : '책을 먼저 등록해 주세요.'}</p>
                        <a class="btn btn-outline" href="${books.length ? '#/books?status=none' : '#/books/upload'}">${books.length ? '읽을 책 고르기' : '책 목록 업로드'}</a>
                       </div>`}
            </section>

            <div class="home-menu">
                <section class="menu-group">
                    <h2 class="group-title">책 목록</h2>
                    <div class="menu-grid">
                        ${tile('#/books', 'list', '목록 보기')}
                        ${tile('#/books/upload', 'upload', '책 목록 업로드')}
                        ${tile('#/books/new', 'pen', '책 등록')}
                    </div>
                </section>
                <section class="menu-group">
                    <h2 class="group-title">책 읽기</h2>
                    <div class="menu-grid">
                        ${tile('#/reading', 'book', '책 읽기 등록', `읽는 중 ${counts.reading + counts.late}권`)}
                        ${tile('#/journal', 'calendar', '독서 일지', todayEntries ? `오늘 ${todayEntries}개 씀` : '오늘은 아직')}
                        ${tile('#/stats', 'chart', '통계', `완독 ${counts.done}권`)}
                    </div>
                </section>
                <section class="menu-group">
                    <h2 class="group-title">관리</h2>
                    <div class="menu-grid">
                        ${tile('#/backup', 'save', '백업 · 복원',
                            lastBackup ? `마지막 백업 ${relativeDay(lastBackup)}` : '백업한 적 없음',
                            needsBackup ? 'needs-backup' : '')}
                    </div>
                </section>
            </div>`;
    }
});
