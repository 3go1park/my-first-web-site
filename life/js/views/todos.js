// 할일 내역: 검색(내용·메모), 상태, 기간, 반복 여부로 걸러 보고, 눌러서 수정한다
App.route('/todos', {
    title: '할일 내역',
    back: '/',
    render(el, ctx) {
        const { escapeHtml, today, formatDay, formatDate, startOfWeek, addDays, startOfMonth, endOfMonth } = App.util;
        const { statusBadge, checkButton, bindChecks, emptyState, icon } = App.ui;
        const store = App.store;
        const sch = App.schedule;
        const FILTER_KEY = 'dailylife.todoFilter';
        const now = today();

        if (!store.todos().length) {
            el.innerHTML = emptyState('아직 등록한 할일이 없어요.', '<a class="btn" href="#/todos/new">+ 할일 등록</a>');
            return;
        }

        let saved = {};
        try { saved = JSON.parse(sessionStorage.getItem(FILTER_KEY) || '{}'); } catch (err) { /* 무시 */ }
        const filter = {
            text: saved.text || '',
            status: ctx.query.get('status') || saved.status || 'all',
            period: saved.period || 'all',
            from: saved.from || '',
            to: saved.to || '',
            kind: saved.kind || 'all',
            sort: saved.sort || 'status'
        };

        const PERIODS = {
            all: ['전체 기간', () => ['', '']],
            today: ['오늘', () => [now, now]],
            week: ['이번 주', () => [startOfWeek(now), addDays(startOfWeek(now), 6)]],
            month: ['이번 달', () => [startOfMonth(now), endOfMonth(now)]],
            next: ['앞으로 30일', () => [now, addDays(now, 29)]]
        };

        el.innerHTML = `
            <section class="card filter-card">
                <div class="toolbar">
                    <label class="search-box">${icon('search')}
                        <input id="search" type="search" placeholder="할일 내용, 메모로 찾기" value="${escapeHtml(filter.text)}" autocomplete="off">
                    </label>
                    <select id="kind" class="pill-select" aria-label="반복">
                        <option value="all">반복 · 한 번 모두</option>
                        <option value="repeat">반복하는 할일</option>
                        <option value="once">한 번 하는 할일</option>
                    </select>
                    <select id="sort" class="pill-select" aria-label="정렬">
                        <option value="status">상태순</option>
                        <option value="start">날짜순</option>
                        <option value="recent">최근 등록순</option>
                    </select>
                    <a class="btn btn-small" href="#/todos/new">+ 할일 등록</a>
                </div>
                <div class="toolbar">
                    <div class="filter-tabs" id="periods">
                        ${Object.entries(PERIODS).map(([k, [label]]) => `<button type="button" class="filter-tab" data-period="${k}">${label}</button>`).join('')}
                    </div>
                    <label class="date-range">
                        <input id="from" type="date" value="${filter.from}" aria-label="기간 시작"> ~
                        <input id="to" type="date" value="${filter.to}" aria-label="기간 끝">
                    </label>
                </div>
                <div class="filter-tabs" id="statuses"></div>
            </section>
            <section class="table-card">
                <div class="todo-row todo-row-head">
                    <span></span><span>할일</span><span class="col-date">일정</span><span class="col-repeat">반복</span><span>상태</span>
                </div>
                <ol id="rows"></ol>
                <p id="no-match" class="hint no-match" hidden>조건에 맞는 할일이 없어요.</p>
            </section>`;

        const $ = sel => el.querySelector(sel);
        $('#kind').value = filter.kind;
        $('#sort').value = filter.sort;

        function renderRows() {
            const text = filter.text.trim().toLowerCase();
            const [from, to] = filter.period === 'custom' ? [filter.from, filter.to] : PERIODS[filter.period][1]();
            const items = store.todos()
                .filter(t => filter.kind === 'all' || (filter.kind === 'once') === (t.count === 1))
                .filter(t => !text || [t.title, t.memo].some(v => v.toLowerCase().includes(text)))
                .filter(t => (!from && !to) || sch.occurrencesIn(t, from || '0000-01-01', to || '9999-12-31').length)
                .map(t => ({ t, state: sch.stateOf(t) }));

            const counts = { all: items.length, doing: 0, late: 0, before: 0, done: 0 };
            items.forEach(x => { counts[x.state.status]++; });
            $('#statuses').innerHTML = ['all', ...sch.STATUS_ORDER].map(s => `
                <button type="button" class="filter-tab status-${s} ${filter.status === s ? 'is-active' : ''}" data-status="${s}">
                    ${s === 'all' ? '전체' : sch.STATUS[s]}<b>${counts[s]}</b></button>`).join('');

            const order = s => sch.STATUS_ORDER.indexOf(s);
            const shown = items
                .filter(x => filter.status === 'all' || x.state.status === filter.status)
                .sort((a, b) => {
                    if (filter.sort === 'recent') return b.t.createdAt - a.t.createdAt;
                    if (filter.sort === 'start') return a.state.focus.start.localeCompare(b.state.focus.start);
                    return order(a.state.status) - order(b.state.status) || a.state.focus.end.localeCompare(b.state.focus.end);
                });

            $('#rows').innerHTML = shown.map(({ t, state }) => {
                const o = state.focus;
                const canCheck = o.start <= now;
                const range = o.end !== o.start ? `${formatDay(o.start)} ~ ${formatDate(o.end)}` : formatDay(o.start);
                const repeating = t.count !== 1;
                return `
                <li><a class="todo-row" href="#/todo/${t.id}/edit" data-id="${t.id}">
                    <span>${canCheck ? checkButton(o) : '<span class="todo-check is-waiting" aria-hidden="true"></span>'}</span>
                    <span class="col-title">
                        <strong class="${state.status === 'done' ? 'is-done-text' : ''}">${escapeHtml(t.title)}</strong>
                        <small class="col-date-inline">${range}</small>
                        <small>${escapeHtml(t.memo) || (repeating ? `완료 ${state.doneCount}회${state.total ? ` / ${state.total}회` : ''}` : '')}</small>
                    </span>
                    <span class="col-date">${repeating ? '<small>이번 회차</small> ' : ''}${range}</span>
                    <span class="col-repeat">${repeating ? icon('repeat') : ''}${sch.repeatText(t)}</span>
                    <span class="col-status">${statusBadge(state.status)}${state.missed && state.status !== 'late' ? `<small class="late-text">놓친 ${state.missed}회</small>` : ''}</span>
                </a></li>`;
            }).join('');
            $('#no-match').hidden = shown.length > 0;

            el.querySelectorAll('[data-period]').forEach(b => b.classList.toggle('is-active', b.dataset.period === filter.period));
            if (filter.period !== 'custom') {
                $('#from').value = from;
                $('#to').value = to;
            }
            sessionStorage.setItem(FILTER_KEY, JSON.stringify(filter));
        }

        $('#search').addEventListener('input', () => { filter.text = $('#search').value; renderRows(); });
        $('#kind').addEventListener('change', () => { filter.kind = $('#kind').value; renderRows(); });
        $('#sort').addEventListener('change', () => { filter.sort = $('#sort').value; renderRows(); });
        $('#periods').addEventListener('click', event => {
            const b = event.target.closest('[data-period]');
            if (!b) return;
            filter.period = b.dataset.period;
            renderRows();
        });
        ['#from', '#to'].forEach(sel => $(sel).addEventListener('change', () => {
            filter.period = 'custom';
            filter.from = $('#from').value;
            filter.to = $('#to').value;
            renderRows();
        }));
        $('#statuses').addEventListener('click', event => {
            const b = event.target.closest('[data-status]');
            if (!b) return;
            filter.status = b.dataset.status;
            renderRows();
        });
        bindChecks($('#rows'), renderRows);
        renderRows();
    }
});
