// 일기 내역: 글자, 기간, 기분, 요일로 찾고, 달마다 묶어서 보여 준다
App.route('/diary', {
    title: '일기 내역',
    back: '/',
    render(el) {
        const { escapeHtml, highlightText, today, formatShort, startOfWeek, addDays, startOfMonth, endOfMonth, addMonths, weekday, WEEKDAYS } = App.util;
        const { emptyState, icon } = App.ui;
        const store = App.store;
        const moods = App.moods;
        const FILTER_KEY = 'dailylife.diaryFilter';
        const now = today();

        if (!store.diary().length) {
            el.innerHTML = emptyState('아직 쓴 일기가 없어요.', '<a class="btn" href="#/diary/new">오늘 일기 쓰기</a>');
            return;
        }

        let saved = {};
        try { saved = JSON.parse(sessionStorage.getItem(FILTER_KEY) || '{}'); } catch (err) { /* 무시 */ }
        const filter = {
            text: saved.text || '',
            period: saved.period || 'all',
            from: saved.from || '',
            to: saved.to || '',
            mood: saved.mood || 'all',
            day: saved.day || 'all',
            sort: saved.sort || 'new'
        };
        const lastMonth = addMonths(startOfMonth(now), -1);
        const PERIODS = {
            all: ['전체', () => ['', '']],
            week: ['이번 주', () => [startOfWeek(now), addDays(startOfWeek(now), 6)]],
            month: ['이번 달', () => [startOfMonth(now), endOfMonth(now)]],
            last: ['지난 달', () => [lastMonth, endOfMonth(lastMonth)]],
            days30: ['최근 30일', () => [addDays(now, -29), now]],
            year: ['올해', () => [now.slice(0, 4) + '-01-01', now.slice(0, 4) + '-12-31']]
        };

        el.innerHTML = `
            <section class="card filter-card">
                <div class="toolbar">
                    <label class="search-box">${icon('search')}
                        <input id="search" type="search" placeholder="일기 내용으로 찾기" value="${escapeHtml(filter.text)}" autocomplete="off">
                    </label>
                    <select id="mood" class="pill-select" aria-label="기분">
                        <option value="all">모든 기분</option>
                        ${moods.LIST.map(m => `<option value="${m.key}">${m.icon} ${m.label}</option>`).join('')}
                        <option value="none">기분 안 고름</option>
                    </select>
                    <select id="day" class="pill-select" aria-label="요일">
                        <option value="all">모든 요일</option>
                        <option value="weekday">평일</option>
                        <option value="weekend">주말</option>
                        ${WEEKDAYS.map((w, i) => `<option value="${i}">${w}요일</option>`).join('')}
                    </select>
                    <select id="sort" class="pill-select" aria-label="정렬">
                        <option value="new">최신순</option>
                        <option value="old">오래된순</option>
                    </select>
                    <a class="btn btn-small" href="#/diary/new">+ 일기 쓰기</a>
                </div>
                <div class="toolbar">
                    <div class="filter-tabs" id="periods">
                        ${Object.entries(PERIODS).map(([k, [label]]) => `<button type="button" class="filter-tab" data-period="${k}">${label}</button>`).join('')}
                    </div>
                    <label class="date-range">
                        <input id="from" type="date" aria-label="기간 시작"> ~
                        <input id="to" type="date" aria-label="기간 끝">
                    </label>
                    <span id="count" class="toolbar-count"></span>
                </div>
            </section>
            <div id="list" class="diary-groups"></div>
            <p id="no-match" class="hint no-match card" hidden>조건에 맞는 일기가 없어요.</p>`;

        const $ = sel => el.querySelector(sel);
        $('#mood').value = filter.mood;
        $('#day').value = filter.day;
        $('#sort').value = filter.sort;
        if (filter.period === 'custom') {
            $('#from').value = filter.from;
            $('#to').value = filter.to;
        }

        function dayMatches(date) {
            const w = weekday(date);
            if (filter.day === 'all') return true;
            if (filter.day === 'weekday') return w >= 1 && w <= 5;
            if (filter.day === 'weekend') return w === 0 || w === 6;
            return w === Number(filter.day);
        }

        function renderList() {
            const text = filter.text.trim().toLowerCase();
            const [from, to] = filter.period === 'custom' ? [filter.from, filter.to] : PERIODS[filter.period][1]();
            const shown = store.diary()
                .filter(d => (!from || d.date >= from) && (!to || d.date <= to))
                .filter(d => filter.mood === 'all' || (filter.mood === 'none' ? !d.mood : d.mood === filter.mood))
                .filter(d => dayMatches(d.date))
                .filter(d => !text || d.content.toLowerCase().includes(text));
            if (filter.sort === 'old') shown.reverse();

            const groups = [];
            shown.forEach(d => {
                const key = d.date.slice(0, 7);
                if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, items: [] });
                groups[groups.length - 1].items.push(d);
            });
            $('#list').innerHTML = groups.map(g => `
                <section class="diary-group">
                    <h2 class="group-title">${g.key.slice(0, 4)}년 ${Number(g.key.slice(5))}월 <span class="count-badge">${g.items.length}편</span></h2>
                    <ol class="diary-list">${g.items.map(d => `
                        <li><a class="card diary-card" href="#/diary/${d.id}/edit" data-id="${d.id}">
                            <div class="diary-card-head">
                                <strong>${formatShort(d.date)}</strong>
                                <span class="hint small">${App.lunar.label(d.date)}</span>
                                ${d.mood ? `<span class="mood-tag">${moods.icon(d.mood)} ${moods.label(d.mood)}</span>` : ''}
                            </div>
                            <p class="diary-text">${highlightText(text ? d.content : d.content.slice(0, 300) + (d.content.length > 300 ? '…' : ''), filter.text.trim())}</p>
                        </a></li>`).join('')}
                    </ol>
                </section>`).join('');
            $('#no-match').hidden = shown.length > 0;
            $('#count').textContent = `${shown.length}편`;

            el.querySelectorAll('[data-period]').forEach(b => b.classList.toggle('is-active', b.dataset.period === filter.period));
            if (filter.period !== 'custom') {
                $('#from').value = from;
                $('#to').value = to;
            }
            sessionStorage.setItem(FILTER_KEY, JSON.stringify(filter));
        }

        $('#search').addEventListener('input', () => { filter.text = $('#search').value; renderList(); });
        ['mood', 'day', 'sort'].forEach(name => $('#' + name).addEventListener('change', () => { filter[name] = $('#' + name).value; renderList(); }));
        $('#periods').addEventListener('click', event => {
            const b = event.target.closest('[data-period]');
            if (!b) return;
            filter.period = b.dataset.period;
            renderList();
        });
        ['#from', '#to'].forEach(sel => $(sel).addEventListener('change', () => {
            filter.period = 'custom';
            filter.from = $('#from').value;
            filter.to = $('#to').value;
            renderList();
        }));
        renderList();
    }
});
