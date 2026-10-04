// 일기 쓰기 · 고치기: 날짜(오늘 기본)를 고르면 그날 할일 요약을 위에 보여 주고, 아래에 일기를 쓴다.
// 일기는 하루에 하나. 이미 쓴 날을 고르면 그 일기를 연다.
(() => {
    const back = ctx => (ctx.query.get('from') === 'home' ? '/' : '/diary');

    function render(el, ctx) {
        const { escapeHtml, today, formatDay, isDate } = App.util;
        const { toast, statusBadge, checkButton, bindChecks, confirmDialog, highlight } = App.ui;
        const store = App.store;
        const sch = App.schedule;
        const moods = App.moods;

        const id = ctx.params.id;
        const old = id ? store.diaryEntry(id) : null;
        if (id && !old) {
            el.innerHTML = App.ui.emptyState('지워졌거나 없는 일기예요.', '<a class="btn btn-outline" href="#/diary">일기 내역으로</a>');
            return;
        }
        const wanted = ctx.query.get('date');
        const date = old ? old.date : isDate(wanted) ? wanted : today();
        if (!old && store.diaryOn(date)) {
            location.replace(`#/diary/${store.diaryOn(date).id}/edit${ctx.query.get('from') ? `?from=${ctx.query.get('from')}` : ''}`);
            return;
        }

        el.innerHTML = `
            <section class="card diary-top">
                <div class="section-head">
                    <label class="field date-field">일자 <input id="date" type="date" value="${date}" max="9999-12-31"></label>
                    <p id="date-label" class="date-label"></p>
                </div>
                <div id="todo-summary"></div>
            </section>
            <form id="form" class="card" novalidate>
                <div class="field">오늘의 기분 <span class="hint small">(고르지 않아도 돼요)</span>
                    <div class="seg-group">
                        ${moods.LIST.map(m => `<label class="seg seg-mood"><input type="radio" name="mood" value="${m.key}" ${old && old.mood === m.key ? 'checked' : ''}><span>${m.icon} ${m.label}</span></label>`).join('')}
                    </div>
                </div>
                <label class="field">일기
                    <textarea id="content" rows="12" placeholder="오늘 있었던 일, 느낀 점, 고마운 일을 적어 보세요.">${escapeHtml(old ? old.content : '')}</textarea>
                </label>
                <div class="form-meta"><span id="length" class="hint small"></span></div>
                <p id="message" class="message error" hidden></p>
                <div class="form-actions">
                    <button class="btn btn-primary" type="submit">${old ? '고친 내용 저장' : '일기 저장'}</button>
                    ${old ? '<button id="delete" class="btn-danger-text" type="button">지우기</button>' : ''}
                </div>
            </form>`;

        const $ = sel => el.querySelector(sel);
        const dateInput = $('#date');

        // 그날 할일 요약: 상태별 개수 + 목록 (체크로 바로 완료 표시)
        function renderSummary() {
            const d = dateInput.value;
            const lunarText = App.lunar.label(d);
            $('#date-label').textContent = `${formatDay(d)}${lunarText ? ` · ${lunarText}` : ''}`;
            const list = [];
            store.todos().forEach(t => sch.occurrencesOn(t, d).forEach(o => list.push(o)));
            const order = s => sch.STATUS_ORDER.indexOf(s);
            list.sort((a, b) => order(a.status) - order(b.status) || a.todo.title.localeCompare(b.todo.title));
            const counts = { doing: 0, late: 0, before: 0, done: 0 };
            list.forEach(o => { counts[o.status]++; });
            const percent = list.length ? Math.round(counts.done / list.length * 100) : 0;

            $('#todo-summary').innerHTML = list.length
                ? `<div class="summary-line">
                        <h3>이 날의 할일 <span class="count-badge">${list.length}개</span></h3>
                        <div class="status-row">${sch.STATUS_ORDER.filter(s => counts[s]).map(s => `${statusBadge(s)} <b>${counts[s]}</b>`).join(' ')}</div>
                        ${App.ui.progressBar(percent, `완료 ${percent}%`)}
                   </div>
                   <ol class="summary-list">${list.map(o => `
                        <li class="summary-item">
                            ${o.start <= today() ? checkButton(o) : '<span class="todo-check is-waiting" aria-hidden="true"></span>'}
                            <a href="#/todo/${o.todo.id}/edit"><span class="${o.done ? 'is-done-text' : ''}">${escapeHtml(o.todo.title)}</span></a>
                            ${statusBadge(o.status)}
                        </li>`).join('')}</ol>`
                : `<p class="hint">이 날 할일이 없어요. <a class="text-link" href="#/todos/new?date=${d}">+ 할일 등록</a></p>`;
        }

        function renderLength() {
            const n = $('#content').value.trim().length;
            $('#length').textContent = n ? `${n.toLocaleString()}자` : '';
        }

        dateInput.addEventListener('change', async () => {
            const d = dateInput.value;
            if (!isDate(d)) return;
            const other = store.diaryOn(d);
            if (!old && other) {
                const typed = $('#content').value.trim();
                const ok = !typed || await confirmDialog({
                    title: '그날 일기가 이미 있어요',
                    bodyHtml: `<p>${formatDay(d)} 일기를 열까요? 지금 쓰던 글은 저장되지 않아요.</p>`,
                    confirmText: '그 일기 열기'
                });
                if (!ok) {
                    dateInput.value = dateInput.dataset.prev || date;
                    return;
                }
                location.replace(`#/diary/${other.id}/edit`);
                return;
            }
            dateInput.dataset.prev = d;
            renderSummary();
        });
        $('#content').addEventListener('input', renderLength);
        bindChecks($('#todo-summary'), renderSummary);

        $('#form').addEventListener('submit', async event => {
            event.preventDefault();
            const d = dateInput.value;
            const content = $('#content').value.trim();
            const mood = ($('#form').querySelector('[name="mood"]:checked') || {}).value || '';
            const message = $('#message');
            if (!isDate(d)) {
                message.textContent = '일자를 골라 주세요.';
                message.hidden = false;
                return;
            }
            if (!content) {
                message.textContent = '일기 내용을 적어 주세요.';
                message.hidden = false;
                $('#content').focus();
                return;
            }
            const other = store.diaryOn(d);
            if (old && other && other.id !== old.id) {
                const ok = await confirmDialog({
                    title: '그날 일기가 이미 있어요',
                    bodyHtml: `<p>${formatDay(d)}에 쓴 일기가 있어요. 이 일기로 바꾸면 그날 쓴 일기는 지워져요.</p>`,
                    confirmText: '바꾸기',
                    danger: true
                });
                if (!ok) return;
            }
            const saved = store.saveDiary({ date: d, content, mood }, old && old.id);
            toast(old ? '일기를 고쳤어요.' : '일기를 저장했어요.', { next: true });
            highlight(saved.id);
            App.router.go(back(ctx));
        });

        if (old) {
            $('#delete').addEventListener('click', async () => {
                const ok = await confirmDialog({
                    title: '일기 지우기',
                    bodyHtml: `<p>${formatDay(old.date)} 일기를 지울까요? 지운 일기는 되돌릴 수 없어요.</p>`,
                    confirmText: '지우기',
                    danger: true
                });
                if (!ok) return;
                store.deleteDiary(old.id);
                toast('일기를 지웠어요.', { next: true });
                App.router.go(back(ctx));
            });
        }

        renderSummary();
        renderLength();
        if (!old) $('#content').focus();
    }

    App.route('/diary/new', { title: '일기 쓰기', back, render });
    App.route('/diary/:id/edit', { title: '일기 고치기', back, render });
})();
