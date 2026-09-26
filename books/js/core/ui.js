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

    const ICONS = {
        list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
        upload: 'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
        download: 'M12 4v12M7 11l5 5 5-5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
        pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
        book: 'M2 5a1 1 0 0 1 1-1h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H3a1 1 0 0 1-1-1ZM22 5a1 1 0 0 0-1-1h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7a1 1 0 0 0 1-1Z',
        calendar: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM8 14h8M8 17.5h5',
        chart: 'M3 3v18h18M8 17v-5M13 17V8M18 17v-9',
        save: 'M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1ZM8 4v5h7V4M8 20v-6h8v6',
        search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.3-4.3'
    };

    function icon(name) {
        return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
    }

    return {
        setTopBar, toast, showPendingToast, highlight, consumeHighlight,
        statusBadge, emptyState, progressBar, stars, icon
    };
})();
