// 할일 등록 · 수정: 내용, 시작일·종료일, 반복(없음·매일·매주·매월·매년, 양력/음력), 회차별 결과(완료·미완료)
(() => {
    const back = ctx => (ctx.query.get('from') === 'home' ? '/' : '/todos');

    function render(el, ctx) {
        const { escapeHtml, today, formatDay, weekday, addDays, addMonths, daysBetween, WEEKDAYS } = App.util;
        const { toast, statusBadge, checkButton, bindChecks, confirmDialog, highlight, subtaskList, subProgress } = App.ui;
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
        const start = App.util.isDate(ctx.query.get('date')) ? ctx.query.get('date') : now;
        const t = old || { title: '', memo: '', start, end: start, repeat: 'none', weekdays: [], endless: false, calendar: 'solar', subtasks: [] };
        // 하위 항목 (화면에서 고치는 중인 목록)
        let subs = (t.subtasks || []).map(st => ({ ...st }));
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

                    <div class="field">하위 항목 <span class="hint small">(할일 안의 작은 항목. 각각 체크하고, 모두 끝내면 할일이 완료돼요)</span>
                        <ol id="sub-editor" class="sub-editor"></ol>
                        <div class="sub-add">
                            <input id="sub-new" type="text" maxlength="100" placeholder="항목을 적고 추가 (예: 이력서 보내기)" autocomplete="off">
                            <button id="sub-add" class="btn btn-small btn-outline" type="button">추가</button>
                        </div>
                        <div class="sub-quick">
                            <input id="sub-count" type="number" min="2" max="50" inputmode="numeric" value="${(t.title.match(/(\d+)\s*회/) || [])[1] || 4}" aria-label="몇 회">
                            <button id="sub-make" class="btn-text" type="button">1회 ~ N회 항목 만들기</button>
                        </div>
                    </div>

                    <div class="field">반복
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
                        <label class="field">시작일 <input id="start" type="date" value="${t.start}" required></label>
                        <label class="field"><span id="end-label">종료일</span> <input id="end" type="date" value="${t.end}" required></label>
                    </div>
                    <div id="end-tools" class="seg-group end-tools">
                        <label class="seg"><input id="endless" type="checkbox" ${t.endless ? 'checked' : ''}><span>종료일 없이 계속</span></label>
                        <button type="button" class="btn-text" data-end="1m">+1개월</button>
                        <button type="button" class="btn-text" data-end="3m">+3개월</button>
                        <button type="button" class="btn-text" data-end="1y">+1년</button>
                    </div>
                    <p id="date-note" class="hint small"></p>

                    <div id="calendar-field" class="field">반복 기준
                        <div class="seg-group">
                            ${radio('calendar', 'solar', '양력', t.calendar !== 'lunar')}
                            ${radio('calendar', 'lunar', '음력', t.calendar === 'lunar')}
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
                    <div id="overdue-bar" class="overdue-bar" hidden></div>
                    <div id="current-subs" class="current-subs" hidden></div>
                    <div id="preview"></div>
                </section>
            </form>`;

        const form = el.querySelector('#form');
        const $ = sel => el.querySelector(sel);
        const value = name => (form.querySelector(`[name="${name}"]:checked`) || {}).value;

        // 화면의 값으로 할일 모양을 만든다 (저장 전 미리보기용)
        function current() {
            const startValue = App.util.isDate($('#start').value) ? $('#start').value : now;
            const endValue = App.util.isDate($('#end').value) ? $('#end').value : startValue;
            const repeat = value('repeat') || 'none';
            const saved = old ? store.todo(old.id) : null;
            return {
                id: old ? old.id : 'preview',
                title: $('#title').value.trim(),
                memo: $('#memo').value.trim(),
                start: startValue,
                end: endValue >= startValue ? endValue : startValue,
                repeat,
                weekdays: [...form.querySelectorAll('[name="weekday"]:checked')].map(c => Number(c.value)),
                endless: repeat !== 'none' && $('#endless').checked,
                calendar: value('calendar') || 'solar',
                done: saved ? saved.done : {},
                missed: saved ? saved.missed : {},
                subtasks: subs.filter(st => st.title.trim()).map(st => ({ id: st.id, title: st.title.trim() })),
                subDone: saved ? saved.subDone : {}
            };
        }

        // 하위 항목 편집 목록
        function renderSubs() {
            $('#sub-editor').innerHTML = subs.map((st, i) => `
                <li class="sub-edit-row">
                    <span class="sub-no">${i + 1}</span>
                    <input type="text" maxlength="100" value="${escapeHtml(st.title)}" data-sub-edit="${i}" aria-label="하위 항목 ${i + 1}">
                    <button type="button" class="btn-text danger" data-sub-del="${i}" aria-label="지우기">지우기</button>
                </li>`).join('');
        }
        function addSub(title) {
            const text = title.trim();
            if (!text) return;
            subs.push({ id: App.util.uid(), title: text });
            renderSubs();
            refresh();
        }
        $('#sub-add').addEventListener('click', () => {
            addSub($('#sub-new').value);
            $('#sub-new').value = '';
            $('#sub-new').focus();
        });
        $('#sub-new').addEventListener('keydown', event => {
            if (event.key !== 'Enter' || event.isComposing) return;
            event.preventDefault();
            $('#sub-add').click();
        });
        $('#sub-make').addEventListener('click', () => {
            const n = Math.max(2, Math.min(50, parseInt($('#sub-count').value, 10) || 0));
            if (!n) return;
            for (let i = 1; i <= n; i++) subs.push({ id: App.util.uid(), title: `${i}회` });
            renderSubs();
            refresh();
            toast(`하위 항목 1회 ~ ${n}회를 만들었어요.`);
        });
        $('#sub-editor').addEventListener('input', event => {
            const i = event.target.dataset.subEdit;
            if (i === undefined) return;
            subs[Number(i)].title = event.target.value;
        });
        // 하위 항목 칸에서 Enter 를 눌러도 할일이 저장되지 않게 한다
        $('#sub-editor').addEventListener('keydown', event => {
            if (event.key === 'Enter') event.preventDefault();
        });
        $('#sub-editor').addEventListener('click', event => {
            const del = event.target.closest('[data-sub-del]');
            if (!del) return;
            subs.splice(Number(del.dataset.subDel), 1);
            renderSubs();
            refresh();
        });

        function refresh() {
            const c = current();
            const repeating = c.repeat !== 'none';
            $('#weekday-field').hidden = c.repeat !== 'weekly';
            $('#calendar-field').hidden = !['monthly', 'yearly'].includes(c.repeat);
            $('#end-tools').hidden = !repeating;
            $('#end').disabled = c.endless;
            $('#end-label').textContent = repeating ? '반복 종료일' : '종료일 (마감)';

            const days = daysBetween(c.start, c.end) + 1;
            $('#date-note').textContent = !repeating
                ? `${formatDay(c.start)}${lunar.supported() ? ` (${lunar.label(c.start)})` : ''} 부터 ${days === 1 ? '하루' : `${formatDay(c.end)}까지 ${days}일 동안`}`
                : `${formatDay(c.start)} 부터 ${c.endless ? '종료일 없이 계속' : `${formatDay(c.end)}까지`} 반복해요`;

            let note = '';
            if (c.repeat === 'weekly' && !c.weekdays.length) note = `요일을 고르지 않으면 시작일 요일(${WEEKDAYS[weekday(c.start)]})마다 반복해요.`;
            if (['monthly', 'yearly'].includes(c.repeat)) {
                if (c.calendar === 'lunar') {
                    const l = lunar.fromSolar(c.start);
                    note = lunar.supported()
                        ? `음력 ${c.repeat === 'yearly' ? `${l.month}월 ` : ''}${l.day}일마다 반복해요. 그달에 그 날이 없으면 마지막 날에 해요.`
                        : '이 브라우저는 음력 계산을 못 해서 양력으로 반복해요.';
                } else {
                    note = `${c.repeat === 'yearly' ? `${Number(c.start.slice(5, 7))}월 ` : ''}${Number(c.start.slice(8))}일마다 반복해요. 그달에 그 날이 없으면 마지막 날에 해요.`;
                }
            }
            $('#repeat-note').textContent = note;

            // 미리보기: 오늘까지의 회차(최근 10개) + 다가올 회차 5개
            const list = sch.occurrences(c, now, 5);
            const past = list.filter(o => o.start <= now).slice(-10);
            const future = list.filter(o => o.start > now);
            const hidden = list.filter(o => o.start <= now).length - past.length;
            const showLunar = c.calendar === 'lunar' && ['monthly', 'yearly'].includes(c.repeat);
            const row = o => `
                <li class="occ-row">
                    ${old && o.start <= now ? checkButton(o) : '<span class="occ-dot"></span>'}
                    <span class="occ-date">${formatDay(o.start)}${o.end !== o.start ? ` ~ ${formatDay(o.end)}` : ''}${showLunar ? `<small>${lunar.label(o.start)}</small>` : ''}</span>
                    ${subProgress(o)}
                    ${statusBadge(o.status)}
                </li>`;
            $('#preview').innerHTML = `
                ${hidden ? `<p class="hint small">앞선 회차 ${hidden}개는 줄였어요.</p>` : ''}
                ${past.length ? `<ol class="occ-list">${past.map(row).join('')}</ol>` : ''}
                ${future.length ? `<p class="occ-head">다가올 일정</p><ol class="occ-list">${future.map(row).join('')}</ol>` : ''}
                ${old ? '<p class="hint small">네모 버튼을 눌러 회차마다 <b>완료</b> 또는 <b>미완료</b>로 끝내요. 다가올 회차는 그날이 되면 표시할 수 있어요.</p>' : ''}`;

            $('#summary').textContent = sch.repeatText(c);
            if (old) {
                const state = sch.stateOf(c);
                $('#state').innerHTML = statusBadge(state.status);
                // 이번 회차의 하위 항목 체크 (저장한 하위 항목 기준)
                const savedTodo = store.todo(old.id);
                const focus = savedTodo.subtasks.length ? sch.occurrence(savedTodo, state.focus.start) : null;
                $('#current-subs').hidden = !focus;
                $('#current-subs').innerHTML = focus
                    ? `<p class="occ-head">${formatDay(focus.start)} 하위 항목 ${subProgress(focus)}</p>${subtaskList(focus)}`
                    : '';
                $('#overdue-bar').hidden = !state.overdue;
                $('#overdue-bar').innerHTML = state.overdue ? `
                    <span>결과를 표시하지 않고 지난 회차가 <b>${state.overdue}개</b> 있어요.</span>
                    <button id="close-overdue" class="btn btn-small btn-outline" type="button">모두 미완료로 끝내기</button>` : '';
                if (repeating) $('#summary').textContent += ` · 완료 ${state.doneCount}회 · 미완료 ${state.missedCount}회${state.overdue ? ` · 지연 ${state.overdue}회` : ''}`;
            }
        }

        // 시작일을 바꾸면 기간 길이는 그대로 두고 종료일을 따라 옮긴다
        $('#start').dataset.prev = t.start;
        $('#start').addEventListener('change', () => {
            const prev = $('#start').dataset.prev || t.start;
            const startValue = $('#start').value;
            if (App.util.isDate(startValue) && App.util.isDate(prev)) {
                const len = Math.max(0, daysBetween(prev, App.util.isDate($('#end').value) ? $('#end').value : prev));
                $('#end').value = addDays(startValue, len);
                $('#start').dataset.prev = startValue;
            }
            refresh();
        });
        // 반복을 처음 고르면 종료일을 한 달 뒤로 제안한다 (시작일과 같을 때만)
        form.addEventListener('change', event => {
            if (event.target.name === 'repeat' && event.target.value !== 'none' && $('#end').value === $('#start').value) {
                $('#end').value = addMonths($('#start').value, 1);
            }
            refresh();
        });
        $('#end-tools').addEventListener('click', event => {
            const button = event.target.closest('[data-end]');
            if (!button) return;
            const base = App.util.isDate($('#start').value) ? $('#start').value : now;
            $('#end').value = { '1m': addMonths(base, 1), '3m': addMonths(base, 3), '1y': addMonths(base, 12) }[button.dataset.end];
            $('#endless').checked = false;
            refresh();
        });
        form.addEventListener('input', event => {
            if (event.target.dataset.subEdit === undefined && event.target.id !== 'sub-new') refresh();
        });
        if (old) {
            bindChecks($('#preview'), refresh);
            bindChecks($('#current-subs'), refresh);
            $('#overdue-bar').addEventListener('click', async event => {
                if (!event.target.closest('#close-overdue')) return;
                const starts = sch.occurrences(store.todo(old.id), now).filter(o => o.end < now && !o.result).map(o => o.start);
                const ok = await confirmDialog({
                    title: '지연된 회차 정리',
                    bodyHtml: `<p>결과 없이 지난 <b>${starts.length}개</b> 회차를 모두 <b>미완료</b>로 끝낼까요?</p>
                        <p class="hint">나중에 회차마다 다시 완료로 바꿀 수 있어요.</p>`,
                    confirmText: '미완료로 끝내기'
                });
                if (!ok) return;
                store.markMissed(old.id, starts);
                toast(`${starts.length}개 회차를 미완료로 끝냈어요.`);
                refresh();
            });
        }

        form.addEventListener('submit', event => {
            event.preventDefault();
            const message = $('#message');
            const fail = text => {
                message.textContent = text;
                message.hidden = false;
                message.scrollIntoView({ block: 'center' });
            };
            try {
                const c = current();
                if (!c.title) {
                    $('#title').focus();
                    return fail('할일 내용을 적어 주세요.');
                }
                if (!c.endless && App.util.isDate($('#end').value) && $('#end').value < c.start) {
                    return fail('종료일은 시작일과 같거나 뒤여야 해요.');
                }
                const saved = store.saveTodo(c, old && old.id);
                toast(old ? '할일을 고쳤어요.' : `'${saved.title}'을(를) 등록했어요.`, { next: true });
                highlight(saved.id);
                App.router.go(back(ctx));
            } catch (err) {
                console.error(err);
                fail(`저장하지 못했어요: ${err.message || err}`);
            }
        });

        if (old) {
            $('#delete').addEventListener('click', async () => {
                const cur = store.todo(old.id);
                const marked = Object.keys(cur.done).length + Object.keys(cur.missed).length;
                const ok = await confirmDialog({
                    title: '할일 지우기',
                    bodyHtml: `<p><b>'${escapeHtml(old.title)}'</b>을(를) 지울까요?</p>
                        <p class="hint">${marked ? `완료·미완료로 표시한 ${marked}회의 기록도 함께 지워져요. ` : ''}지운 할일은 되돌릴 수 없어요.</p>`,
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
        renderSubs();
        refresh();
    }

    App.route('/todos/new', { title: '할일 등록', back, render });
    App.route('/todo/:id/edit', { title: '할일 수정', back, render });
})();
