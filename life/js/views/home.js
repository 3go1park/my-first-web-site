// 홈 화면: 오늘 할 일, 오늘 일기, 메뉴 (할일 · 일기 · 통계 · 관리)
App.route('/', {
    title: '',
    render(el) {
        const { escapeHtml, today, formatDay, daysBetween, relativeDay } = App.util;
        const { icon, statusBadge, checkButton, bindChecks, toast } = App.ui;
        const store = App.store;
        const sch = App.schedule;
        const now = today();

        // 오늘 걸친 회차 + 못 한 지난 회차(지연)
        const todayList = [];
        store.todos().forEach(t => {
            const state = sch.stateOf(t);
            const on = sch.occurrencesOn(t, now);
            if (on.length) on.forEach(o => todayList.push({ o, state }));
            else if (state.status === 'late') todayList.push({ o: state.focus, state });
        });
        const order = { late: 0, doing: 1, done: 2, before: 3 };
        todayList.sort((a, b) => order[a.o.status] - order[b.o.status] || a.o.end.localeCompare(b.o.end));
        const doneToday = todayList.filter(x => x.o.done).length;
        const lateCount = store.todos().filter(t => sch.stateOf(t).status === 'late').length;

        const diary = store.diaryOn(now);
        const lastBackup = store.settings().lastBackup;
        const hasData = store.todos().length + store.diary().length > 0;
        const cloud = App.cloud.summary();
        const needsBackup = cloud ? cloud.bad || !cloud.lastOk
            : hasData && (!lastBackup || daysBetween(lastBackup, now) >= 7);
        const lunarText = App.lunar.label(now);

        const todoRow = ({ o, state }) => `
            <li class="today-row" data-id="${o.todo.id}">
                ${checkButton(o)}
                <a class="today-main" href="#/todo/${o.todo.id}/edit?from=home">
                    <strong class="${o.done ? 'is-done-text' : ''}">${escapeHtml(o.todo.title)}</strong>
                    <small>${o.status === 'late' ? `${relativeDay(o.end)} 마감` : o.end !== o.start ? `~ ${formatDay(o.end)}` : sch.repeatText(o.todo)}${state.missed && o.status !== 'late' ? ` · 놓친 회차 ${state.missed}` : ''}</small>
                </a>
                ${statusBadge(o.status)}
            </li>`;

        const tile = (href, iconName, label, note = '', extra = '') =>
            `<a class="menu-tile ${extra}" href="${href}">${icon(iconName)}<span>${label}</span>${note ? `<small class="tile-note">${note}</small>` : ''}</a>`;

        el.innerHTML = `
            <header class="home-header">
                <p class="eyebrow">MY DAILY LIFE</p>
                <h1>하루 하루 삶의 기록</h1>
                <p class="lead">${formatDay(now)}${lunarText ? ` · ${lunarText}` : ''}
                    · 오늘 할일 ${todayList.length}개 중 ${doneToday}개 완료${lateCount ? ` · <b class="late-text">지연 ${lateCount}개</b>` : ''}</p>
            </header>

            <div id="install-banner"></div>

            <div class="home-today">
                <section class="card home-section">
                    <div class="section-head">
                        <h2 class="group-title">오늘 할 일</h2>
                        <a class="btn btn-small btn-outline" href="#/todos/new">+ 할일 등록</a>
                    </div>
                    ${todayList.length
                        ? `<ol class="today-list">${todayList.slice(0, 8).map(todoRow).join('')}</ol>
                           ${todayList.length > 8 ? `<a class="text-link" href="#/todos">할일 ${todayList.length}개 모두 보기</a>` : ''}`
                        : `<p class="hint">${store.todos().length ? '오늘 할 일이 없어요. 여유로운 하루예요.' : '할일을 등록하면 오늘 할 일을 여기에 보여 드려요.'}</p>`}
                </section>
                <section class="card home-section">
                    <div class="section-head">
                        <h2 class="group-title">오늘 일기</h2>
                        ${diary ? `<span class="mood-big">${App.moods.icon(diary.mood)}</span>` : ''}
                    </div>
                    ${diary
                        ? `<p class="diary-preview">${escapeHtml(diary.content.slice(0, 160))}${diary.content.length > 160 ? '…' : ''}</p>
                           <a class="btn btn-small btn-outline" href="#/diary/${diary.id}/edit?from=home">${icon('pen')} 이어 쓰기</a>`
                        : `<p class="hint">아직 오늘 일기를 쓰지 않았어요. 오늘 하루를 짧게라도 남겨 보세요.</p>
                           <a class="btn" href="#/diary/new?from=home">${icon('pen')} 오늘 일기 쓰기</a>`}
                </section>
            </div>

            <div class="home-menu">
                <section class="menu-group">
                    <h2 class="group-title">할일</h2>
                    <div class="menu-grid">
                        ${tile('#/todos/new', 'plus', '할일 등록')}
                        ${tile('#/todos', 'check', '할일 내역', `전체 ${store.todos().length}개`)}
                    </div>
                </section>
                <section class="menu-group">
                    <h2 class="group-title">일기</h2>
                    <div class="menu-grid">
                        ${tile('#/diary/new', 'pen', '일기 쓰기', diary ? '오늘 씀' : '오늘은 아직')}
                        ${tile('#/diary', 'book', '일기 내역', `${store.diary().length}편`)}
                    </div>
                </section>
                <section class="menu-group">
                    <h2 class="group-title">통계</h2>
                    <div class="menu-grid">
                        ${tile('#/stats', 'chart', '통계')}
                    </div>
                </section>
                <section class="menu-group">
                    <h2 class="group-title">관리</h2>
                    <div class="menu-grid">
                        ${tile('#/backup', 'save', '백업 · 복원',
                            cloud ? cloud.text : lastBackup ? `마지막 백업 ${relativeDay(lastBackup)}` : '백업한 적 없음',
                            needsBackup ? 'needs-backup' : '')}
                        ${tile('#/install', 'phone', '홈 화면 아이콘', App.install.isStandalone() ? '앱으로 실행 중' : '설치·다시 등록')}
                    </div>
                </section>
            </div>`;

        bindChecks(el);

        // 홈 화면 앱으로 실행 중이 아니면 바로 설치할 수 있게 알려 준다
        const install = App.install;
        const banner = el.querySelector('#install-banner');
        function renderBanner() {
            if (install.isStandalone() || install.justInstalled()) {
                banner.innerHTML = '';
                return;
            }
            banner.innerHTML = `
                <section class="card install-banner">
                    <img src="icons/icon-192.png" alt="" width="56" height="56">
                    <div class="install-text">
                        <strong>앱으로 설치해서 쓰세요</strong>
                        <span class="hint small">${install.canPrompt()
                            ? '홈 화면에 아이콘이 생기고, 주소창 없이 가로 화면으로 열려요.'
                            : '크롬 메뉴(⋮) → <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 누르세요.'}</span>
                    </div>
                    ${install.canPrompt()
                        ? '<button id="install-now" class="btn" type="button">홈 화면에 설치</button>'
                        : '<a class="btn btn-outline" href="#/install">설치 방법</a>'}
                </section>`;
            const button = banner.querySelector('#install-now');
            if (button) button.addEventListener('click', async () => {
                const outcome = await install.prompt();
                if (outcome === 'dismissed') toast('설치를 취소했어요. 언제든 다시 설치할 수 있어요.');
            });
        }
        const stop = install.onChange(() => {
            if (document.body.contains(banner)) renderBanner();
            else stop();
        });
        renderBanner();
    }
});
