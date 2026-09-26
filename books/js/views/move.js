// 기록 옮기기: 다른 책에 잘못 적은 읽기 기록과 독서 일지를 맞는 책으로 옮긴다
App.route('/book/:id/move', {
    title: '다른 책으로 옮기기',
    back: ctx => `/book/${ctx.params.id}`,
    render(el, ctx) {
        const { escapeHtml, formatDate } = App.util;
        const { statusBadge, emptyState } = App.ui;
        const store = App.store;
        const source = store.book(ctx.params.id);
        if (!source) {
            el.innerHTML = emptyState('책을 찾지 못했어요.', '<a class="btn btn-outline" href="#/books">책 목록</a>');
            return;
        }
        const record = store.record(source.id);
        const entries = store.entriesOf(source.id);
        let targetId = '';

        el.innerHTML = `
            <div class="two-columns">
                <section class="card">
                    <p class="eyebrow">옮길 기록</p>
                    <h2 class="detail-title">${escapeHtml(source.no)}. ${escapeHtml(source.title)}</h2>
                    <p>${statusBadge(store.statusOf(source.id))}
                        ${record ? `<span class="hint">시작 ${formatDate(record.start)}${record.done ? ` · 완료 ${formatDate(record.done)}` : ''}</span>` : ''}</p>
                    <label class="check-row"><input type="checkbox" id="move-record" ${record ? 'checked' : 'disabled'}>
                        <span>읽기 기록 ${record ? '(시작일·완료예정일·완료일·별점·감상)' : '없음'}</span></label>
                    <label class="check-row"><input type="checkbox" id="move-journal" ${entries.length ? 'checked' : 'disabled'}>
                        <span>독서 일지 ${entries.length}개</span></label>
                    <p class="hint">옮기고 나면 이 책은 <b>읽기 전</b>이 돼요.</p>
                </section>

                <section class="card">
                    <p class="eyebrow">옮겨 갈 책</p>
                    <label class="search-box">${App.ui.icon('search')}
                        <input id="target-search" type="search" placeholder="번호나 제목으로 찾기" autocomplete="off">
                    </label>
                    <ol id="target-list" class="pick-list"></ol>
                    <p id="target-warn" class="message error" hidden></p>
                    <button id="move" class="btn btn-primary" type="button" disabled>옮기기</button>
                </section>
            </div>`;

        const search = el.querySelector('#target-search');
        const list = el.querySelector('#target-list');
        const warn = el.querySelector('#target-warn');
        const moveButton = el.querySelector('#move');

        function renderList() {
            const text = search.value.trim().toLowerCase();
            const shown = store.books().filter(b => b.id !== source.id
                && (!text || b.no === text || [b.title, b.author].some(v => (v || '').toLowerCase().includes(text))));
            list.innerHTML = shown.map(b => `
                <li><button type="button" class="pick-row${b.id === targetId ? ' is-picked' : ''}" data-pick="${b.id}">
                    <span class="col-no">${escapeHtml(b.no)}</span>
                    <span class="col-title"><strong>${escapeHtml(b.title)}</strong><small>${escapeHtml(b.author)}</small></span>
                    ${statusBadge(store.statusOf(b.id))}
                </button></li>`).join('') || '<li class="hint no-match">찾는 책이 없어요.</li>';
        }

        function renderChoice() {
            const target = store.book(targetId);
            const moveRecord = el.querySelector('#move-record').checked;
            const moveJournal = el.querySelector('#move-journal').checked;
            moveButton.disabled = !target || (!moveRecord && !moveJournal);
            moveButton.textContent = target ? `'${target.title}'(으)로 옮기기` : '옮기기';
            const existing = target && store.record(target.id);
            warn.hidden = !(existing && moveRecord);
            if (existing) warn.textContent = `'${target.title}'에 이미 읽기 기록이 있어요. 옮기면 그 기록을 덮어써요.`;
        }

        list.addEventListener('click', event => {
            const row = event.target.closest('[data-pick]');
            if (!row) return;
            targetId = row.dataset.pick;
            renderList();
            renderChoice();
        });
        search.addEventListener('input', renderList);
        el.querySelector('#move-record').addEventListener('change', renderChoice);
        el.querySelector('#move-journal').addEventListener('change', renderChoice);

        moveButton.addEventListener('click', () => {
            const target = store.book(targetId);
            const options = { record: el.querySelector('#move-record').checked, journal: el.querySelector('#move-journal').checked };
            const what = [options.record && '읽기 기록', options.journal && `독서 일지 ${entries.length}개`].filter(Boolean).join('과 ');
            // "기록을" / "3개를"
            if (!confirm(`'${source.title}'의 ${what}${options.journal ? '를' : '을'} '${target.title}'(으)로 옮길까요?`)) return;
            const moved = store.moveRecords(source.id, target.id, options);
            const status = store.statusOf(target.id);
            App.ui.toast(`옮겼어요. '${target.title}': ${store.STATUS[status]}${moved.entries ? `, 일지 ${moved.entries}개` : ''}` +
                (status === 'done' ? '' : ' · 완료일을 넣으면 읽기 완료가 돼요'), { next: true });
            App.router.go(status === 'done' ? `/book/${target.id}` : `/book/${target.id}/reading`);
        });

        renderList();
        renderChoice();
        search.focus();
    }
});
