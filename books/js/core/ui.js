// 여러 화면이 함께 쓰는 화면 조각: 상단 막대, 알림(토스트), 상태 표시, 빈 화면 안내, 아이콘
App.ui = (() => {
    const { escapeHtml } = App.util;
    let pendingToast = '';
    let highlightId = '';
    let toastTimer = null;

    // 상단 막대: 뒤로 가기 + 화면 제목 + 홈
    function setTopBar(title, back) {
        const backButton = document.getElementById('topbar-back');
        const homeButton = document.getElementById('topbar-home');
        document.getElementById('topbar-title').textContent = title || '책읽는 삶의 재미';
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

    function consumeHighlight(root) {
        if (!highlightId) return false;
        const row = [...root.querySelectorAll('[data-id]')].find(r => r.dataset.id === highlightId);
        highlightId = '';
        if (!row) return false;
        row.classList.add('is-new');
        requestAnimationFrame(() => row.scrollIntoView({ block: 'center' }));
        return true;
    }

    function statusBadge(status) {
        return `<em class="status-badge status-${status}">${App.store.STATUS[status]}</em>`;
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

    // 별점 (보기 전용)
    function stars(rating) {
        const n = Number(rating) || 0;
        if (!n) return '';
        return `<span class="stars" aria-label="별점 ${n}점">${'★'.repeat(n)}<span class="stars-off">${'★'.repeat(5 - n)}</span></span>`;
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

    // 책을 지우기 전에 묻는다. 독서 일지가 있는 책은 따로 모아 보여 준다.
    function confirmBookDelete(ids) {
        const store = App.store;
        const books = ids.map(id => store.book(id)).filter(Boolean);
        const withJournal = books.map(b => ({ book: b, count: store.entriesOf(b.id).length })).filter(x => x.count);
        const records = books.filter(b => store.record(b.id)).length;
        const entryTotal = withJournal.reduce((n, x) => n + x.count, 0);
        const names = list => list.map(b => `<li>${escapeHtml(b.no)}. ${escapeHtml(b.title)}</li>`).join('');

        let bodyHtml = books.length === 1
            ? `<p><b>'${escapeHtml(books[0].title)}'</b>을(를) 지울까요?</p>`
            : `<p><b>${books.length}권</b>을 지울까요?</p><ul class="dialog-list">${names(books.slice(0, 5))}${books.length > 5 ? `<li class="hint">외 ${books.length - 5}권</li>` : ''}</ul>`;
        if (withJournal.length) {
            bodyHtml += `
                <div class="dialog-warn">
                    <p><b>⚠️ 독서 일지가 있는 책 ${withJournal.length}권</b> (일지 ${entryTotal}개)</p>
                    <ul class="dialog-list">${withJournal.map(x => `<li>${escapeHtml(x.book.title)} — <b>일지 ${x.count}개</b></li>`).join('')}</ul>
                    <p class="hint">일지 글은 지우지 않고 남겨 둬요. 독서 일지에서 "책 없이 쓴 일지"로 볼 수 있어요.</p>
                </div>`;
        }
        if (records) bodyHtml += `<p class="hint">읽기 기록 ${records}개도 함께 지워져요. 지운 책은 되돌릴 수 없어요.</p>`;
        else bodyHtml += '<p class="hint">지운 책은 되돌릴 수 없어요.</p>';

        return confirmDialog({
            title: withJournal.length ? '독서 일지가 있는 책이에요. 정말 지울까요?' : '책 지우기',
            bodyHtml,
            confirmText: books.length === 1 ? '지우기' : `${books.length}권 지우기`,
            danger: true
        });
    }

    const ICONS = {
        list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
        upload: 'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
        download: 'M12 4v12M7 11l5 5 5-5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
        pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
        book: 'M2 5a1 1 0 0 1 1-1h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H3a1 1 0 0 1-1-1ZM22 5a1 1 0 0 0-1-1h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7a1 1 0 0 0 1-1Z',
        calendar: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM8 14h8M8 17.5h5',
        chart: 'M3 3v18h18M8 17v-5M13 17V8M18 17v-9',
        save: 'M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1ZM8 4v5h7V4M8 20v-6h8v6',
        search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.3-4.3',
        camera: 'M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2ZM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
        image: 'M4 5h16v14H4ZM4 16l5-5 4 4 3-3 4 4M15 9h.01',
        phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM11 18h2'
    };

    function icon(name) {
        return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
    }

    return {
        setTopBar, toast, showPendingToast, highlight, consumeHighlight,
        statusBadge, emptyState, progressBar, stars, icon, confirmDialog, confirmBookDelete
    };
})();
