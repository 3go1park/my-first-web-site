// 일기 쓰기 · 고치기: 날짜(오늘 기본)를 고르면 그날 할일 요약을 위에 보여 주고, 아래에 일기를 쓴다.
// 일기는 하루에 하나. 이미 쓴 날을 고르면 그 일기를 연다.
(() => {
    const back = ctx => (ctx.query.get('from') === 'home' ? '/' : '/diary');

    function render(el, ctx) {
        const { escapeHtml, today, formatDay, isDate } = App.util;
        const { toast, statusBadge, confirmDialog, highlight } = App.ui;
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
                <div class="form-meta">
                    <p id="draft-note" class="draft-note" hidden>저장하지 않고 나갔던 글을 되살렸어요.
                        <button id="draft-drop" class="btn-text" type="button">되살린 글 버리기</button></p>
                    <span id="length" class="hint small"></span>
                </div>
                <p id="message" class="message error" hidden></p>
                <div class="form-actions">
                    <button class="btn btn-primary" type="submit">${old ? '고친 내용 저장' : '일기 저장'}</button>
                    ${old ? '<button id="delete" class="btn-danger-text" type="button">지우기</button>' : ''}
                </div>
            </form>`;

        const $ = sel => el.querySelector(sel);
        const dateInput = $('#date');

        // 그날 할일: 완료 / 미완료만 보여 주고, 누르면 일기 맨 앞에 넣는다 (다시 누르면 뺀다).
        // 넣었는지는 일기 글에 그 줄이 있는지로 판단한다 (직접 지워도 맞게 보인다).
        let shown = [];
        const doneOf = o => o.done;
        const subText = o => (o.sub && o.sub.total ? `, ${o.sub.done}/${o.sub.total}` : '');
        const lineOf = o => (doneOf(o) ? `✓ ${o.todo.title} (완료${subText(o)})` : `✕ ${o.todo.title} (미완료${subText(o)})`);
        // 예전 모양의 줄도 같은 할일로 본다 (✓ 제목 / ✕ 제목 (미완료) / · 제목 (상태))
        const isLineOf = (line, o) => {
            const t = o.todo.title;
            return line === `✓ ${t}` || [`✓ ${t} (`, `✕ ${t} (`, `· ${t} (`].some(p => line.startsWith(p));
        };
        const isTodoLine = line => /^(✓|✕|·) /.test(line);
        // 일기 맨 앞의 할일 줄 묶음과 나머지 글로 나눈다
        function splitContent(text) {
            const lines = text.split('\n');
            let n = 0;
            while (n < lines.length && isTodoLine(lines[n])) n++;
            return { head: lines.slice(0, n), rest: lines.slice(n).join('\n').replace(/^\n+/, '') };
        }
        const included = o => splitContent($('#content').value).head.some(line => isLineOf(line, o));

        function renderSummary() {
            const d = dateInput.value;
            const lunarText = App.lunar.label(d);
            $('#date-label').textContent = `${formatDay(d)}${lunarText ? ` · ${lunarText}` : ''}`;
            const list = [];
            store.todos().forEach(t => sch.occurrencesOn(t, d).forEach(o => list.push(o)));
            list.sort((a, b) => Number(doneOf(b)) - Number(doneOf(a)) || a.todo.title.localeCompare(b.todo.title));
            shown = list;
            const done = list.filter(doneOf).length;
            const percent = list.length ? Math.round(done / list.length * 100) : 0;
            const allIn = list.length > 0 && list.every(included);

            $('#todo-summary').innerHTML = list.length
                ? `<div class="summary-line">
                        <h3>이 날의 할일 <span class="count-badge">${list.length}개</span></h3>
                        <div class="status-row">${statusBadge('done')} <b>${done}</b> ${statusBadge('missed')} <b>${list.length - done}</b></div>
                        ${App.ui.progressBar(percent, `완료 ${percent}%`)}
                   </div>
                   <div class="pick-bar">
                        <p class="hint small">할일을 누르면 일기 맨 앞에 넣고, 다시 누르면 빼요.</p>
                        <button id="pick-all" class="btn btn-small btn-outline" type="button">${allIn ? '모두 빼기' : '모두 넣기'}</button>
                   </div>
                   <ol class="summary-list">${list.map((o, i) => {
                        const on = included(o);
                        return `
                        <li class="summary-item ${on ? 'is-picked' : ''}">
                            <button type="button" class="pick-todo" data-pick="${i}" aria-pressed="${on}">
                                <span class="pick-box" aria-hidden="true">${on ? '✓' : ''}</span>
                                <span>${escapeHtml(o.todo.title)} ${App.ui.subProgress(o)}</span>
                            </button>
                            ${statusBadge(doneOf(o) ? 'done' : 'missed')}
                        </li>`;
                   }).join('')}</ol>`
                : `<p class="hint">이 날 할일이 없어요. <a class="text-link" href="#/todos/new?date=${d}">+ 할일 등록</a></p>`;
        }

        // 할일 줄을 넣거나 뺀다 (저장은 "일기 저장"을 눌러야 함)
        function setIncluded(items, on) {
            const textarea = $('#content');
            const { head, rest } = splitContent(textarea.value);
            let next = head.filter(line => !items.some(o => isLineOf(line, o)));
            if (on) next = next.concat(items.map(lineOf));
            textarea.value = next.length ? `${next.join('\n')}\n\n${rest}` : rest;
            renderSummary();
            renderLength();
            textarea.dispatchEvent(new Event('input', { bubbles: true }));   // 쓰던 글 임시 보관
        }

        $('#todo-summary').addEventListener('click', event => {
            const pick = event.target.closest('[data-pick]');
            if (pick) {
                const o = shown[Number(pick.dataset.pick)];
                if (!o) return;
                const on = !included(o);
                setIncluded([o], on);
                toast(on ? `'${o.todo.title}'을(를) 일기에 넣었어요.` : `'${o.todo.title}'을(를) 일기에서 뺐어요.`);
                return;
            }
            if (event.target.closest('#pick-all')) {
                const on = !shown.every(included);
                setIncluded(shown, on);
                toast(on ? `할일 ${shown.length}개를 일기에 넣었어요.` : '할일을 일기에서 모두 뺐어요.');
            }
        });

        // 쓰던 글 임시 보관: 저장하지 않고 화면을 벗어나거나 앱이 닫혀도 다음에 되살린다
        const DRAFT_KEY = 'dailylife.diaryDraft';
        const draftId = old ? `id:${old.id}` : 'new';
        const savedContent = old ? old.content : '';
        const savedMood = old ? old.mood || '' : '';
        const readDrafts = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}; } catch (err) { return {}; } };
        const writeDrafts = drafts => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)); } catch (err) { /* 공간 부족 */ } };
        const currentMood = () => ($('#form').querySelector('[name="mood"]:checked') || {}).value || '';
        let draftTimer = null;
        function keepDraft() {
            clearTimeout(draftTimer);
            draftTimer = setTimeout(() => {
                const drafts = readDrafts();
                const content = $('#content').value;
                if (content.trim() === savedContent.trim() && currentMood() === savedMood) delete drafts[draftId];
                else drafts[draftId] = { content, mood: currentMood(), date: dateInput.value, at: Date.now() };
                writeDrafts(drafts);
            }, 400);
        }
        function dropDraft() {
            clearTimeout(draftTimer);
            const drafts = readDrafts();
            delete drafts[draftId];
            writeDrafts(drafts);
        }
        const draft = readDrafts()[draftId];
        if (draft && (draft.content.trim() !== savedContent.trim() || (draft.mood || '') !== savedMood)) {
            $('#content').value = draft.content;
            const radio = $('#form').querySelector(`[name="mood"][value="${draft.mood}"]`);
            if (radio) radio.checked = true;
            if (!old && App.util.isDate(draft.date) && !store.diaryOn(draft.date)) dateInput.value = draft.date;
            $('#draft-note').hidden = false;
        }
        $('#draft-drop').addEventListener('click', () => {
            dropDraft();
            $('#content').value = savedContent;
            $('#form').querySelectorAll('[name="mood"]').forEach(r => { r.checked = r.value === savedMood; });
            $('#draft-note').hidden = true;
            renderLength();
        });
        $('#form').addEventListener('input', keepDraft);
        $('#form').addEventListener('change', keepDraft);
        // 일기 맨 앞에 할일을 넣은 것도 임시 보관한다
        $('#todo-summary').addEventListener('click', () => setTimeout(keepDraft, 0));

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
        $('#content').addEventListener('input', () => { renderLength(); renderSummary(); });

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
            dropDraft();
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
                dropDraft();
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
