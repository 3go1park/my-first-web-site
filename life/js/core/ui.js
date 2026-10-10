// 여러 화면이 함께 쓰는 화면 조각: 상단 막대, 알림(토스트), 상태 표시, 빈 화면 안내, 확인 창, 아이콘
App.ui = (() => {
    const { escapeHtml } = App.util;
    let pendingToast = '';
    let highlightId = '';
    let toastTimer = null;

    // 상단 막대: 뒤로 가기 + 화면 제목 + 홈
    function setTopBar(title, back) {
        const backButton = document.getElementById('topbar-back');
        const homeButton = document.getElementById('topbar-home');
        document.getElementById('topbar-title').textContent = title || '하루 하루 삶의 기록';
        backButton.hidden = !back;
        backButton.href = back ? '#' + back : '#/';
        homeButton.hidden = !back;
    }

    // 알림: 다음 화면에서 보여줄 것은 toast(text, { next: true })
    function toast(text, options = {}) {
        if (options.next) {
            pendingToast = text;
            return;
        }
        const box = document.getElementById('toast');
        box.textContent = text;
        box.hidden = false;
        box.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            box.classList.remove('is-visible');
            setTimeout(() => { box.hidden = true; }, 300);
        }, 3500);
    }

    function showPendingToast() {
        if (pendingToast) toast(pendingToast);
        pendingToast = '';
    }

    // 다음 화면에서 data-id 가 같은 줄을 강조하고 그 줄로 이동한다
    function highlight(id) {
        highlightId = id;
    }

    // 다음 화면에서 강조할 줄 (목록이 그 줄을 숨기지 않게 확인하는 데 씀)
    const pendingHighlight = () => highlightId;

    function consumeHighlight(root) {
        if (!highlightId) return false;
        const row = [...root.querySelectorAll('[data-id]')].find(r => r.dataset.id === highlightId);
        highlightId = '';
        if (!row) return false;
        row.classList.add('is-new');
        requestAnimationFrame(() => row.scrollIntoView({ block: 'center' }));
        return true;
    }

    // 할일 상태 표시 (진행·지연·진행전·완료·미완료). 색과 함께 글자로도 보여 준다.
    function statusBadge(status) {
        return `<em class="status-badge status-${status}">${App.schedule.STATUS[status]}</em>`;
    }

    // 회차 결과 버튼: 비어 있음 → 누르면 완료/미완료를 고른다. ✓ = 완료, ✕ = 미완료
    function checkButton(o, extraClass = '') {
        const label = o.done ? '완료 (눌러서 바꾸기)' : o.missed ? '미완료 (눌러서 바꾸기)' : '완료 또는 미완료로 표시';
        const cls = o.done ? 'is-done' : o.missed ? 'is-missed' : '';
        return `<button type="button" class="todo-check ${cls} ${extraClass}" data-check="${o.todo.id}" data-start="${o.start}" aria-label="${label}" title="${label}">${o.done ? '✓' : o.missed ? '✕' : ''}</button>`;
    }

    // 회차 결과 고르기 창: 'done' | 'missed' | '' (표시 지우기) | null (닫기)
    function chooseResult(t, start, current) {
        const { formatDay } = App.util;
        return new Promise(resolve => {
            const dialog = document.createElement('dialog');
            dialog.className = 'app-dialog result-dialog';
            dialog.innerHTML = `
                <h3>${escapeHtml(t.title)}</h3>
                <p class="hint">${formatDay(start)} 할일을 어떻게 끝낼까요?</p>
                <div class="result-choices">
                    <button type="button" class="result-choice is-done ${current === 'done' ? 'is-current' : ''}" data-result="done"><b>✓</b> 완료<small>정상적으로 했어요</small></button>
                    <button type="button" class="result-choice is-missed ${current === 'missed' ? 'is-current' : ''}" data-result="missed"><b>✕</b> 미완료<small>하지 못하고 끝내요</small></button>
                </div>
                <div class="dialog-actions">
                    ${current ? '<button type="button" class="btn-text" data-result="">표시 지우기</button>' : ''}
                    <button type="button" class="btn btn-outline" data-result="close">닫기</button>
                </div>`;
            document.body.appendChild(dialog);
            const finish = answer => {
                dialog.close();
                dialog.remove();
                resolve(answer);
            };
            dialog.addEventListener('click', event => {
                const button = event.target.closest('[data-result]');
                if (button) finish(button.dataset.result === 'close' ? null : button.dataset.result);
                else if (event.target === dialog) finish(null);
            });
            dialog.addEventListener('cancel', event => {
                event.preventDefault();
                finish(null);
            });
            dialog.showModal();
        });
    }

    // 하위 항목 체크 목록 (그 회차의 것). 아직 시작 전인 회차는 보기만 한다
    function subtaskList(o, { readonly = false } = {}) {
        const subs = o.todo.subtasks || [];
        if (!subs.length) return '';
        const map = (o.todo.subDone && o.todo.subDone[o.start]) || {};
        const locked = readonly || o.start > App.util.today();
        return `<ul class="sub-list">${subs.map(st => {
            const on = Boolean(map[st.id]);
            return `<li><button type="button" class="sub-item ${on ? 'is-on' : ''}" ${locked ? 'disabled' : ''}
                data-sub="${o.todo.id}" data-start="${o.start}" data-sub-id="${st.id}" aria-pressed="${on}">
                <span class="sub-box" aria-hidden="true">${on ? '✓' : ''}</span><span class="sub-title">${escapeHtml(st.title)}</span></button></li>`;
        }).join('')}</ul>`;
    }

    // "2/4" 처럼 하위 항목 진행
    function subProgress(o) {
        return o.sub && o.sub.total ? `<span class="sub-progress ${o.sub.done === o.sub.total ? 'is-full' : ''}">${o.sub.done}/${o.sub.total}</span>` : '';
    }

    // 목록 안의 결과 버튼을 누르면 완료/미완료를 고르고 화면을 다시 그린다.
    // 하위 항목 체크 버튼도 여기서 처리한다.
    function bindChecks(root, after) {
        root.addEventListener('click', async event => {
            const sub = event.target.closest('[data-sub]');
            if (sub) {
                event.preventDefault();
                event.stopPropagation();
                const t = App.store.todo(sub.dataset.sub);
                if (!t) return;
                const checked = sub.getAttribute('aria-pressed') !== 'true';
                const change = App.store.setSubDone(t.id, sub.dataset.start, sub.dataset.subId, checked);
                if (change === 'completed') toast(`하위 항목을 모두 끝냈어요. '${t.title}' 완료!`);
                if (change === 'reopened') toast(`'${t.title}'의 완료를 풀었어요.`);
                if (after) after();
                else App.router.render();
                return;
            }
            const button = event.target.closest('[data-check]');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            const t = App.store.todo(button.dataset.check);
            if (!t) return;
            const start = button.dataset.start;
            const current = App.schedule.resultOf(t, start);
            const result = await chooseResult(t, start, current);
            if (result === null || result === current) return;
            App.store.setResult(t.id, start, result);
            toast(result === 'done' ? `'${t.title}' 완료!` : result === 'missed' ? `'${t.title}'을(를) 미완료로 끝냈어요.` : '표시를 지웠어요.');
            if (after) after();
            else App.router.render();
        });
    }

    function emptyState(text, actions = '') {
        return `<section class="card empty-state"><p class="hint">${text}</p>${actions ? `<div class="button-row">${actions}</div>` : ''}</section>`;
    }

    // 진행 막대 (0~100)
    function progressBar(percent, label = '') {
        return `<div class="progress" role="img" aria-label="진행률 ${percent}%">
            <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
            ${label ? `<span class="progress-label">${escapeHtml(label)}</span>` : ''}
        </div>`;
    }

    // 화면에 맞춘 확인 창. 누른 결과를 true/false 로 돌려준다.
    // bodyHtml 안의 사용자 글자는 부르는 쪽에서 escapeHtml 로 감싼다.
    function confirmDialog({ title, bodyHtml, confirmText = '확인', danger = false }) {
        return new Promise(resolve => {
            const dialog = document.createElement('dialog');
            dialog.className = 'app-dialog';
            dialog.innerHTML = `
                <h3>${escapeHtml(title)}</h3>
                <div class="dialog-body">${bodyHtml}</div>
                <div class="dialog-actions">
                    <button type="button" class="btn btn-outline" data-answer="no">취소</button>
                    <button type="button" class="btn ${danger ? 'btn-danger' : ''}" data-answer="yes">${escapeHtml(confirmText)}</button>
                </div>`;
            document.body.appendChild(dialog);
            const finish = answer => {
                dialog.close();
                dialog.remove();
                resolve(answer);
            };
            dialog.addEventListener('click', event => {
                const button = event.target.closest('[data-answer]');
                if (button) finish(button.dataset.answer === 'yes');
                else if (event.target === dialog) finish(false);   // 바깥을 누르면 취소
            });
            dialog.addEventListener('cancel', event => {             // 뒤로 가기 / Esc
                event.preventDefault();
                finish(false);
            });
            dialog.showModal();
            dialog.querySelector('[data-answer="no"]').focus();
        });
    }

    const ICONS = {
        list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
        check: 'M4 5h16v14H4ZM8 12l3 3 5-6',
        plus: 'M12 5v14M5 12h14',
        download: 'M12 4v12M7 11l5 5 5-5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
        pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
        book: 'M2 5a1 1 0 0 1 1-1h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H3a1 1 0 0 1-1-1ZM22 5a1 1 0 0 0-1-1h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7a1 1 0 0 0 1-1Z',
        calendar: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM8 14h8M8 17.5h5',
        chart: 'M3 3v18h18M8 17v-5M13 17V8M18 17v-9',
        save: 'M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1ZM8 4v5h7V4M8 20v-6h8v6',
        search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.3-4.3',
        phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM11 18h2',
        repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
        camera: 'M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2ZM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
        image: 'M4 5h16v14H4ZM4 16l5-5 4 4 3-3 4 4M15 9h.01'
    };

    function icon(name) {
        return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
    }

    return {
        setTopBar, toast, showPendingToast, highlight, consumeHighlight, pendingHighlight, subtaskList, subProgress, statusBadge, checkButton, bindChecks,
        emptyState, progressBar, icon, confirmDialog
    };
})();
