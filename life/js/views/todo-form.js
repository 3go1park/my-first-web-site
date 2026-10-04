// 할일 등록 · 수정: 내용, 시작일·종료일, 반복(주기·횟수·양력/음력), 회차별 완료 표시
(() => {
    const back = ctx => (ctx.query.get('from') === 'home' ? '/' : '/todos');

    function render(el, ctx) {
        const { escapeHtml, today, formatDay, weekday, WEEKDAYS } = App.util;
        const { toast, statusBadge, checkButton, bindChecks, confirmDialog, highlight } = App.ui;
        const store = App.store;
        const sch = App.schedule;
        const lunar = App.lunar;

        const id = ctx.params.id;
        const old = id ? store.todo(id) : null;
        if (id && !old) {
            el.innerHTML = App.ui.emptyState('지워졌거나 없는 할일이에요.', '<a class="btn btn-outline" href="#/todos">할일 내역으로</a>');
            return;
        }
        const now = today();
        const start = ctx.query.get('date') || now;
        const t = old || { title: '', memo: '', start, end: start, repeat: 'daily', weekdays: [], count: 1, calendar: 'solar', done: {} };
        const radio = (name, value, label, checked) =>
            `<label class="seg"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;

        el.innerHTML = `
            <form id="form" class="todo-layout" novalidate>
                <section class="card">
                    <label class="field">할일 내용
                        <input id="title" type="text" maxlength="200" placeholder="예) 아침 산책 30분" value="${escapeHtml(t.title)}" required>
                    </label>
                    <label class="field">메모 <span class="hint small">(적지 않아도 돼요)</span>
                        <textarea id="memo" rows="2" placeholder="자세한 내용">${escapeHtml(t.memo)}</textarea>
                    </label>
                    <div class="form-grid form-grid-2">
                        <label class="field">시작일 <input id="start" type="date" value="${t.start}" required></label>
                        <label class="field">종료일 <input id="end" type="date" value="${t.end}" required></label>
                    </div>
                    <p id="date-note" class="hint small"></p>

                    <div class="field">반복 주기
                        <div class="seg-group">
                            ${Object.entries(sch.REPEAT).map(([k, v]) => radio('repeat', k, v, t.repeat === k)).join('')}
                        </div>
                    </div>
                    <div id="weekday-field" class="field">요일 선택
                        <div class="seg-group">
                            ${WEEKDAYS.map((w, i) => `<label class="seg seg-day ${i === 0 ? 'is-sun' : i === 6 ? 'is-sat' : ''}"><input type="checkbox" name="weekday" value="${i}" ${t.weekdays.includes(i) ? 'checked' : ''}><span>${w}</span></label>`).join('')}
                        </div>
                    </div>
                    <div class="form-grid form-grid-2">
                        <div class="field">반복 횟수
                            <div class="seg-group">
                                ${radio('countMode', 'forever', '계속', t.count === 0)}
                                ${radio('countMode', 'times', '횟수', t.count !== 0)}
                                <label class="count-input"><input id="count" type="number" min="1" max="9999" inputmode="numeric" value="${t.count || 1}"> 회</label>
                            </div>
                        </div>
                        <div class="field">반복 기준
                            <div class="seg-group">
                                ${radio('calendar', 'solar', '양력', t.calendar !== 'lunar')}
                                ${radio('calendar', 'lunar', '음력', t.calendar === 'lunar')}
                            </div>
                        </div>
                    </div>
                    <p id="repeat-note" class="hint small"></p>
                    <p id="message" class="message error" hidden></p>
                    <div class="form-actions">
                        <button class="btn btn-primary" type="submit">${old ? '수정 저장' : '할일 등록'}</button>
                        ${old ? '<button id="delete" class="btn-danger-text" type="button">지우기</button>' : ''}
                    </div>
                </section>

                <section class="card">
                    <div class="section-head">
                        <h3>일정 미리보기</h3>
                        <span id="state"></span>
                    </div>
                    <p id="summary" class="hint"></p>
                    <div id="preview"></div>
                </section>
            </form>`;

        const form = el.querySelector('#form');
        const $ = sel => el.querySelector(sel);
        const value = name => (form.querySelector(`[name="${name}"]:checked`) || {}).value;

        // 화면의 값으로 할일 모양을 만든다 (저장 전 미리보기용)
        function current() {
            const startValue = $('#start').value || now;
            let weekdays = [...form.querySelectorAll('[name="weekday"]:checked')].map(c => Number(c.value));
            return {
                id: old ? old.id : 'preview',
                title: $('#title').value.trim(),
                memo: $('#memo').value.trim(),
                start: startValue,
                end: $('#end').value && $('#end').value >= startValue ? $('#end').value : startValue,
                repeat: value('repeat'),
                weekdays,
                count: value('countMode') === 'forever' ? 0 : Math.max(1, parseInt($('#count').value, 10) || 1),
                calendar: value('calendar'),
                done: old ? store.todo(old.id).done : {}
            };
        }

        function refresh() {
            const c = current();
            const repeat = c.repeat;
            const once = c.count === 1;
            $('#weekday-field').hidden = repeat !== 'weekly';
            $('#count').disabled = value('countMode') === 'forever';
            form.querySelectorAll('[name="calendar"]').forEach(r => { r.disabled = !['monthly', 'yearly'].includes(repeat) || once; });
            const days = c.end === c.start ? '하루' : `${App.util.daysBetween(c.start, c.end) + 1}일 동안`;
            $('#date-note').textContent = `${formatDay(c.start)}${lunar.supported() ? ` (${lunar.label(c.start)})` : ''} 부터 ${days}`;

            let note = once ? '횟수가 1회면 반복하지 않고 한 번만 해요. 반복하려면 횟수를 늘리거나 "계속"을 고르세요.' : '';
            if (!once && repeat === 'weekly' && !c.weekdays.length) note = `요일을 고르지 않으면 시작일 요일(${WEEKDAYS[weekday(c.start)]})마다 반복해요.`;
            if (!once && ['daily', 'weekly'].includes(repeat)) note += (note ? ' ' : '') + '양력·음력은 매월·매년 반복에서만 달라져요.';
            if (!once && c.calendar === 'lunar' && ['monthly', 'yearly'].includes(repeat)) {
                const l = lunar.fromSolar(c.start);
                note = lunar.supported()
                    ? `음력 ${repeat === 'yearly' ? `${l.month}월 ` : ''}${l.day}일마다 반복해요. 그달에 그 날이 없으면 마지막 날에 해요.`
                    : '이 브라우저는 음력 계산을 못 해서 양력으로 반복해요.';
            }
            $('#repeat-note').textContent = note;

            // 미리보기: 오늘까지의 회차(최근 10개) + 다가올 회차 5개
            const list = sch.occurrences(c, now, 5);
            const past = list.filter(o => o.start <= now).slice(-10);
            const future = list.filter(o => o.start > now);
            const hidden = list.filter(o => o.start <= now).length - past.length;
            const row = o => `
                <li class="occ-row">
                    ${old && o.start <= now ? checkButton(o) : '<span class="occ-dot"></span>'}
                    <span class="occ-date">${formatDay(o.start)}${o.end !== o.start ? ` ~ ${formatDay(o.end)}` : ''}${c.calendar === 'lunar' && !once && ['monthly', 'yearly'].includes(repeat) ? `<small>${lunar.label(o.start)}</small>` : ''}</span>
                    ${statusBadge(o.status)}
                </li>`;
            $('#preview').innerHTML = `
                ${hidden ? `<p class="hint small">앞선 회차 ${hidden}개는 줄였어요.</p>` : ''}
                ${past.length ? `<ol class="occ-list">${past.map(row).join('')}</ol>` : ''}
                ${future.length ? `<p class="occ-head">다가올 일정</p><ol class="occ-list">${future.map(row).join('')}</ol>` : ''}
                ${old ? '<p class="hint small">✓ 버튼을 눌러 회차마다 완료를 표시해요. 다가올 회차는 그날이 되면 표시할 수 있어요.</p>' : ''}`;

            const total = c.count ? `전체 ${c.count}회` : '끝없이 반복';
            $('#summary').textContent = `${sch.repeatText(c)} — ${total}`;
            if (old) {
                const state = sch.stateOf({ ...c, done: store.todo(old.id).done });
                $('#state').innerHTML = statusBadge(state.status);
                if (state.missed) $('#summary').textContent += ` · 놓친 회차 ${state.missed}개`;
            }
        }

        $('#start').addEventListener('change', () => {
            // 시작일을 바꾸면 기간 길이는 그대로 두고 종료일을 따라 옮긴다
            const prev = $('#start').dataset.prev || t.start;
            const len = Math.max(0, App.util.daysBetween(prev, $('#end').value || prev));
            if ($('#start').value) $('#end').value = App.util.addDays($('#start').value, len);
            $('#start').dataset.prev = $('#start').value;
            refresh();
        });
        form.addEventListener('input', refresh);
        form.addEventListener('change', refresh);
        if (old) bindChecks($('#preview'), refresh);

        form.addEventListener('submit', event => {
            event.preventDefault();
            const c = current();
            const message = $('#message');
            if (!c.title) {
                message.textContent = '할일 내용을 적어 주세요.';
                message.hidden = false;
                $('#title').focus();
                return;
            }
            if ($('#end').value && $('#end').value < c.start) {
                message.textContent = '종료일은 시작일과 같거나 뒤여야 해요.';
                message.hidden = false;
                return;
            }
            const saved = store.saveTodo(c, old && old.id);
            toast(old ? '할일을 고쳤어요.' : '할일을 등록했어요.', { next: true });
            highlight(saved.id);
            App.router.go(back(ctx));
        });

        if (old) {
            $('#delete').addEventListener('click', async () => {
                const doneCount = Object.keys(store.todo(old.id).done).length;
                const ok = await confirmDialog({
                    title: '할일 지우기',
                    bodyHtml: `<p><b>'${escapeHtml(old.title)}'</b>을(를) 지울까요?</p>
                        <p class="hint">${doneCount ? `완료 표시한 ${doneCount}회의 기록도 함께 지워져요. ` : ''}지운 할일은 되돌릴 수 없어요.</p>`,
                    confirmText: '지우기',
                    danger: true
                });
                if (!ok) return;
                store.deleteTodo(old.id);
                toast('할일을 지웠어요.', { next: true });
                App.router.go(back(ctx));
            });
        } else {
            $('#title').focus();
        }
        refresh();
    }

    App.route('/todos/new', { title: '할일 등록', back, render });
    App.route('/todo/:id/edit', { title: '할일 수정', back, render });
})();
